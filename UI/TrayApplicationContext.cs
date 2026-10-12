using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using LibreHardwareMonitor.Hardware;
using TrayHardwareMonitor.Helpers;
using TrayHardwareMonitor.Services;

namespace TrayHardwareMonitor.UI;

public class TrayApplicationContext : ApplicationContext
{
    private readonly AppSettings _settings;
    private readonly HardwareMonitorService _hardwareService;
    private readonly NotifyIcon _notifyIcon;
    private readonly ContextMenuStrip _contextMenu;
    private readonly System.Windows.Forms.Timer _backgroundTimer;
    private readonly MiniSummaryForm _miniSummaryForm;

    // Detay penceresi ilk tıklamada oluşturulur (kullanılmıyorsa bellek harcamaz)
    private DetailForm? _detailForm;

    private Icon? _currentTrayIcon;
    private string? _lastIconText;
    private Color _lastIconColor;
    private bool _refreshing;
    private bool _exited;

    public TrayApplicationContext(AppSettings settings, HardwareMonitorService hardwareService)
    {
        _settings = settings;
        _hardwareService = hardwareService;

        // İlk değerleri al ve ilk çalıştırmada varsayılan sensör seçimlerini ata
        _hardwareService.UpdateAllBlocking();
        EnsureDefaultSelections();

        _miniSummaryForm = new MiniSummaryForm();
        _miniSummaryForm.SetDataProvider(GetPinnedSensors);
        _miniSummaryForm.SetHoverDelay(_settings.HoverDelayMs);

        // Context Menu
        _contextMenu = new ContextMenuStrip();
        var menuOpen = new ToolStripMenuItem("📊 Detaylı Rapor", null, (s, e) => ShowDetailForm())
        {
            Font = new Font(_contextMenu.Font, FontStyle.Bold)
        };
        var menuSettings = new ToolStripMenuItem("⚙️ Ayarlar (Yenileme & Sensörler)", null, (s, e) => ShowSettingsForm());
        var menuRefresh = new ToolStripMenuItem("🔄 Şimdi Yenile", null, async (s, e) =>
        {
            await _hardwareService.UpdateAllAsync();
            RenderAll();
        });
        var menuExit = new ToolStripMenuItem("❌ Çıkış", null, (s, e) => ExitApplication());

        _contextMenu.Items.Add(menuOpen);
        _contextMenu.Items.Add(menuRefresh);
        _contextMenu.Items.Add(new ToolStripSeparator());
        _contextMenu.Items.Add(menuSettings);
        _contextMenu.Items.Add(new ToolStripSeparator());
        _contextMenu.Items.Add(menuExit);
        _contextMenu.Opening += (s, e) => _miniSummaryForm.DismissImmediate();

        _notifyIcon = new NotifyIcon
        {
            // Text boş: Windows'un gri ipucu balonu çıkmaz, yalnızca bizim mini kartımız görünür
            Text = string.Empty,
            Visible = true,
            ContextMenuStrip = _contextMenu
        };

        _notifyIcon.MouseClick += (s, e) =>
        {
            if (e.Button == MouseButtons.Left)
            {
                _miniSummaryForm.DismissImmediate();
                ShowDetailForm();
            }
        };

        _notifyIcon.MouseMove += (s, e) =>
        {
            if (_contextMenu.Visible) return;
            _miniSummaryForm.NotifyTrayHover();
        };

        _settings.Changed += OnSettingsChanged;

        // Background Timer
        _backgroundTimer = new System.Windows.Forms.Timer { Interval = _settings.BackgroundIntervalMs };
        _backgroundTimer.Tick += async (s, e) => await BackgroundTickAsync();
        _backgroundTimer.Start();

        RenderAll();
    }

    private void EnsureDefaultSelections()
    {
        bool changed = false;

        if (_hardwareService.FindSensor(_settings.TraySensorId) == null)
        {
            var id = _hardwareService.GetDefaultTraySensorId();
            if (id != null)
            {
                _settings.TraySensorId = id;
                changed = true;
            }
        }

        if (_settings.PinnedSensorIds == null)
        {
            var defaults = _hardwareService.GetDefaultPinnedIds();
            if (defaults.Count > 0)
            {
                _settings.PinnedSensorIds = defaults;
                changed = true;
            }
        }

        if (changed) _settings.Save();
    }

    private void OnSettingsChanged()
    {
        _backgroundTimer.Interval = _settings.BackgroundIntervalMs;
        _miniSummaryForm.SetHoverDelay(_settings.HoverDelayMs);
        RenderAll();
    }

    private async System.Threading.Tasks.Task BackgroundTickAsync()
    {
        if (_refreshing || _exited) return;
        _refreshing = true;
        try
        {
            // Detay penceresi açıkken o zaten tüm donanımı tarıyor; burada sadece çizim yapılır
            if (_detailForm is not { IsActivelyMonitoring: true })
            {
                var ids = new List<string>(_settings.Pinned);
                if (_settings.TraySensorId != null) ids.Add(_settings.TraySensorId);
                await _hardwareService.UpdateSensorsAsync(ids);
            }

            if (!_exited) RenderAll();
        }
        finally
        {
            _refreshing = false;
        }
    }

    private List<(string Id, ISensor? Sensor)> GetPinnedSensors() =>
        _settings.Pinned.Select(id => (id, _hardwareService.FindSensor(id))).ToList();

    private void RenderAll()
    {
        RenderTrayIcon();
        if (_miniSummaryForm.Visible)
        {
            _miniSummaryForm.UpdateData(GetPinnedSensors());
        }
    }

    private void RenderTrayIcon()
    {
        var sensor = _hardwareService.FindSensor(_settings.TraySensorId);
        string text = sensor != null ? SensorFormat.FormatIconText(sensor.SensorType, sensor.Value) : "--";
        Color color = sensor != null ? SensorFormat.GetValueColor(sensor.SensorType, sensor.Value) : Color.Gray;

        // Değer değişmediyse simgeyi yeniden üretme (GDI/CPU tasarrufu)
        if (text == _lastIconText && color == _lastIconColor && _currentTrayIcon != null) return;

        try
        {
            var newIcon = IconRenderer.CreateTextIcon(text, color);
            var oldIcon = _currentTrayIcon;
            _currentTrayIcon = newIcon;
            _notifyIcon.Icon = newIcon;
            oldIcon?.Dispose();
            _lastIconText = text;
            _lastIconColor = color;
        }
        catch
        {
            // fallback
        }
    }

    public void ShowDetailForm()
    {
        _miniSummaryForm.DismissImmediate();

        _detailForm ??= new DetailForm(_hardwareService, _settings, ShowSettingsForm);

        if (!_detailForm.Visible)
        {
            _detailForm.Show();
        }

        if (_detailForm.WindowState == FormWindowState.Minimized)
        {
            _detailForm.WindowState = FormWindowState.Normal;
        }
        _detailForm.BringToFront();
        _detailForm.Activate();
        _detailForm.StartMonitoring();
    }

    private void ShowSettingsForm()
    {
        _miniSummaryForm.DismissImmediate();
        using var settingsForm = new SettingsForm(_settings, _hardwareService);
        settingsForm.ShowDialog();
    }

    private void ExitApplication()
    {
        if (_exited) return;
        _exited = true;

        _backgroundTimer.Stop();
        _settings.Changed -= OnSettingsChanged;
        _notifyIcon.Visible = false;

        _notifyIcon.Dispose();
        _currentTrayIcon?.Dispose();
        _contextMenu.Dispose();
        _miniSummaryForm.Dispose();
        _detailForm?.Dispose();
        _hardwareService.Dispose();

        ExitThread();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            ExitApplication();
        }
        base.Dispose(disposing);
    }
}
