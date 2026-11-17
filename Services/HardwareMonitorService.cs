using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Runtime.ExceptionServices;
using System.Security;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LibreHardwareMonitor.Hardware;
using Microsoft.Win32;
using TrayHardwareMonitor.Helpers;

namespace TrayHardwareMonitor.Services;

/// <summary>
/// LibreHardwareMonitor sarmalayıcısı. Donanım taraması arka plan iş parçacığında yapılır;
/// arayüz yalnızca hazır anlık görüntüleri (snapshot) okur, böylece UI asla kilitlenmez.
/// </summary>
public class HardwareMonitorService : IDisposable
{
    private Computer _computer;
    private readonly object _lock = new();
    private bool _isInitialized;
    private bool _isSuspended;
    private int _busy;

    // Donanım arıza ve soğuma yönetimi (AccessViolation veya sürücü çöküşlerinde koruma)
    private readonly ConcurrentDictionary<string, DateTime> _hardwareCooldownUntil = new();
    private int _consecutiveFaultCount;
    private int _resetScheduled;

    // UI tarafından kilitsiz okunan değişmez anlık görüntüler (her güncellemeden sonra yeniden atanır)
    private volatile IHardware[] _hardwareSnapshot = Array.Empty<IHardware>();
    private volatile ISensor[] _sensorSnapshot = Array.Empty<ISensor>();
    private volatile Dictionary<string, ISensor> _sensorIndex = new();

    /// <summary>Son güncellemenin süresi (ms).</summary>
    public long LastUpdateDurationMs { get; private set; }

    public IReadOnlyList<IHardware> HardwareList => _hardwareSnapshot;

    /// <summary>Tüm sensörler (donanım sırası, ardından tür sırası).</summary>
    public IReadOnlyList<ISensor> AllSensors => _sensorSnapshot;

    /// <summary>Donanım ağacı yapısı değiştiğinde artar (yeni cihaz / sensör eklendi vb.).</summary>
    public int StructureVersion { get; private set; }

    public HardwareMonitorService()
    {
        _computer = CreateComputerInstance();
        SystemEvents.PowerModeChanged += OnPowerModeChanged;
    }

    private static Computer CreateComputerInstance() => new()
    {
        IsCpuEnabled = true,
        IsGpuEnabled = true,
        IsMemoryEnabled = true,
        IsMotherboardEnabled = true,
        IsStorageEnabled = true,
        IsNetworkEnabled = true,
        IsControllerEnabled = true
    };

    private void OnPowerModeChanged(object sender, PowerModeChangedEventArgs e)
    {
        if (e.Mode == PowerModes.Suspend)
        {
            _isSuspended = true;
            Debug.WriteLine("[HardwareMonitor] System suspend detected. Pausing polling.");
        }
        else if (e.Mode == PowerModes.Resume)
        {
            Debug.WriteLine("[HardwareMonitor] System resume detected. Scheduling hardware re-initialization.");
            Task.Run(async () =>
            {
                // Grafik ve donanım sürücülerinin uyanıp yeniden bağlanması için kısa bekleme
                await Task.Delay(2500);
                ResetComputer();
                _isSuspended = false;
            });
        }
    }

    public void Initialize()
    {
        lock (_lock)
        {
            if (_isInitialized) return;
            try
            {
                _computer.Open();
                _isInitialized = true;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error opening computer: {ex.Message}");
            }
            RebuildSnapshots();
        }
    }

    /// <summary>
    /// Sürücü çökmesi, D3/uyku uyanması veya native AccessViolation sonrası donanım motorunu baştan başlatır.
    /// </summary>
    public void ResetComputer()
    {
        lock (_lock)
        {
            try
            {
                Debug.WriteLine("[HardwareMonitor] Resetting LibreHardwareMonitor Computer instance...");
                try { _computer.Close(); } catch { }
                _computer = CreateComputerInstance();
                _computer.Open();
                _isInitialized = true;
                _hardwareCooldownUntil.Clear();
                _consecutiveFaultCount = 0;
                _resetScheduled = 0;
                RebuildSnapshots();
                Debug.WriteLine("[HardwareMonitor] LibreHardwareMonitor successfully re-initialized.");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[HardwareMonitor] Failed to reset computer: {ex.Message}");
            }
        }
    }

    public ISensor? FindSensor(string? id)
    {
        if (string.IsNullOrEmpty(id)) return null;
        return _sensorIndex.TryGetValue(id, out var sensor) ? sensor : null;
    }

    /// <summary>Sensör anlık görüntüsünü _computer kilidi altında güvenli şekilde okur.</summary>
    public T ReadSensors<T>(Func<IReadOnlyList<ISensor>, T> reader)
    {
        lock (_lock)
        {
            return reader(_sensorSnapshot);
        }
    }

    public static string GetId(ISensor sensor) => sensor.Identifier.ToString();

    // ---------------------------------------------------------------- Güncelleme

    /// <summary>Tüm donanımı UI'yi bloklamadan günceller. Başka bir güncelleme sürüyorsa false döner.</summary>
    public Task<bool> UpdateAllAsync() => RunExclusiveAsync(UpdateAllCore);

    /// <summary>Yalnızca verilen sensörlerin ait olduğu donanımları günceller (tepsi modu – minimum kaynak).</summary>
    public Task<bool> UpdateSensorsAsync(IReadOnlyCollection<string> sensorIds) =>
        RunExclusiveAsync(() => UpdateSensorsCore(sensorIds));

    /// <summary>Başlangıçta ilk değerleri almak için senkron tam güncelleme.</summary>
    public void UpdateAllBlocking() => UpdateAllCore();

    private async Task<bool> RunExclusiveAsync(Action work)
    {
        if (Interlocked.Exchange(ref _busy, 1) == 1) return false;
        try
        {
            await Task.Run(work).ConfigureAwait(false);
            return true;
        }
        catch
        {
            return false;
        }
        finally
        {
            Interlocked.Exchange(ref _busy, 0);
        }
    }

    private void UpdateAllCore()
    {
        if (_isSuspended) return;
        lock (_lock)
        {
            if (!_isInitialized || _isSuspended) return;
            var sw = System.Diagnostics.Stopwatch.StartNew();
            foreach (var hardware in _computer.Hardware)
            {
                UpdateHardwareRecursive(hardware);
            }
            RebuildSnapshots();
            LastUpdateDurationMs = sw.ElapsedMilliseconds;
        }
    }

    private void UpdateSensorsCore(IReadOnlyCollection<string> sensorIds)
    {
        if (_isSuspended) return;
        lock (_lock)
        {
            if (!_isInitialized || _isSuspended) return;
            var sw = System.Diagnostics.Stopwatch.StartNew();

            var targets = new HashSet<IHardware>();
            foreach (var id in sensorIds)
            {
                var sensor = FindSensor(id);
                if (sensor != null) targets.Add(sensor.Hardware);
            }

            if (targets.Count == 0)
            {
                // Hiçbir sensör bulunamadıysa (ilk çalıştırma vb.) tam tarama yap
                foreach (var hardware in _computer.Hardware) UpdateHardwareRecursive(hardware);
                RebuildSnapshots();
            }
            else
            {
                foreach (var hw in targets)
                {
                    UpdateHardwareSingle(hw);
                }
            }

            LastUpdateDurationMs = sw.ElapsedMilliseconds;
        }
    }

    [HandleProcessCorruptedStateExceptions]
    [SecurityCritical]
    [MethodImpl(MethodImplOptions.NoInlining)]
    private void UpdateHardwareSingle(IHardware hw)
    {
        if (IsHardwareInCooldown(hw)) return;
        try
        {
            hw.Update();
            ClearHardwareFault(hw);
        }
        catch (AccessViolationException ave)
        {
            RegisterHardwareFault(hw, ave);
        }
        catch (Exception ex)
        {
            RegisterHardwareFault(hw, ex);
        }
    }

    [HandleProcessCorruptedStateExceptions]
    [SecurityCritical]
    [MethodImpl(MethodImplOptions.NoInlining)]
    private void UpdateHardwareRecursive(IHardware hardware)
    {
        if (IsHardwareInCooldown(hardware)) return;

        try
        {
            hardware.Update();
            ClearHardwareFault(hardware);
        }
        catch (AccessViolationException ave)
        {
            RegisterHardwareFault(hardware, ave);
        }
        catch (Exception ex)
        {
            RegisterHardwareFault(hardware, ex);
        }

        foreach (var sub in hardware.SubHardware)
        {
            UpdateHardwareRecursive(sub);
        }
    }

    private bool IsHardwareInCooldown(IHardware hardware)
    {
        string key = hardware.Identifier.ToString();
        if (_hardwareCooldownUntil.TryGetValue(key, out var until))
        {
            if (DateTime.UtcNow < until)
            {
                return true; // Henüz soğuma süresi bitmedi, sürücüyü zorlama
            }
            _hardwareCooldownUntil.TryRemove(key, out _);
        }
        return false;
    }

    private void ClearHardwareFault(IHardware hardware)
    {
        // Tekil arızalı cihazın hatası diğer sağlam bileşenler tarafından maskelenmez
    }

    private void RegisterHardwareFault(IHardware hardware, Exception ex)
    {
        string key = hardware.Identifier.ToString();
        int cooldownSeconds = ex is AccessViolationException ? 20 : 5;
        _hardwareCooldownUntil[key] = DateTime.UtcNow.AddSeconds(cooldownSeconds);

        int faults = Interlocked.Increment(ref _consecutiveFaultCount);
        string faultMsg = $"[HardwareMonitor] Fault on {hardware.HardwareType} ({hardware.Name}): {ex.GetType().Name} - {ex.Message}. Cooldown: {cooldownSeconds}s (Fault #{faults})";
        Debug.WriteLine(faultMsg);

        try
        {
            File.AppendAllText(
                Path.Combine(AppContext.BaseDirectory, "crash.log"),
                $"{DateTime.Now} {faultMsg}\n");
        }
        catch { }

        // Art arda 3 kez native sürücü hatası alınırsa tek-atış kilidiyle motor tazelemeyi tetikle
        if (faults >= 3 && Interlocked.CompareExchange(ref _resetScheduled, 1, 0) == 0)
        {
            Task.Run(async () =>
            {
                await Task.Delay(2000).ConfigureAwait(false);
                ResetComputer();
            });
        }
    }

    /// <summary>_lock altında çağrılmalı.</summary>
    private void RebuildSnapshots()
    {
        var hardware = _computer.Hardware.ToArray();
        var sensors = new List<ISensor>(256);
        foreach (var hw in hardware) CollectSensors(hw, sensors);

        if (sensors.Count == _sensorSnapshot.Length && hardware.Length == _hardwareSnapshot.Length)
        {
            return; // Yapı değişmedi; mevcut anlık görüntüler geçerli (değerler canlı nesnelerden okunur)
        }

        var index = new Dictionary<string, ISensor>(sensors.Count);
        foreach (var s in sensors) index[GetId(s)] = s;

        _hardwareSnapshot = hardware;
        _sensorSnapshot = sensors.ToArray();
        _sensorIndex = index;
        StructureVersion++;
    }

    private static void CollectSensors(IHardware hw, List<ISensor> list)
    {
        list.AddRange(hw.Sensors
            .OrderBy(s => SensorFormat.GetTypeOrder(s.SensorType))
            .ThenBy(s => s.Index));
        foreach (var sub in hw.SubHardware) CollectSensors(sub, list);
    }

    // ---------------------------------------------------------------- Varsayılanlar

    public string? GetDefaultTraySensorId()
    {
        var cpuTemp = FindCpuTemperature();
        if (cpuTemp != null) return GetId(cpuTemp);

        var cpuLoad = FindByName(HardwareType.Cpu, SensorType.Load, "CPU Total");
        return cpuLoad != null ? GetId(cpuLoad) : null;
    }

    public List<string> GetDefaultPinnedIds()
    {
        var result = new List<ISensor?>
        {
            FindCpuTemperature(),
            FindByName(HardwareType.Cpu, SensorType.Load, "CPU Total"),
            FindGpuSensor(SensorType.Temperature, "GPU Core"),
            FindGpuSensor(SensorType.Load, "GPU Core"),
            FindGpuSensor(SensorType.SmallData, "GPU Memory Used"),
            FindByName(HardwareType.Memory, SensorType.Load, "Memory"),
            FindByName(HardwareType.Memory, SensorType.Data, "Memory Used"),
            _sensorSnapshot.FirstOrDefault(s => s.Hardware.HardwareType == HardwareType.Storage && s.SensorType == SensorType.Temperature)
        };

        return result.Where(s => s != null).Select(s => GetId(s!)).Distinct().ToList();
    }

    private ISensor? FindCpuTemperature()
    {
        var temps = _sensorSnapshot
            .Where(s => s.Hardware.HardwareType == HardwareType.Cpu && s.SensorType == SensorType.Temperature)
            .ToList();
        if (temps.Count == 0) return null;

        foreach (var key in new[] { "Package", "Tctl", "Tdie", "Core Average", "Core Max" })
        {
            var match = temps.FirstOrDefault(s => s.Name.Contains(key, StringComparison.OrdinalIgnoreCase));
            if (match != null) return match;
        }
        return temps[0];
    }

    private ISensor? FindByName(HardwareType hwType, SensorType type, string name) =>
        _sensorSnapshot.FirstOrDefault(s => s.Hardware.HardwareType == hwType && s.SensorType == type &&
                                            s.Name.Equals(name, StringComparison.OrdinalIgnoreCase))
        ?? _sensorSnapshot.FirstOrDefault(s => s.Hardware.HardwareType == hwType && s.SensorType == type &&
                                               s.Name.Contains(name, StringComparison.OrdinalIgnoreCase));

    private ISensor? FindGpuSensor(SensorType type, string name)
    {
        // Harici GPU (NVIDIA/AMD) dahili GPU'ya tercih edilir
        foreach (var hwType in new[] { HardwareType.GpuNvidia, HardwareType.GpuAmd, HardwareType.GpuIntel })
        {
            var s = FindByName(hwType, type, name);
            if (s != null) return s;
        }
        return null;
    }

    // ---------------------------------------------------------------- Min/Max & Rapor

    public void ResetMinMax()
    {
        foreach (var sensor in _sensorSnapshot)
        {
            sensor.ResetMin();
            sensor.ResetMax();
        }
    }

    public string GenerateReportText()
    {
        var sb = new StringBuilder();
        sb.AppendLine("=================================================");
        sb.AppendLine(" Tray Hardware Monitor - Donanım Raporu");
        sb.AppendLine($" Tarih: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
        sb.AppendLine("=================================================");
        sb.AppendLine();

        foreach (var hardware in _hardwareSnapshot)
        {
            AppendHardwareReport(sb, hardware, 0);
        }

        return sb.ToString();
    }

    private static void AppendHardwareReport(StringBuilder sb, IHardware hardware, int indent)
    {
        string indentStr = new string(' ', indent * 2);
        sb.AppendLine($"{indentStr}[+] {hardware.Name} ({hardware.HardwareType})");

        var sensorGroups = hardware.Sensors
            .GroupBy(s => s.SensorType)
            .OrderBy(g => SensorFormat.GetTypeOrder(g.Key));
        foreach (var group in sensorGroups)
        {
            sb.AppendLine($"{indentStr}    -- {SensorFormat.GetTypeName(group.Key)} --");
            foreach (var sensor in group)
            {
                string val = SensorFormat.FormatValue(sensor.SensorType, sensor.Value, true);
                string min = SensorFormat.FormatValue(sensor.SensorType, sensor.Min, true);
                string max = SensorFormat.FormatValue(sensor.SensorType, sensor.Max, true);
                sb.AppendLine($"{indentStr}       {sensor.Name,-30} : {val,-12} (Min: {min}, Maks: {max})");
            }
        }

        foreach (var sub in hardware.SubHardware)
        {
            AppendHardwareReport(sb, sub, indent + 1);
        }

        sb.AppendLine();
    }

    public void Dispose()
    {
        SystemEvents.PowerModeChanged -= OnPowerModeChanged;
        lock (_lock)
        {
            if (_isInitialized)
            {
                try
                {
                    _computer.Close();
                }
                catch { }
                _isInitialized = false;
            }
        }
    }
}
