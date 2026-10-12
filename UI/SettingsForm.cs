using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using LibreHardwareMonitor.Hardware;
using TrayHardwareMonitor.Helpers;
using TrayHardwareMonitor.Services;

namespace TrayHardwareMonitor.UI;

public class SettingsForm : Form
{
    private sealed record SensorItem(string Id, string Text)
    {
        public override string ToString() => Text;
    }

    private readonly AppSettings _settings;
    private readonly HardwareMonitorService _hardwareService;

    private readonly NumericUpDown _numBgInterval;
    private readonly NumericUpDown _numDetailInterval;
    private readonly ComboBox _cmbTraySensor;
    private readonly CheckedListBox _lstPinned;
    private readonly CheckBox _chkAutoStart;

    public SettingsForm(AppSettings settings, HardwareMonitorService hardwareService)
    {
        _settings = settings;
        _hardwareService = hardwareService;

        Text = "Ayarlar - Tray Hardware Monitor";
        ClientSize = new Size(520, 640);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(248, 249, 252);
        Font = new Font("Segoe UI", 9.5f);

        var allSensors = _hardwareService.AllSensors
            .Select(s => new SensorItem(HardwareMonitorService.GetId(s), FormatSensorText(s)))
            .ToList();

        // ---------------- Yenileme aralıkları
        var grpIntervals = new GroupBox
        {
            Text = "Yenileme Aralıkları",
            Location = new Point(16, 12),
            Size = new Size(488, 92)
        };

        grpIntervals.Controls.Add(new Label { Text = "Arka plan / tepsi yenileme (sn):", Location = new Point(14, 28), AutoSize = true });
        _numBgInterval = new NumericUpDown
        {
            Location = new Point(370, 25),
            Width = 100,
            Minimum = 0.5m,
            Maximum = 10,
            DecimalPlaces = 1,
            Increment = 0.5m,
            Value = Math.Clamp((decimal)(_settings.BackgroundIntervalMs / 1000.0), 0.5m, 10m)
        };
        grpIntervals.Controls.Add(_numBgInterval);

        grpIntervals.Controls.Add(new Label { Text = "Detay pencere yenileme (sn):", Location = new Point(14, 60), AutoSize = true });
        _numDetailInterval = new NumericUpDown
        {
            Location = new Point(370, 57),
            Width = 100,
            Minimum = 0.5m,
            Maximum = 5,
            DecimalPlaces = 1,
            Increment = 0.5m,
            Value = Math.Clamp((decimal)(_settings.DetailIntervalMs / 1000.0), 0.5m, 5m)
        };
        grpIntervals.Controls.Add(_numDetailInterval);
        Controls.Add(grpIntervals);

        // ---------------- Tepsi simgesi
        var grpTray = new GroupBox
        {
            Text = "Tepsi Simgesinde Gösterilecek Değer",
            Location = new Point(16, 114),
            Size = new Size(488, 66)
        };
        _cmbTraySensor = new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            Location = new Point(14, 26),
            Width = 456,
            MaxDropDownItems = 20
        };
        _cmbTraySensor.Items.AddRange(allSensors.Cast<object>().ToArray());
        var currentTray = allSensors.FirstOrDefault(s => s.Id == _settings.TraySensorId);
        if (currentTray != null) _cmbTraySensor.SelectedItem = currentTray;
        grpTray.Controls.Add(_cmbTraySensor);
        Controls.Add(grpTray);

        // ---------------- Mini özet kartı
        var grpPinned = new GroupBox
        {
            Text = "Mini Özet Kartında Gösterilecek Sensörler (işaretle, sırala)",
            Location = new Point(16, 190),
            Size = new Size(488, 340)
        };

        _lstPinned = new CheckedListBox
        {
            Location = new Point(14, 26),
            Size = new Size(372, 300),
            CheckOnClick = true,
            IntegralHeight = false,
            HorizontalScrollbar = true
        };

        // Önce seçili sensörler (kayıtlı sırasıyla), ardından diğerleri
        var pinnedIds = _settings.Pinned.ToList();
        foreach (var id in pinnedIds)
        {
            var item = allSensors.FirstOrDefault(s => s.Id == id);
            if (item != null) _lstPinned.Items.Add(item, true);
        }
        foreach (var item in allSensors.Where(s => !pinnedIds.Contains(s.Id)))
        {
            _lstPinned.Items.Add(item, false);
        }
        grpPinned.Controls.Add(_lstPinned);

        var btnUp = new Button { Text = "▲ Yukarı", Location = new Point(394, 26), Size = new Size(80, 30) };
        btnUp.Click += (s, e) => MoveSelected(-1);
        var btnDown = new Button { Text = "▼ Aşağı", Location = new Point(394, 62), Size = new Size(80, 30) };
        btnDown.Click += (s, e) => MoveSelected(1);
        var btnClear = new Button { Text = "Temizle", Location = new Point(394, 110), Size = new Size(80, 30) };
        btnClear.Click += (s, e) =>
        {
            for (int i = 0; i < _lstPinned.Items.Count; i++) _lstPinned.SetItemChecked(i, false);
        };
        var btnDefaults = new Button { Text = "Varsayılan", Location = new Point(394, 146), Size = new Size(80, 30) };
        btnDefaults.Click += (s, e) => ApplyDefaultPinned();

        grpPinned.Controls.Add(btnUp);
        grpPinned.Controls.Add(btnDown);
        grpPinned.Controls.Add(btnClear);
        grpPinned.Controls.Add(btnDefaults);
        Controls.Add(grpPinned);

        // ---------------- Genel
        var grpGeneral = new GroupBox
        {
            Text = "Genel",
            Location = new Point(16, 540),
            Size = new Size(488, 52)
        };
        _chkAutoStart = new CheckBox
        {
            Text = "Windows ile otomatik başlat (UAC uyarısız)",
            Location = new Point(14, 22),
            AutoSize = true,
            Checked = StartupManager.IsScheduled()
        };
        grpGeneral.Controls.Add(_chkAutoStart);
        Controls.Add(grpGeneral);

        // ---------------- Butonlar
        var btnSave = new Button
        {
            Text = "Kaydet",
            Location = new Point(328, 600),
            Size = new Size(85, 30),
            BackColor = Color.FromArgb(0, 120, 215),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat
        };
        btnSave.Click += BtnSave_Click;

        var btnCancel = new Button
        {
            Text = "İptal",
            DialogResult = DialogResult.Cancel,
            Location = new Point(419, 600),
            Size = new Size(85, 30)
        };

        Controls.Add(btnSave);
        Controls.Add(btnCancel);
        AcceptButton = btnSave;
        CancelButton = btnCancel;
    }

    private static string FormatSensorText(ISensor s) =>
        $"{s.Hardware.Name} › {s.Name}  ({SensorFormat.GetTypeName(s.SensorType)})";

    private void MoveSelected(int direction)
    {
        int index = _lstPinned.SelectedIndex;
        int target = index + direction;
        if (index < 0 || target < 0 || target >= _lstPinned.Items.Count) return;

        var item = _lstPinned.Items[index];
        bool isChecked = _lstPinned.GetItemChecked(index);
        _lstPinned.Items.RemoveAt(index);
        _lstPinned.Items.Insert(target, item);
        _lstPinned.SetItemChecked(target, isChecked);
        _lstPinned.SelectedIndex = target;
    }

    private void ApplyDefaultPinned()
    {
        var defaults = _hardwareService.GetDefaultPinnedIds();
        var items = _lstPinned.Items.Cast<SensorItem>().ToList();

        var ordered = defaults
            .Select(id => items.FirstOrDefault(i => i.Id == id))
            .Where(i => i != null)
            .Cast<SensorItem>()
            .ToList();
        var rest = items.Except(ordered).ToList();

        _lstPinned.BeginUpdate();
        _lstPinned.Items.Clear();
        foreach (var i in ordered) _lstPinned.Items.Add(i, true);
        foreach (var i in rest) _lstPinned.Items.Add(i, false);
        _lstPinned.EndUpdate();
    }

    private void BtnSave_Click(object? sender, EventArgs e)
    {
        _settings.BackgroundIntervalMs = (int)(_numBgInterval.Value * 1000);
        _settings.DetailIntervalMs = (int)(_numDetailInterval.Value * 1000);

        if (_cmbTraySensor.SelectedItem is SensorItem traySensor)
        {
            _settings.TraySensorId = traySensor.Id;
        }

        _settings.PinnedSensorIds = _lstPinned.CheckedItems.Cast<SensorItem>().Select(i => i.Id).ToList();

        bool targetAutoStart = _chkAutoStart.Checked;
        if (targetAutoStart != StartupManager.IsScheduled())
        {
            if (targetAutoStart)
            {
                if (!StartupManager.EnableStartup())
                {
                    MessageBox.Show(this, "Görev Zamanlayıcı görevi oluşturulamadı. Lütfen uygulamanın yönetici olarak çalıştığından emin olun.", "Uyarı", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    targetAutoStart = false;
                }
            }
            else
            {
                StartupManager.DisableStartup();
            }
        }

        _settings.StartWithWindows = targetAutoStart;
        _settings.NotifyChanged();
        DialogResult = DialogResult.OK;
        Close();
    }
}
