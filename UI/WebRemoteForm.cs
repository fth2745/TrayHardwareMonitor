using System;
using System.Diagnostics;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using TrayHardwareMonitor.Helpers;
using TrayHardwareMonitor.Services;

namespace TrayHardwareMonitor.UI;

public class WebRemoteForm : Form
{
    private readonly WebServerService _webServer;
    private readonly AppSettings _settings;

    private readonly Label _lblStatus;
    private readonly ComboBox _cmbIpAddresses;
    private readonly NumericUpDown _numPort;
    private readonly Button _btnToggleServer;
    private readonly PictureBox _picQrCode;
    private readonly TextBox _txtUrl;
    private readonly Button _btnOpenBrowser;
    private readonly Button _btnOpenV2Browser;
    private readonly Button _btnCopyUrl;
    private readonly CheckBox _chkAutoStart;
    private readonly Label _lblInfo;

    public WebRemoteForm(WebServerService webServer, AppSettings settings)
    {
        _webServer = webServer;
        _settings = settings;

        Text = "📱 Mobil & Web Telemetri İzleyici - Tray Hardware Monitor";
        ClientSize = new Size(500, 600);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(246, 247, 251);
        // Kullanıcı bu ekranı açtığında sunucu kapalıysa otomatik başlat, böylece hemen kullanıma hazır olsun
        if (!_webServer.IsRunning)
        {
            _webServer.Start();
        }

        // ---------------- 1. Üst Durum Kartı
        var grpStatus = new GroupBox
        {
            Text = "🌐 Sunucu Durumu & Bağlantı",
            Location = new Point(16, 12),
            Size = new Size(468, 120),
            Font = new Font("Segoe UI Semibold", 9.5f)
        };

        _lblStatus = new Label
        {
            Location = new Point(14, 26),
            Size = new Size(260, 26),
            Font = new Font("Segoe UI", 10.5f, FontStyle.Bold),
            Text = "Durum kontrol ediliyor..."
        };
        grpStatus.Controls.Add(_lblStatus);

        _btnToggleServer = new Button
        {
            Location = new Point(290, 22),
            Size = new Size(164, 32),
            Font = new Font("Segoe UI Semibold", 9.5f),
            FlatStyle = FlatStyle.System
        };
        _btnToggleServer.Click += (s, e) => ToggleServer();
        grpStatus.Controls.Add(_btnToggleServer);

        grpStatus.Controls.Add(new Label
        {
            Text = "IP Adresi:",
            Location = new Point(14, 62),
            AutoSize = true,
            Font = new Font("Segoe UI", 9f)
        });

        _cmbIpAddresses = new ComboBox
        {
            Location = new Point(80, 59),
            Width = 190,
            DropDownStyle = ComboBoxStyle.DropDownList,
            Font = new Font("Segoe UI", 9f)
        };
        PopulateIpAddresses();
        _cmbIpAddresses.SelectedIndexChanged += (s, e) => UpdateQrAndUrl();
        grpStatus.Controls.Add(_cmbIpAddresses);

        grpStatus.Controls.Add(new Label
        {
            Text = "Port:",
            Location = new Point(285, 62),
            AutoSize = true,
            Font = new Font("Segoe UI", 9f)
        });

        _numPort = new NumericUpDown
        {
            Location = new Point(325, 59),
            Width = 75,
            Minimum = 1024,
            Maximum = 65535,
            Value = _settings.WebServerPort,
            Font = new Font("Segoe UI", 9f)
        };
        grpStatus.Controls.Add(_numPort);

        var btnApplyPort = new Button
        {
            Text = "Uygula",
            Location = new Point(405, 58),
            Size = new Size(50, 27),
            Font = new Font("Segoe UI", 8.5f)
        };
        btnApplyPort.Click += (s, e) => ApplyPortChange();
        grpStatus.Controls.Add(btnApplyPort);

        _chkAutoStart = new CheckBox
        {
            Text = "Uygulama açılışında web sunucusunu otomatik başlat",
            Location = new Point(14, 92),
            AutoSize = true,
            Font = new Font("Segoe UI", 8.5f),
            Checked = _settings.WebServerEnabled
        };
        _chkAutoStart.CheckedChanged += (s, e) =>
        {
            _settings.WebServerEnabled = _chkAutoStart.Checked;
            _settings.NotifyChanged();
        };
        grpStatus.Controls.Add(_chkAutoStart);

        Controls.Add(grpStatus);

        // ---------------- 2. QR Kod ve URL Kartı
        var grpQr = new GroupBox
        {
            Text = "📷 QR Kod İle Telefondan / Tabletten Bağlan",
            Location = new Point(16, 140),
            Size = new Size(468, 380),
            Font = new Font("Segoe UI Semibold", 9.5f)
        };

        _picQrCode = new PictureBox
        {
            Location = new Point(114, 28),
            Size = new Size(240, 240),
            SizeMode = PictureBoxSizeMode.CenterImage,
            BackColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle
        };
        grpQr.Controls.Add(_picQrCode);

        _txtUrl = new TextBox
        {
            Location = new Point(24, 282),
            Size = new Size(420, 26),
            ReadOnly = true,
            TextAlign = HorizontalAlignment.Center,
            Font = new Font("Segoe UI", 10f, FontStyle.Bold),
            BackColor = Color.White,
            ForeColor = Color.FromArgb(70, 20, 120)
        };
        grpQr.Controls.Add(_txtUrl);

        _btnOpenBrowser = new Button
        {
            Text = "🌐 v1 Aç",
            Location = new Point(24, 318),
            Size = new Size(130, 34),
            Font = new Font("Segoe UI Semibold", 9.5f),
            BackColor = Color.FromArgb(0, 120, 215),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat
        };
        _btnOpenBrowser.FlatAppearance.BorderSize = 0;
        _btnOpenBrowser.Click += (s, e) => OpenInBrowser();
        grpQr.Controls.Add(_btnOpenBrowser);

        _btnOpenV2Browser = new Button
        {
            Text = "✨ UI v2 Aç",
            Location = new Point(164, 318),
            Size = new Size(140, 34),
            Font = new Font("Segoe UI Semibold", 9.5f),
            BackColor = Color.FromArgb(37, 99, 235),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat
        };
        _btnOpenV2Browser.FlatAppearance.BorderSize = 0;
        _btnOpenV2Browser.Click += (s, e) => OpenInBrowser("/v2");
        grpQr.Controls.Add(_btnOpenV2Browser);

        _btnCopyUrl = new Button
        {
            Text = "📋 Adresi Kopyala",
            Location = new Point(314, 318),
            Size = new Size(130, 34),
            Font = new Font("Segoe UI Semibold", 9.5f),
            BackColor = Color.White,
            FlatStyle = FlatStyle.Flat
        };
        _btnCopyUrl.Click += (s, e) => CopyUrlToClipboard();
        grpQr.Controls.Add(_btnCopyUrl);

        Controls.Add(grpQr);

        // ---------------- 3. Alt Bilgi
        _lblInfo = new Label
        {
            Location = new Point(16, 528),
            Size = new Size(468, 55),
            Font = new Font("Segoe UI", 8.5f),
            ForeColor = Color.FromArgb(90, 95, 110),
            Text = "💡 İpucu: Telefon veya tabletinizin bu bilgisayarla aynı Wi-Fi/yerel ağa bağlı olduğundan emin olun. Kamerayı QR koda tutarak kurulum yapmadan canlı grafikleri izleyebilirsiniz."
        };
        Controls.Add(_lblInfo);

        // Olay dinleyicisi
        _webServer.StatusChanged += UpdateUiState;
        UpdateUiState();
    }

    private void PopulateIpAddresses()
    {
        _cmbIpAddresses.Items.Clear();
        var ips = WebServerService.GetLocalIpAddresses();
        foreach (var ip in ips)
        {
            _cmbIpAddresses.Items.Add(ip);
        }
        if (_cmbIpAddresses.Items.Count > 0)
        {
            _cmbIpAddresses.SelectedIndex = 0;
        }
    }

    private void UpdateUiState()
    {
        if (InvokeRequired)
        {
            BeginInvoke(UpdateUiState);
            return;
        }

        if (_webServer.IsRunning)
        {
            _lblStatus.Text = "🟢 Sunucu Aktif";
            _lblStatus.ForeColor = Color.FromArgb(16, 140, 60);
            _btnToggleServer.Text = "⏹️ Sunucuyu Durdur";
            _btnOpenBrowser.Enabled = true;
            _btnOpenV2Browser.Enabled = true;
            _btnCopyUrl.Enabled = true;
        }
        else
        {
            _lblStatus.Text = _webServer.LastError != null ? "⚠️ Hata: Durduruldu" : "🔴 Sunucu Durduruldu";
            _lblStatus.ForeColor = Color.FromArgb(200, 30, 30);
            _btnToggleServer.Text = "▶️ Sunucuyu Başlat";
            _btnOpenBrowser.Enabled = false;
            _btnOpenV2Browser.Enabled = false;
            _btnCopyUrl.Enabled = false;
        }

        UpdateQrAndUrl();
    }

    private void UpdateQrAndUrl()
    {
        string selectedIp = _cmbIpAddresses.SelectedItem?.ToString() ?? "localhost";
        int port = (int)_numPort.Value;
        string url = $"http://{selectedIp}:{port}";
        _txtUrl.Text = url;

        if (_webServer.IsRunning)
        {
            try
            {
                var oldBmp = _picQrCode.Image;
                _picQrCode.Image = QrCodeHelper.GenerateQrBitmap(url, 230);
                oldBmp?.Dispose();
            }
            catch
            {
                _picQrCode.Image = null;
            }
        }
        else
        {
            var oldBmp = _picQrCode.Image;
            var placeholder = new Bitmap(230, 230);
            using (var g = Graphics.FromImage(placeholder))
            {
                g.Clear(Color.FromArgb(240, 242, 248));
                using var font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
                using var brush = new SolidBrush(Color.FromArgb(120, 130, 150));
                var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                g.DrawString("Sunucu Durduruldu\n\nBaşlatmak için yukarıdaki\n[▶️ Sunucuyu Başlat]\nbutonuna tıklayın.", font, brush, new RectangleF(10, 10, 210, 210), sf);
            }
            _picQrCode.Image = placeholder;
            oldBmp?.Dispose();
        }
    }

    private void ToggleServer()
    {
        if (_webServer.IsRunning)
        {
            _webServer.Stop();
        }
        else
        {
            if (!_webServer.Start())
            {
                MessageBox.Show(this, _webServer.LastError ?? "Sunucu başlatılamadı.", "Hata", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    private void ApplyPortChange()
    {
        int newPort = (int)_numPort.Value;
        if (newPort == _settings.WebServerPort && _webServer.IsRunning) return;

        _settings.WebServerPort = newPort;
        _settings.NotifyChanged();

        if (_webServer.IsRunning)
        {
            _webServer.Restart();
        }
        UpdateUiState();
    }

    private void OpenInBrowser(string suffix = "")
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = _txtUrl.Text.TrimEnd('/') + suffix,
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "Tarayıcı açılamadı: " + ex.Message, "Uyarı", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void CopyUrlToClipboard()
    {
        try
        {
            Clipboard.SetText(_txtUrl.Text);
            _lblInfo.Text = "✅ Bağlantı adresi panoya kopyalandı! Tarayıcınıza yapıştırabilirsiniz.";
            _lblInfo.ForeColor = Color.FromArgb(16, 140, 60);
        }
        catch { }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        _webServer.StatusChanged -= UpdateUiState;
        base.OnFormClosing(e);
    }
}

