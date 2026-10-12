using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Windows.Forms;
using LibreHardwareMonitor.Hardware;
using TrayHardwareMonitor.Helpers;

namespace TrayHardwareMonitor.UI;

/// <summary>
/// Tepsi simgesinin üzerine gelince açılan mini özet kartı.
/// - 0.5 saniye bekleme süresi (Windows varsayılanı gibi)
/// - Fare çekildiğinde pürüzsüz solarak kapanma (fade-out)
/// - Değerler ile etiketlerin üst üste binmesini engelleyen çift sütun çizimi
/// </summary>
public class MiniSummaryForm : Form
{
    private const int WS_EX_NOACTIVATE = 0x08000000;
    private const int WS_EX_TOOLWINDOW = 0x00000080;
    private const int WS_EX_TOPMOST = 0x00000008;

    private const int CardWidth = 320;
    private const int HeaderHeight = 40;
    private const int RowHeight = 24;
    private const int FooterHeight = 28;
    private const int PaddingX = 14;
    private const int ValueColWidth = 88;

    private readonly record struct Row(string Label, string Value, Color ValueColor);

    private readonly List<Row> _rows = new();
    private readonly Font _titleFont = new("Segoe UI Semibold", 10.5f, FontStyle.Bold);
    private readonly Font _labelFont = new("Segoe UI", 9.5f, FontStyle.Regular);
    private readonly Font _valueFont = new("Segoe UI Semibold", 9.5f, FontStyle.Bold);
    private readonly Font _footerFont = new("Segoe UI", 8f, FontStyle.Italic);

    // Zamanlayıcılar: 0.8s gecikme, fare takip, yumuşak açılma (fade-in), yumuşak kapanma (fade-out)
    private readonly System.Windows.Forms.Timer _openDelayTimer;
    private readonly System.Windows.Forms.Timer _mouseWatchTimer;
    private readonly System.Windows.Forms.Timer _fadeInTimer;
    private readonly System.Windows.Forms.Timer _fadeOutTimer;

    private Point _hoverOrigin;
    private Func<IReadOnlyList<(string Id, ISensor? Sensor)>>? _dataProvider;
    private bool _isFadingOut;

    public MiniSummaryForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false;
        TopMost = true;
        DoubleBuffered = true;
        BackColor = Color.FromArgb(28, 30, 36);
        ForeColor = Color.White;
        Opacity = 0.0;
        Size = new Size(CardWidth, CalculateHeight());

        // 0.8 sn bekleme zamanlayıcısı
        _openDelayTimer = new System.Windows.Forms.Timer { Interval = 800 };
        _openDelayTimer.Tick += OpenDelayTimer_Tick;

        // Fare takip zamanlayıcısı
        _mouseWatchTimer = new System.Windows.Forms.Timer { Interval = 40 };
        _mouseWatchTimer.Tick += MouseWatchTimer_Tick;

        // Yumuşak açılma (fade-in) zamanlayıcısı (~120-150 ms)
        _fadeInTimer = new System.Windows.Forms.Timer { Interval = 16 };
        _fadeInTimer.Tick += FadeInTimer_Tick;

        // Yumuşak kapanma (fade-out) zamanlayıcısı (~120-150 ms)
        _fadeOutTimer = new System.Windows.Forms.Timer { Interval = 16 };
        _fadeOutTimer.Tick += FadeOutTimer_Tick;
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST;
            return cp;
        }
    }

    protected override bool ShowWithoutActivation => true;

    private int CalculateHeight() => HeaderHeight + (_rows.Count == 0 ? 2 : _rows.Count) * RowHeight + FooterHeight;

    public void SetDataProvider(Func<IReadOnlyList<(string Id, ISensor? Sensor)>> provider)
    {
        _dataProvider = provider;
    }

    /// <summary>Fare tepsi simgesinin üzerindeyken tetiklenir (0.8 sn gecikmeli solarak açılış).</summary>
    public void NotifyTrayHover()
    {
        // Eğer solarak kapanıyorsa, hemen yönü değiştirip tekrar solarak açılsın
        if (_isFadingOut)
        {
            _fadeOutTimer.Stop();
            _isFadingOut = false;
            _fadeInTimer.Start();
            return;
        }

        // Kart zaten açık veya açılıyorsa
        if (Visible)
        {
            return;
        }

        // Henüz bekleme başlamadıysa 0.8 saniyelik zamanlayıcıyı başlat
        if (!_openDelayTimer.Enabled)
        {
            _hoverOrigin = Cursor.Position;
            _openDelayTimer.Start();
            _mouseWatchTimer.Start();
        }
    }

    private void OpenDelayTimer_Tick(object? sender, EventArgs e)
    {
        _openDelayTimer.Stop();

        // Fare 0.5 saniye sonra hâlâ başlangıç noktasının yakınındaysa aç
        var currentMouse = Cursor.Position;
        int dx = Math.Abs(currentMouse.X - _hoverOrigin.X);
        int dy = Math.Abs(currentMouse.Y - _hoverOrigin.Y);

        if (dx <= 35 && dy <= 35)
        {
            if (_dataProvider != null)
            {
                UpdateData(_dataProvider());
            }

            ShowNearPoint(_hoverOrigin);
        }
        else
        {
            _mouseWatchTimer.Stop();
        }
    }

    private void MouseWatchTimer_Tick(object? sender, EventArgs e)
    {
        var mouse = Cursor.Position;

        // Henüz açılmamışsa ve kullanıcı 0.5 sn dolmadan fareyi çekmişse beklemeyi iptal et
        if (_openDelayTimer.Enabled)
        {
            int dx = Math.Abs(mouse.X - _hoverOrigin.X);
            int dy = Math.Abs(mouse.Y - _hoverOrigin.Y);
            if (dx > 35 || dy > 35)
            {
                _openDelayTimer.Stop();
                _mouseWatchTimer.Stop();
            }
            return;
        }

        // Açık durumdaysa: fare kartın veya tepsi simgesinin dışına çıktı mı?
        if (Visible && !_isFadingOut)
        {
            // Kart alanına 12 piksel tolerans ekle + tepsi simgesi civarı
            var cardBounds = new Rectangle(Left - 10, Top - 10, Width + 20, Height + 20);
            var trayIconArea = new Rectangle(_hoverOrigin.X - 25, _hoverOrigin.Y - 25, 50, 50);

            if (!cardBounds.Contains(mouse) && !trayIconArea.Contains(mouse))
            {
                // Fare çekildi -> Windows gibi solarak hemen kapanmaya başla
                StartFadeOut();
            }
        }
    }

    private void StartFadeOut()
    {
        _fadeInTimer.Stop();
        if (_isFadingOut) return;
        _isFadingOut = true;
        _fadeOutTimer.Start();
    }

    private void FadeInTimer_Tick(object? sender, EventArgs e)
    {
        double newOpacity = Opacity + 0.16;
        if (newOpacity >= 1.0)
        {
            Opacity = 1.0;
            _fadeInTimer.Stop();
        }
        else
        {
            Opacity = newOpacity;
        }
    }

    private void FadeOutTimer_Tick(object? sender, EventArgs e)
    {
        // Fare solma sırasında tekrar geri gelirse solmayı iptal et ve tekrar solarak açılsın
        var mouse = Cursor.Position;
        var cardBounds = new Rectangle(Left - 10, Top - 10, Width + 20, Height + 20);
        var trayIconArea = new Rectangle(_hoverOrigin.X - 25, _hoverOrigin.Y - 25, 50, 50);

        if (cardBounds.Contains(mouse) || trayIconArea.Contains(mouse))
        {
            _fadeOutTimer.Stop();
            _isFadingOut = false;
            _fadeInTimer.Start();
            return;
        }

        // Hızlı ve akıcı solma (yaklaşık 120-150 ms içinde kapanır)
        double newOpacity = Opacity - 0.16;
        if (newOpacity <= 0.05)
        {
            _fadeOutTimer.Stop();
            _fadeInTimer.Stop();
            _mouseWatchTimer.Stop();
            _isFadingOut = false;
            Hide();
            Opacity = 0.0;
        }
        else
        {
            Opacity = newOpacity;
        }
    }

    /// <summary>Menü açıldığında veya tıklandığında anında kapatır.</summary>
    public void DismissImmediate()
    {
        _openDelayTimer.Stop();
        _mouseWatchTimer.Stop();
        _fadeInTimer.Stop();
        _fadeOutTimer.Stop();
        _isFadingOut = false;
        Hide();
        Opacity = 0.0;
    }

    /// <summary>Gösterilecek sensör listesini günceller.</summary>
    public void UpdateData(IReadOnlyList<(string Id, ISensor? Sensor)> sensors)
    {
        _rows.Clear();
        foreach (var (_, sensor) in sensors)
        {
            if (sensor == null) continue;
            _rows.Add(new Row(
                SensorFormat.GetDisplayLabel(sensor),
                SensorFormat.FormatValue(sensor.SensorType, sensor.Value),
                SensorFormat.GetValueColor(sensor.SensorType, sensor.Value)));
        }

        int newHeight = CalculateHeight();
        if (newHeight != Height)
        {
            int bottom = Bottom;
            Height = newHeight;
            if (Visible) Top = bottom - newHeight;
        }

        Invalidate();
    }

    private void ShowNearPoint(Point mouse)
    {
        var screen = Screen.FromPoint(mouse).WorkingArea;

        int x = mouse.X - (Width / 2);
        int y = mouse.Y - Height - 16;

        x = Math.Clamp(x, screen.Left + 8, screen.Right - Width - 8);
        if (y < screen.Top + 8) y = mouse.Y + 16;
        if (y + Height > screen.Bottom - 8) y = screen.Bottom - Height - 8;

        Location = new Point(x, y);
        Opacity = 0.05;
        _isFadingOut = false;
        Show();
        _fadeInTimer.Start();
        _mouseWatchTimer.Start();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

        // Accent top bar
        using (var barBrush = new LinearGradientBrush(
                   new Point(0, 0), new Point(Width, 0),
                   Color.FromArgb(0, 180, 255), Color.FromArgb(120, 90, 255)))
        {
            g.FillRectangle(barBrush, 0, 0, Width, 3);
        }

        // Title
        TextRenderer.DrawText(g, "⚡ Sistem Özeti", _titleFont, new Point(PaddingX - 2, 12), Color.FromArgb(0, 180, 255));

        int y = HeaderHeight;
        int contentWidth = Width - PaddingX * 2;
        int labelWidth = contentWidth - ValueColWidth - 8;

        if (_rows.Count == 0)
        {
            TextRenderer.DrawText(g, "Sensör seçilmedi – Ayarlar'dan veya detay penceresinde sağ tıkla ekleyin.",
                _footerFont, new Rectangle(PaddingX, y, contentWidth, RowHeight * 2),
                Color.FromArgb(170, 175, 185), TextFormatFlags.WordBreak | TextFormatFlags.VerticalCenter);
        }
        else
        {
            using var separatorPen = new Pen(Color.FromArgb(40, 44, 54));
            for (int i = 0; i < _rows.Count; i++)
            {
                var row = _rows[i];

                // Etiket ve Değer için ayrı ayrılmış dikdörtgenler (çakışma/üst üste binme kesinlikle olmaz)
                var labelRect = new Rectangle(PaddingX, y, labelWidth, RowHeight);
                var valueRect = new Rectangle(PaddingX + labelWidth + 8, y, ValueColWidth, RowHeight);

                TextRenderer.DrawText(g, row.Label, _labelFont, labelRect, Color.FromArgb(215, 220, 228),
                    TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);

                TextRenderer.DrawText(g, row.Value, _valueFont, valueRect, row.ValueColor,
                    TextFormatFlags.Right | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix);

                if (i < _rows.Count - 1)
                {
                    g.DrawLine(separatorPen, PaddingX, y + RowHeight - 1, Width - PaddingX, y + RowHeight - 1);
                }
                y += RowHeight;
            }
        }

        // Footer
        TextRenderer.DrawText(g, "Detaylı rapor için simgeye tıklayın", _footerFont,
            new Point(PaddingX, Height - FooterHeight + 7), Color.FromArgb(130, 140, 155));

        // Subtle modern card border
        using var borderPen = new Pen(Color.FromArgb(60, 68, 85), 1f);
        g.SmoothingMode = SmoothingMode.None;
        g.DrawRectangle(borderPen, 0, 0, Width - 1, Height - 1);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _openDelayTimer.Dispose();
            _mouseWatchTimer.Dispose();
            _fadeInTimer.Dispose();
            _fadeOutTimer.Dispose();
            _titleFont.Dispose();
            _labelFont.Dispose();
            _valueFont.Dispose();
            _footerFont.Dispose();
        }
        base.Dispose(disposing);
    }
}
