using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LibreHardwareMonitor.Hardware;
using TrayHardwareMonitor.Helpers;

namespace TrayHardwareMonitor.Services;

/// <summary>
/// LibreHardwareMonitor sarmalayıcısı. Donanım taraması arka plan iş parçacığında yapılır;
/// arayüz yalnızca hazır anlık görüntüleri (snapshot) okur, böylece UI asla kilitlenmez.
/// </summary>
public class HardwareMonitorService : IDisposable
{
    private readonly Computer _computer;
    private readonly object _lock = new();
    private bool _isInitialized;
    private int _busy;

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
        _computer = new Computer
        {
            IsCpuEnabled = true,
            IsGpuEnabled = true,
            IsMemoryEnabled = true,
            IsMotherboardEnabled = true,
            IsStorageEnabled = true,
            IsNetworkEnabled = true,
            IsControllerEnabled = true
        };
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

    public ISensor? FindSensor(string? id)
    {
        if (string.IsNullOrEmpty(id)) return null;
        return _sensorIndex.TryGetValue(id, out var sensor) ? sensor : null;
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
            await Task.Run(work).ConfigureAwait(true);
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
        lock (_lock)
        {
            if (!_isInitialized) return;
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
        lock (_lock)
        {
            if (!_isInitialized) return;
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
                    try { hw.Update(); } catch { /* tek cihaz hatası yok sayılır */ }
                }
            }

            LastUpdateDurationMs = sw.ElapsedMilliseconds;
        }
    }

    private static void UpdateHardwareRecursive(IHardware hardware)
    {
        try
        {
            hardware.Update();
        }
        catch
        {
            // Ignore individual hardware sensor update failures
        }

        foreach (var sub in hardware.SubHardware)
        {
            UpdateHardwareRecursive(sub);
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
