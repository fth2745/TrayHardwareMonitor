using System;
using System.Diagnostics;
using System.Security.Principal;
using System.Threading;
using System.Windows.Forms;
using TrayHardwareMonitor.Services;
using TrayHardwareMonitor.UI;

namespace TrayHardwareMonitor;

internal static class Program
{
    private const string AppMutexName = "TrayHardwareMonitor_SingleInstance_Mutex_98a72b";
    private static Mutex? _mutex;

    [STAThread]
    private static void Main(string[] args)
    {
        // 0. Enable Corrupted State Exception (CSE) handling for native P/Invoke / driver access faults
        Environment.SetEnvironmentVariable("DOTNET_legacyCorruptedStateExceptionsPolicy", "1");
        Environment.SetEnvironmentVariable("COMPlus_legacyCorruptedStateExceptionsPolicy", "1");

        // 1. Single instance check
        _mutex = new Mutex(true, AppMutexName, out bool isOnlyInstance);
        if (!isOnlyInstance)
        {
            MessageBox.Show(
                "Tray Hardware Monitor zaten arka planda veya sistem tepsisinde çalışıyor.",
                "Zaten Çalışıyor",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        // 2. Administrator privilege check
        if (!IsAdministrator())
        {
            if (args.Length == 0 || !args.Contains("--no-elevate"))
            {
                try
                {
                    var exePath = Environment.ProcessPath;
                    if (!string.IsNullOrEmpty(exePath) && File.Exists(exePath))
                    {
                        var startInfo = new ProcessStartInfo
                        {
                            FileName = exePath,
                            UseShellExecute = true,
                            Verb = "runas",
                            Arguments = string.Join(" ", args)
                        };

                        _mutex.ReleaseMutex();
                        _mutex.Dispose();
                        Process.Start(startInfo);
                        return; // Successfully started elevated instance
                    }
                }
                catch
                {
                    // If UAC was cancelled or failed, re-acquire mutex and verify single instance
                    _mutex = new Mutex(true, AppMutexName, out bool reacquired);
                    if (!reacquired)
                    {
                        _mutex.Dispose();
                        return;
                    }
                }
            }
        }

        // 3. WinForms Setup
        ApplicationConfiguration.Initialize();

        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (s, e) =>
        {
            try { File.AppendAllText(Path.Combine(AppContext.BaseDirectory, "crash.log"), $"{DateTime.Now} [UI Thread]: {e.Exception}\n"); } catch { }
            Debug.WriteLine($"[UI Thread Exception]: {e.Exception}");
        };
        AppDomain.CurrentDomain.UnhandledException += (s, e) =>
        {
            try { File.AppendAllText(Path.Combine(AppContext.BaseDirectory, "crash.log"), $"{DateTime.Now} [AppDomain]: {e.ExceptionObject}\n"); } catch { }
            Debug.WriteLine($"Unhandled exception: {e.ExceptionObject}");
        };
        TaskScheduler.UnobservedTaskException += (s, e) =>
        {
            try { File.AppendAllText(Path.Combine(AppContext.BaseDirectory, "crash.log"), $"{DateTime.Now} [UnobservedTask]: {e.Exception}\n"); } catch { }
            e.SetObserved();
        };

        // 4. Load Settings & Services
        var settings = AppSettings.Load();
        StartupManager.SyncStartupPathIfNeeded(settings);
        var hardwareService = new HardwareMonitorService();
        hardwareService.Initialize();

        // 5. Run Application Context
        var trayContext = new TrayApplicationContext(settings, hardwareService);

        // If user didn't specify --minimized on first manual launch, they might like to see the window or keep in tray
        // By default it starts neatly in the system tray.
        Application.Run(trayContext);

        // Keep mutex alive until exit
        GC.KeepAlive(_mutex);
    }

    private static bool IsAdministrator()
    {
        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            var principal = new WindowsPrincipal(identity);
            return principal.IsInRole(WindowsBuiltInRole.Administrator);
        }
        catch
        {
            return false;
        }
    }
}