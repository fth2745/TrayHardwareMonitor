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

    public static bool IsScheduled()
    {
        // 1. Görev Zamanlayıcı kontrolü
        bool taskExists = false;
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "schtasks.exe",
                CreateNoWindow = true,
                UseShellExecute = false
            };
            psi.ArgumentList.Add("/Query");
            psi.ArgumentList.Add("/TN");
            psi.ArgumentList.Add(TaskName);

            using var process = Process.Start(psi);
            if (process != null)
            {
                process.WaitForExit(3000);
                taskExists = (process.ExitCode == 0);
            }
        }
        catch { }

        if (taskExists) return true;

        // 2. Registry Run anahtarı kontrolü
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RegRunKey, false);
            var val = key?.GetValue(RegAppName);
            if (val != null) return true;
        }
        catch { }

        return false;
    }

    public static bool EnableStartup()
    {
        string exePath = Environment.ProcessPath ?? "";
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
            psi.ArgumentList.Add($"\"{exePath}\"");
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
                return true; // En az biri başarılıysa true döner
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
