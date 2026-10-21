using System;
using System.Diagnostics;
using System.IO;
using Microsoft.Win32;

namespace TrayHardwareMonitor.Services;

public static class StartupManager
{
    private const string TaskName = "TrayHardwareMonitor_Startup";
    private const string RegRunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RegAppName = "TrayHardwareMonitor";

    public static string GetCurrentExePath()
    {
        return Environment.ProcessPath ?? "";
    }

    /// <summary>
    /// Başlangıçta kayıtlı olan yolu döndürür (Görev Zamanlayıcı veya Registry).
    /// </summary>
    public static string? GetConfiguredPath()
    {
        // 1. Görev Zamanlayıcı
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "schtasks.exe",
                CreateNoWindow = true,
                UseShellExecute = false,
                RedirectStandardOutput = true
            };
            psi.ArgumentList.Add("/Query");
            psi.ArgumentList.Add("/TN");
            psi.ArgumentList.Add(TaskName);
            psi.ArgumentList.Add("/V");
            psi.ArgumentList.Add("/FO");
            psi.ArgumentList.Add("LIST");

            using var process = Process.Start(psi);
            if (process != null)
            {
                string output = process.StandardOutput.ReadToEnd();
                process.WaitForExit(3000);

                foreach (var line in output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
                {
                    if (line.StartsWith("Task To Run:", StringComparison.OrdinalIgnoreCase) ||
                        line.StartsWith("Çalıştırılacak Görev:", StringComparison.OrdinalIgnoreCase))
                    {
                        var parts = line.Split(':', 2);
                        if (parts.Length == 2)
                        {
                            return parts[1].Trim().Trim('"').Trim();
                        }
                    }
                }
            }
        }
        catch { }

        // 2. Registry
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RegRunKey, false);
            var val = key?.GetValue(RegAppName) as string;
            if (!string.IsNullOrEmpty(val))
            {
                return val.Trim().Trim('"').Trim();
            }
        }
        catch { }

        return null;
    }

    /// <summary>
    /// Otomatik başlatmanın geçerli ve mevcut exe yoluyla kurulu olup olmadığını doğrular.
    /// </summary>
    public static bool IsScheduled()
    {
        string currentExe = GetCurrentExePath();
        string? configuredPath = GetConfiguredPath();

        if (string.IsNullOrEmpty(configuredPath))
            return false;

        // Yapılandırılan dosya mevcut mu ve mevcut exe ile eşleşiyor mu?
        if (File.Exists(configuredPath))
        {
            if (string.IsNullOrEmpty(currentExe))
                return true;

            return string.Equals(Path.GetFullPath(configuredPath), Path.GetFullPath(currentExe), StringComparison.OrdinalIgnoreCase);
        }

        return false;
    }

    /// <summary>
    /// Uygulama taşındığında başlangıç yolunu otomatik olarak günceller.
    /// </summary>
    public static void SyncStartupPathIfNeeded(AppSettings settings)
    {
        if (!settings.StartWithWindows) return;

        string currentExe = GetCurrentExePath();
        if (string.IsNullOrEmpty(currentExe) || !File.Exists(currentExe)) return;

        string? configuredPath = GetConfiguredPath();
        if (string.IsNullOrEmpty(configuredPath) ||
            !string.Equals(Path.GetFullPath(configuredPath), Path.GetFullPath(currentExe), StringComparison.OrdinalIgnoreCase) ||
            !File.Exists(configuredPath))
        {
            // Yol değişmiş veya eski dosya silinmiş, yeniden oluştur
            EnableStartup();
        }
    }

    public static bool EnableStartup()
    {
        string exePath = GetCurrentExePath();
        if (string.IsNullOrEmpty(exePath) || !File.Exists(exePath))
        {
            return false;
        }

        bool taskSuccess = false;

        // 1. Görev Zamanlayıcı görevi oluştur (UAC uyarısı vermeden Yönetici olarak başlaması için)
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "schtasks.exe",
                CreateNoWindow = true,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            psi.ArgumentList.Add("/Create");
            psi.ArgumentList.Add("/TN");
            psi.ArgumentList.Add(TaskName);
            psi.ArgumentList.Add("/TR");
            psi.ArgumentList.Add(exePath); // ArgumentList boşluklu yolları otomatik tırnaklar
            psi.ArgumentList.Add("/SC");
            psi.ArgumentList.Add("ONLOGON");
            psi.ArgumentList.Add("/RL");
            psi.ArgumentList.Add("HIGHEST");
            psi.ArgumentList.Add("/F");

            using var process = Process.Start(psi);
            if (process != null)
            {
                process.WaitForExit(5000);
                taskSuccess = (process.ExitCode == 0);
            }
        }
        catch { }

        // 2. Yedek olarak Windows Registry Run anahtarına da ekle
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RegRunKey, true);
            if (key != null)
            {
                key.SetValue(RegAppName, $"\"{exePath}\"");
                return true;
            }
        }
        catch { }

        return taskSuccess;
    }

    public static bool DisableStartup()
    {
        // 1. Görev Zamanlayıcı görevini sil
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "schtasks.exe",
                CreateNoWindow = true,
                UseShellExecute = false
            };
            psi.ArgumentList.Add("/Delete");
            psi.ArgumentList.Add("/TN");
            psi.ArgumentList.Add(TaskName);
            psi.ArgumentList.Add("/F");

            using var process = Process.Start(psi);
            process?.WaitForExit(5000);
        }
        catch { }

        // 2. Registry Run anahtarından sil
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RegRunKey, true);
            key?.DeleteValue(RegAppName, false);
        }
        catch { }

        return true;
    }
}
