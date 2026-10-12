using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Runtime.InteropServices;

namespace TrayHardwareMonitor.Helpers;

public static class IconRenderer
{
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool DestroyIcon(IntPtr handle);

    /// <summary>Kısa bir metni (ör. "48", "100", "1.2k") renkli olarak 32x32 tepsi simgesine çizer.</summary>
    public static Icon CreateTextIcon(string text, Color textColor)
    {
        // 32x32 canvas scales down crisply on 100%, 125%, 150% and 200% DPI
        const int size = 32;

        using var bitmap = new Bitmap(size, size);
        using (var g = Graphics.FromImage(bitmap))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.Clear(Color.Transparent);

            // Dark rounded background so it's clearly readable on both Light and Dark Windows taskbars
            using (var bgBrush = new SolidBrush(Color.FromArgb(215, 25, 25, 30)))
            using (var path = GetRoundedRect(new Rectangle(0, 0, size - 1, size - 1), 6))
            {
                g.FillPath(bgBrush, path);
            }

            float fontSize = text.Length switch
            {
                <= 2 => 21f,
                3 => 15f,
                _ => 11.5f
            };

            using var font = new Font("Segoe UI", fontSize, FontStyle.Bold, GraphicsUnit.Pixel);
            using var brush = new SolidBrush(textColor);
            using var stringFormat = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center,
                FormatFlags = StringFormatFlags.NoWrap
            };

            // Subtle vertical offset for visual centering
            var rect = new RectangleF(-2, 1, size + 4, size);
            g.DrawString(text, font, brush, rect, stringFormat);
        }

        IntPtr hIcon = bitmap.GetHicon();
        try
        {
            // Clone the icon so it doesn't depend on the native hIcon handle
            using var tempIcon = Icon.FromHandle(hIcon);
            return (Icon)tempIcon.Clone();
        }
        finally
        {
            DestroyIcon(hIcon); // Always clean up native GDI handle
        }
    }

    private static GraphicsPath GetRoundedRect(Rectangle bounds, int radius)
    {
        int diameter = radius * 2;
        var path = new GraphicsPath();
        var arc = new Rectangle(bounds.Location, new Size(diameter, diameter));

        // Top left
        path.AddArc(arc, 180, 90);

        // Top right
        arc.X = bounds.Right - diameter;
        path.AddArc(arc, 270, 90);

        // Bottom right
        arc.Y = bounds.Bottom - diameter;
        path.AddArc(arc, 0, 90);

        // Bottom left
        arc.X = bounds.Left;
        path.AddArc(arc, 90, 90);

        path.CloseFigure();
        return path;
    }
}
