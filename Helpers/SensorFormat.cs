using System;
using System.Drawing;
using LibreHardwareMonitor.Hardware;

namespace TrayHardwareMonitor.Helpers;

/// <summary>Sensör değerlerinin metin/renk biçimlendirmesi için ortak yardımcılar.</summary>
public static class SensorFormat
{
    public static readonly Color Green = Color.FromArgb(70, 230, 130);
    public static readonly Color Amber = Color.FromArgb(255, 185, 35);
    public static readonly Color Red = Color.FromArgb(255, 75, 75);
    public static readonly Color Blue = Color.FromArgb(100, 190, 255);

    public static string FormatValue(SensorType type, float? value, bool precise = false)
    {
        if (!value.HasValue || float.IsNaN(value.Value)) return "--";
        float x = value.Value;

        return type switch
        {
            SensorType.Temperature => precise ? $"{x:F1} °C" : $"{x:F0} °C",
            SensorType.Load or SensorType.Control or SensorType.Level => precise ? $"%{x:F1}" : $"%{x:F0}",
            SensorType.Clock => $"{x:F0} MHz",
            SensorType.Fan => $"{x:F0} RPM",
            SensorType.Power => $"{x:F1} W",
            SensorType.Voltage => $"{x:F3} V",
            SensorType.Current => $"{x:F2} A",
            SensorType.Data => $"{x:F1} GB",
            SensorType.SmallData => x >= 1024 ? $"{x / 1024f:F1} GB" : $"{x:F0} MB",
            SensorType.Throughput => FormatBytes(x) + "/s",
            SensorType.Frequency => $"{x:F0} Hz",
            SensorType.Flow => $"{x:F0} L/h",
            SensorType.Energy => $"{x:F0} mWh",
            SensorType.TimeSpan => $"{x:F0} s",
            SensorType.Factor => $"{x:F2}",
            _ => $"{x:F1}"
        };
    }

    /// <summary>Tepsi simgesine sığacak kısa metin (en fazla ~4 karakter).</summary>
    public static string FormatIconText(SensorType type, float? value)
    {
        if (!value.HasValue || float.IsNaN(value.Value)) return "--";
        float x = value.Value;

        string text = type switch
        {
            SensorType.Temperature or SensorType.Load or SensorType.Control or SensorType.Level
                => Math.Clamp((int)Math.Round(x), -99, 999).ToString(),
            SensorType.Fan => x >= 1000 ? $"{x / 1000f:0.0}k" : $"{x:F0}",
            SensorType.Clock => x >= 1000 ? $"{x / 1000f:0.0}" : $"{x:F0}",
            SensorType.Power => $"{x:F0}",
            SensorType.Voltage => $"{x:0.00}",
            SensorType.Data => x >= 10 ? $"{x:F0}" : $"{x:0.0}",
            SensorType.SmallData => x >= 1024 ? $"{x / 1024f:0.0}" : $"{x:F0}",
            SensorType.Throughput => FormatBytesShort(x),
            _ => $"{x:F0}"
        };

        return text.Length > 4 ? text[..4] : text;
    }

    public static Color GetValueColor(SensorType type, float? value)
    {
        if (!value.HasValue) return Color.FromArgb(160, 165, 175);
        float x = value.Value;

        return type switch
        {
            SensorType.Temperature => x < 55 ? Green : x < 75 ? Amber : Red,
            SensorType.Load => x < 60 ? Green : x < 85 ? Amber : Red,
            _ => Blue
        };
    }

    public static string GetTypeName(SensorType type) => type switch
    {
        SensorType.Temperature => "Sıcaklık",
        SensorType.Load => "Yük",
        SensorType.Clock => "Saat",
        SensorType.Fan => "Fan",
        SensorType.Power => "Güç",
        SensorType.Voltage => "Voltaj",
        SensorType.Current => "Akım",
        SensorType.Data => "Veri",
        SensorType.SmallData => "Veri",
        SensorType.Throughput => "Aktarım",
        SensorType.Control => "Kontrol",
        SensorType.Level => "Seviye",
        SensorType.Frequency => "Frekans",
        SensorType.Flow => "Akış",
        SensorType.Energy => "Enerji",
        SensorType.TimeSpan => "Süre",
        SensorType.Factor => "Faktör",
        _ => type.ToString()
    };

    /// <summary>Listeleme sırası: önemli türler önce.</summary>
    public static int GetTypeOrder(SensorType type) => type switch
    {
        SensorType.Temperature => 0,
        SensorType.Load => 1,
        SensorType.Clock => 2,
        SensorType.Power => 3,
        SensorType.Fan => 4,
        SensorType.Control => 5,
        SensorType.Voltage => 6,
        SensorType.Current => 7,
        SensorType.Data => 8,
        SensorType.SmallData => 9,
        SensorType.Throughput => 10,
        _ => 20
    };

    public static string GetHardwarePrefix(IHardware hw) => hw.HardwareType switch
    {
        HardwareType.Cpu => "CPU",
        HardwareType.GpuNvidia or HardwareType.GpuAmd or HardwareType.GpuIntel => "GPU",
        HardwareType.Memory => "RAM",
        HardwareType.Motherboard or HardwareType.SuperIO => "Anakart",
        HardwareType.Network => "Ağ",
        HardwareType.Cooler => "Soğutucu",
        HardwareType.Storage => Shorten(hw.Name, 16),
        _ => Shorten(hw.Name, 16)
    };

    /// <summary>Mini kart ve listelerde kullanılacak okunabilir etiket (ör. "CPU · Package", "GPU Core").</summary>
    public static string GetDisplayLabel(ISensor sensor)
    {
        string prefix = GetHardwarePrefix(sensor.Hardware);
        string name = sensor.Name;
        if (name.StartsWith(prefix + " ", StringComparison.OrdinalIgnoreCase) || name.Equals(prefix, StringComparison.OrdinalIgnoreCase))
        {
            return name;
        }
        return $"{prefix} · {name}";
    }

    public static string Shorten(string text, int max) =>
        text.Length <= max ? text : text[..(max - 1)] + "…";

    private static string FormatBytes(float bytes)
    {
        if (bytes >= 1024f * 1024f * 1024f) return $"{bytes / (1024f * 1024f * 1024f):F1} GB";
        if (bytes >= 1024f * 1024f) return $"{bytes / (1024f * 1024f):F1} MB";
        if (bytes >= 1024f) return $"{bytes / 1024f:F0} KB";
        return $"{bytes:F0} B";
    }

    private static string FormatBytesShort(float bytes)
    {
        if (bytes >= 1024f * 1024f) return $"{bytes / (1024f * 1024f):F0}M";
        if (bytes >= 1024f) return $"{bytes / 1024f:F0}K";
        return $"{bytes:F0}";
    }
}

