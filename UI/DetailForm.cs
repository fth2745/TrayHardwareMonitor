using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using LibreHardwareMonitor.Hardware;
using TrayHardwareMonitor.Helpers;
using TrayHardwareMonitor.Services;

namespace TrayHardwareMonitor.UI;

public class DetailForm : Form
{
    private readonly HardwareMonitorService _hardwareService;
    private readonly AppSettings _settings;
    private readonly System.Windows.Forms.Timer _updateTimer;
    private readonly System.Windows.Forms.Timer _filterDebounceTimer;

    private readonly SplitContainer _splitContainer;
    private readonly TreeView _treeHardware;
    private readonly ListView _listSensors;
    private readonly TextBox _txtSearch;
    private readonly ToolStripStatusLabel _statusLabel = new("Hazır") { Spring = true, TextAlign = ContentAlignment.MiddleLeft };
    private readonly ToolStripStatusLabel _statusCount = new("Sensörler: 0") { Alignment = ToolStripItemAlignment.Right };

    private readonly ContextMenuStrip _sensorMenu;
    private readonly ToolStripMenuItem _menuTray;
    private readonly ToolStripMenuItem _menuPin;

    // Sütun oranları: Sensör, Tür, Anlık, Min, Maks (toplam 1.0)
    private static readonly float[] ColumnRatios = { 0.34f, 0.14f, 0.18f, 0.17f, 0.17f };

    // Listedeki satırlar ve son yazılan değerler (sadece değişen hücreler güncellenir → titreme/yük yok)
    private readonly List<(ISensor Sensor, ListViewItem Item)> _rows = new();

    private bool _refreshing;
    private bool _resizingColumns;
    private int _treeStructureVersion = -1;

    /// <summary>Pencere görünür ve simge durumunda değilse true (tam tarama bu durumda yapılır).</summary>
    public bool IsActivelyMonitoring => Visible && WindowState != FormWindowState.Minimized;

    private readonly Action? _onOpenSettings;

    public DetailForm(HardwareMonitorService hardwareService, AppSettings settings, Action? onOpenSettings = null)
    {
        _hardwareService = hardwareService;
        _settings = settings;
        _onOpenSettings = onOpenSettings;

        Text = "Tray Hardware Monitor - Detaylı Donanım Raporu";
        Size = new Size(900, 620);
        MinimumSize = new Size(560, 380);
        StartPosition = FormStartPosition.CenterScreen;
        Icon = SystemIcons.Shield;
        BackColor = Color.FromArgb(245, 246, 250);
        Font = new Font("Segoe UI", 9f, FontStyle.Regular);

        // ---------------- Toolbar
        var toolStrip = new ToolStrip
        {
            GripStyle = ToolStripGripStyle.Hidden,
            BackColor = Color.White,
            Padding = new Padding(6, 4, 6, 4),
            RenderMode = ToolStripRenderMode.System
        };

        var btnReset = new ToolStripButton("🔄 Min/Maks Sıfırla") { Font = new Font("Segoe UI Semibold", 9f) };
        btnReset.Click += (s, e) =>
        {
            _hardwareService.ResetMinMax();
            UpdateValues();
        };

        var btnCopy = new ToolStripButton("📋 Panoya Kopyala");
        btnCopy.Click += (s, e) =>
        {
            Clipboard.SetText(_hardwareService.GenerateReportText());
            _statusLabel.Text = "Rapor panoya kopyalandı.";
        };

        var btnSave = new ToolStripButton("💾 Raporu Kaydet (TXT)");
        btnSave.Click += (s, e) => SaveReportToFile();

        var btnSettings = new ToolStripButton("⚙️ Ayarlar (Yenileme & Sensörler)")
        {
            Font = new Font("Segoe UI Semibold", 9f),
            ForeColor = Color.FromArgb(0, 102, 204)
        };
        btnSettings.Click += (s, e) =>
        {
            if (_onOpenSettings != null)
            {
                _onOpenSettings();
            }
            else
            {
                using var sf = new SettingsForm(_settings, _hardwareService);
                sf.ShowDialog(this);
            }
        };

        _txtSearch = new TextBox { Width = 150, PlaceholderText = "Sensör ara..." };
        _txtSearch.TextChanged += (s, e) => RestartFilterTimer();

        toolStrip.Items.Add(btnReset);
        toolStrip.Items.Add(new ToolStripSeparator());
        toolStrip.Items.Add(btnCopy);
        toolStrip.Items.Add(btnSave);
        toolStrip.Items.Add(new ToolStripSeparator());
        toolStrip.Items.Add(btnSettings);
        toolStrip.Items.Add(new ToolStripSeparator());
        toolStrip.Items.Add(new ToolStripLabel("🔍 Filtrele: "));
        toolStrip.Items.Add(new ToolStripControlHost(_txtSearch));

        // ---------------- Split container (sol panel sabit genişlikte, sağ panel pencereyle esner)
        _splitContainer = new SplitContainer
        {
            Dock = DockStyle.Fill,
            FixedPanel = FixedPanel.Panel1,
            SplitterWidth = 5,
            BackColor = Color.FromArgb(220, 224, 230)
        };

        _treeHardware = new TreeView
        {
            Dock = DockStyle.Fill,
            BorderStyle = BorderStyle.None,
            Font = new Font("Segoe UI", 9.5f),
            FullRowSelect = true,
            HideSelection = false,
            ShowLines = true,
            BackColor = Color.White
        };
        _treeHardware.AfterSelect += (s, e) => PopulateSensorsList();
        _splitContainer.Panel1.Controls.Add(_treeHardware);

        _listSensors = new ListView
        {
            Dock = DockStyle.Fill,
            View = View.Details,
            FullRowSelect = true,
            GridLines = true,
            MultiSelect = false,
            BorderStyle = BorderStyle.None,
            Font = new Font("Segoe UI", 9.5f),
            BackColor = Color.White,
            ShowItemToolTips = true
        };

        // Double buffering via reflection to prevent flicker
        typeof(Control).GetProperty("DoubleBuffered", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)
            ?.SetValue(_listSensors, true, null);

        _listSensors.Columns.Add("Sensör");
        _listSensors.Columns.Add("Tür");
        _listSensors.Columns.Add("Anlık Değer", -2, HorizontalAlignment.Right);
        _listSensors.Columns.Add("Minimum", -2, HorizontalAlignment.Right);
        _listSensors.Columns.Add("Maksimum", -2, HorizontalAlignment.Right);
        _listSensors.ClientSizeChanged += (s, e) => ResizeColumns();
        _listSensors.DoubleClick += (s, e) => TogglePinnedForSelected();

        _splitContainer.Panel2.Controls.Add(_listSensors);

        // ---------------- Sağ tık menüsü
        _sensorMenu = new ContextMenuStrip();
        _menuTray = new ToolStripMenuItem("📌 Bu sensörü tepsi simgesinde göster", null, (s, e) => SetTrayForSelected());
        _menuPin = new ToolStripMenuItem("⭐ Mini özet kartında göster", null, (s, e) => TogglePinnedForSelected());
        var menuCopyRow = new ToolStripMenuItem("📋 Satırı kopyala", null, (s, e) => CopySelectedRow());
        _sensorMenu.Items.Add(_menuTray);
        _sensorMenu.Items.Add(_menuPin);
        _sensorMenu.Items.Add(new ToolStripSeparator());
        _sensorMenu.Items.Add(menuCopyRow);
        _sensorMenu.Opening += SensorMenu_Opening;
        _listSensors.ContextMenuStrip = _sensorMenu;

        // ---------------- Status bar
        var statusStrip = new StatusStrip { BackColor = Color.White, SizingGrip = true };
        statusStrip.Items.Add(_statusLabel);
        statusStrip.Items.Add(_statusCount);

        Controls.Add(_splitContainer);
        Controls.Add(toolStrip);
        Controls.Add(statusStrip);

        // ---------------- Timers
        _updateTimer = new System.Windows.Forms.Timer { Interval = _settings.DetailIntervalMs };
        _updateTimer.Tick += async (s, e) => await RefreshDataAsync();

        _filterDebounceTimer = new System.Windows.Forms.Timer { Interval = 250 };
        _filterDebounceTimer.Tick += (s, e) =>
        {
            _filterDebounceTimer.Stop();
            PopulateSensorsList();
        };

        _settings.Changed += OnSettingsChanged;
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        _splitContainer.Panel1MinSize = 150;
        _splitContainer.Panel2MinSize = 300;
        _splitContainer.SplitterDistance = 240;
        ResizeColumns();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        // Intercept close button (X) and hide form instead of exiting
        if (e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            StopMonitoring();
            Hide();
        }
        else
        {
            base.OnFormClosing(e);
        }
    }

    public void StartMonitoring()
    {
        _updateTimer.Interval = _settings.DetailIntervalMs;
        if (_treeStructureVersion != _hardwareService.StructureVersion)
        {
            RebuildHardwareTree();
        }
        UpdateValues();
        _updateTimer.Start();
        _ = RefreshDataAsync();
    }

    public void StopMonitoring()
    {
        _updateTimer.Stop();
    }

    private void RestartFilterTimer()
    {
        _filterDebounceTimer.Stop();
        _filterDebounceTimer.Start();
    }

    private void OnSettingsChanged()
    {
        if (IsDisposed) return;
        _updateTimer.Interval = _settings.DetailIntervalMs;
        UpdateNameDecorations();
    }

    // ---------------------------------------------------------------- Sütunlar

    private void ResizeColumns()
    {
        if (_resizingColumns || _listSensors.Columns.Count != ColumnRatios.Length) return;
        int width = _listSensors.ClientSize.Width - 4;
        if (width <= 50) return;

        _resizingColumns = true;
        try
        {
            int used = 0;
            for (int i = 0; i < ColumnRatios.Length; i++)
            {
                int w = i == ColumnRatios.Length - 1 ? width - used : (int)(width * ColumnRatios[i]);
                _listSensors.Columns[i].Width = Math.Max(40, w);
                used += w;
            }
        }
        finally
        {
            _resizingColumns = false;
        }
    }

    // ---------------------------------------------------------------- Ağaç & Liste

    private void RebuildHardwareTree()
    {
        _treeStructureVersion = _hardwareService.StructureVersion;

        _treeHardware.BeginUpdate();
        _treeHardware.Nodes.Clear();

        var rootNode = new TreeNode("🖥️ Tüm Donanım") { Tag = null };
        _treeHardware.Nodes.Add(rootNode);

        foreach (var hw in _hardwareService.HardwareList)
        {
            AddHardwareNode(rootNode, hw);
        }

        rootNode.Expand();
        _treeHardware.EndUpdate();
        _treeHardware.SelectedNode = rootNode; // AfterSelect → PopulateSensorsList
        if (_rows.Count == 0) PopulateSensorsList();
    }

    private static void AddHardwareNode(TreeNode parent, IHardware hardware)
    {
        string iconPrefix = hardware.HardwareType switch
        {
            HardwareType.Cpu => "⚡",
            HardwareType.GpuNvidia or HardwareType.GpuAmd or HardwareType.GpuIntel => "🎮",
            HardwareType.Memory => "🧠",
            HardwareType.Storage => "💾",
            HardwareType.Motherboard => "🔌",
            HardwareType.Network => "🌐",
            HardwareType.Cooler => "❄️",
            _ => "📦"
        };

        var node = new TreeNode($"{iconPrefix} {hardware.Name}") { Tag = hardware };
        parent.Nodes.Add(node);

        foreach (var sub in hardware.SubHardware)
        {
            AddHardwareNode(node, sub);
        }
    }

    private void PopulateSensorsList()
    {
        var targetHardware = _treeHardware.SelectedNode?.Tag as IHardware;
        string filter = _txtSearch.Text.Trim();

        HashSet<IHardware>? hwFilter = null;
        if (targetHardware != null)
        {
            hwFilter = new HashSet<IHardware>();
            CollectHardware(targetHardware, hwFilter);
        }

        var sensors = _hardwareService.AllSensors.Where(s =>
            (hwFilter == null || hwFilter.Contains(s.Hardware)) &&
            (filter.Length == 0 ||
             s.Name.Contains(filter, StringComparison.OrdinalIgnoreCase) ||
             s.Hardware.Name.Contains(filter, StringComparison.OrdinalIgnoreCase) ||
             SensorFormat.GetTypeName(s.SensorType).Contains(filter, StringComparison.OrdinalIgnoreCase)));

        _listSensors.BeginUpdate();
        try
        {
            _listSensors.Items.Clear();
            _listSensors.Groups.Clear();
            _rows.Clear();

            var groups = new Dictionary<IHardware, ListViewGroup>();
            var items = new List<ListViewItem>();

            foreach (var sensor in sensors)
            {
                if (!groups.TryGetValue(sensor.Hardware, out var group))
                {
                    group = new ListViewGroup(sensor.Hardware.Name);
                    groups[sensor.Hardware] = group;
                    _listSensors.Groups.Add(group);
                }

                var item = new ListViewItem(new[]
                {
                    DecoratedName(sensor),
                    SensorFormat.GetTypeName(sensor.SensorType),
                    SensorFormat.FormatValue(sensor.SensorType, sensor.Value, true),
                    SensorFormat.FormatValue(sensor.SensorType, sensor.Min, true),
                    SensorFormat.FormatValue(sensor.SensorType, sensor.Max, true)
                }, group)
                {
                    Tag = sensor,
                    ToolTipText = $"{sensor.Hardware.Name} › {sensor.Name}\nÇift tık: mini karta ekle/kaldır"
                };

                items.Add(item);
                _rows.Add((sensor, item));
            }

            _listSensors.Items.AddRange(items.ToArray());
        }
        finally
        {
            _listSensors.EndUpdate();
        }

        _statusCount.Text = $"Sensörler: {_rows.Count}";
    }

    private static void CollectHardware(IHardware hw, HashSet<IHardware> set)
    {
        set.Add(hw);
        foreach (var sub in hw.SubHardware) CollectHardware(sub, set);
    }

    private string DecoratedName(ISensor sensor)
    {
        string id = HardwareMonitorService.GetId(sensor);
        string prefix = "";
        if (id == _settings.TraySensorId) prefix += "📌 ";
        if (_settings.IsPinned(id)) prefix += "⭐ ";
        return prefix + sensor.Name;
    }

    private void UpdateNameDecorations()
    {
        foreach (var (sensor, item) in _rows)
        {
            SetIfChanged(item.SubItems[0], DecoratedName(sensor));
        }
    }

    // ---------------------------------------------------------------- Yenileme

    private async System.Threading.Tasks.Task RefreshDataAsync()
    {
        if (_refreshing || !IsActivelyMonitoring) return;
        _refreshing = true;
        try
        {
            // Donanım taraması arka planda; UI bu sırada tamamen serbest
            bool updated = await _hardwareService.UpdateAllAsync();
            if (IsDisposed || !Visible) return;

            if (_treeStructureVersion != _hardwareService.StructureVersion)
            {
                RebuildHardwareTree();
            }

            UpdateValues();
            _statusLabel.Text = updated
                ? $"Son güncelleme: {DateTime.Now:HH:mm:ss}  |  Tarama: {_hardwareService.LastUpdateDurationMs} ms  |  Yenileme: {_settings.DetailIntervalMs / 1000f:0.0} sn"
                : _statusLabel.Text;
        }
        finally
        {
            _refreshing = false;
        }
    }

    /// <summary>Yalnızca değeri değişen hücreleri günceller.</summary>
    private void UpdateValues()
    {
        foreach (var (sensor, item) in _rows)
        {
            var type = sensor.SensorType;
            SetIfChanged(item.SubItems[2], SensorFormat.FormatValue(type, sensor.Value, true));
            SetIfChanged(item.SubItems[3], SensorFormat.FormatValue(type, sensor.Min, true));
            SetIfChanged(item.SubItems[4], SensorFormat.FormatValue(type, sensor.Max, true));
        }
    }

    private static void SetIfChanged(ListViewItem.ListViewSubItem subItem, string text)
    {
        if (!string.Equals(subItem.Text, text, StringComparison.Ordinal))
        {
            subItem.Text = text;
        }
    }

    // ---------------------------------------------------------------- Sağ tık işlemleri

    private ISensor? SelectedSensor =>
        _listSensors.SelectedItems.Count > 0 ? _listSensors.SelectedItems[0].Tag as ISensor : null;

    private void SensorMenu_Opening(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        var sensor = SelectedSensor;
        if (sensor == null)
        {
            e.Cancel = true;
            return;
        }

        string id = HardwareMonitorService.GetId(sensor);
        _menuTray.Checked = id == _settings.TraySensorId;
        _menuPin.Checked = _settings.IsPinned(id);
        _menuPin.Text = _menuPin.Checked ? "⭐ Mini özet kartından kaldır" : "⭐ Mini özet kartına ekle";
    }

    private void SetTrayForSelected()
    {
        var sensor = SelectedSensor;
        if (sensor == null) return;
        _settings.TraySensorId = HardwareMonitorService.GetId(sensor);
        _settings.NotifyChanged();
        _statusLabel.Text = $"Tepsi simgesi artık şunu gösteriyor: {SensorFormat.GetDisplayLabel(sensor)}";
    }

    private void TogglePinnedForSelected()
    {
        var sensor = SelectedSensor;
        if (sensor == null) return;
        string id = HardwareMonitorService.GetId(sensor);
        _settings.TogglePinned(id);
        _settings.NotifyChanged();
        _statusLabel.Text = _settings.IsPinned(id)
            ? $"Mini karta eklendi: {SensorFormat.GetDisplayLabel(sensor)}"
            : $"Mini karttan kaldırıldı: {SensorFormat.GetDisplayLabel(sensor)}";
    }

    private void CopySelectedRow()
    {
        if (_listSensors.SelectedItems.Count == 0) return;
        var item = _listSensors.SelectedItems[0];
        var sensor = (ISensor)item.Tag!;
        Clipboard.SetText($"{sensor.Hardware.Name} › {sensor.Name}: {item.SubItems[2].Text} (Min: {item.SubItems[3].Text}, Maks: {item.SubItems[4].Text})");
    }

    private void SaveReportToFile()
    {
        using var sfd = new SaveFileDialog
        {
            Filter = "Metin Dosyası (*.txt)|*.txt|Tüm Dosyalar (*.*)|*.*",
            FileName = $"HardwareReport_{DateTime.Now:yyyyMMdd_HHmmss}.txt",
            Title = "Donanım Raporunu Kaydet"
        };

        if (sfd.ShowDialog(this) == DialogResult.OK)
        {
            try
            {
                File.WriteAllText(sfd.FileName, _hardwareService.GenerateReportText());
                _statusLabel.Text = "Rapor kaydedildi: " + sfd.FileName;
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Rapor kaydedilirken hata oluştu: " + ex.Message, "Hata", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _settings.Changed -= OnSettingsChanged;
            _updateTimer.Dispose();
            _filterDebounceTimer.Dispose();
            _sensorMenu.Dispose();
        }
        base.Dispose(disposing);
    }
}
