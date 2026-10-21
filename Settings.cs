using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace TrayHardwareMonitor;

public class AppSettings
{
    public int BackgroundIntervalMs { get; set; } = 2000;
    public int DetailIntervalMs { get; set; } = 1000;
    public int HoverDelayMs { get; set; } = 800;
    public bool StartWithWindows { get; set; } = false;
    public bool WebServerEnabled { get; set; } = true;
    public int WebServerPort { get; set; } = 8085;

    /// <summary>Tepsi simgesinde gösterilecek sensörün kimliği (LHM Identifier). Null ise varsayılan (CPU sıcaklığı).</summary>
    public string? TraySensorId { get; set; }

    /// <summary>Mini özet kartında gösterilecek sensörler (sıralı). Null ise ilk çalıştırmada varsayılanlar atanır.</summary>
    public List<string>? PinnedSensorIds { get; set; }

    /// <summary>Ayarlar değiştiğinde (kaydedildiğinde) tetiklenir.</summary>
    public event Action? Changed;

    private static readonly string SettingsFolder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "TrayHardwareMonitor");

    private static readonly string SettingsFilePath = Path.Combine(SettingsFolder, "settings.json");

    [JsonIgnore]
    public IReadOnlyList<string> Pinned => PinnedSensorIds ?? (IReadOnlyList<string>)Array.Empty<string>();

    public bool IsPinned(string sensorId) => PinnedSensorIds?.Contains(sensorId) == true;

    public void TogglePinned(string sensorId)
    {
        PinnedSensorIds ??= new List<string>();
        if (!PinnedSensorIds.Remove(sensorId))
        {
            PinnedSensorIds.Add(sensorId);
        }
    }

    /// <summary>Ayarları diske yazar ve dinleyicileri bilgilendirir.</summary>
    public void NotifyChanged()
    {
        Save();
        Changed?.Invoke();
    }

    public static AppSettings Load()
    {
        try
        {
            if (File.Exists(SettingsFilePath))
            {
                string json = File.ReadAllText(SettingsFilePath);
                var settings = JsonSerializer.Deserialize<AppSettings>(json);
                if (settings != null)
                {
                    // Clamp values to sane ranges
                    settings.BackgroundIntervalMs = Math.Clamp(settings.BackgroundIntervalMs, 500, 10000);
                    settings.DetailIntervalMs = Math.Clamp(settings.DetailIntervalMs, 500, 5000);
                    settings.HoverDelayMs = Math.Clamp(settings.HoverDelayMs, 100, 5000);
                    if (settings.WebServerPort < 1024 || settings.WebServerPort > 65535) settings.WebServerPort = 8085;
                    return settings;
                }
            }
        }
        catch
        {
            // fallback to default
        }

        return new AppSettings();
    }

    public void Save()
    {
        try
        {
            if (!Directory.Exists(SettingsFolder))
            {
                Directory.CreateDirectory(SettingsFolder);
            }

            string json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(SettingsFilePath, json);
        }
        catch
        {
            // Ignore write errors
        }
    }
}
