using System;
using System.Drawing;
using QRCoder;

namespace TrayHardwareMonitor.Helpers;

/// <summary>
/// Endüstri standardı QRCoder kütüphanesini kullanan, tüm telefon kameralarıyla (iOS & Android)
/// %100 uyumlu ve anında taranabilen yüksek kontrastlı QR Kod üreticisi.
/// </summary>
public static class QrCodeHelper
{
    public static Bitmap GenerateQrBitmap(string text, int pixelSize = 230)
    {
        using var qrGenerator = new QRCodeGenerator();
        using var qrData = qrGenerator.CreateQrCode(text, QRCodeGenerator.ECCLevel.M);
        using var qrCode = new QRCode(qrData);
        
        int modules = qrData.ModuleMatrix.Count;
        int pixelsPerModule = Math.Max(2, pixelSize / (modules + 8));
        return qrCode.GetGraphic(pixelsPerModule, Color.Black, Color.White, drawQuietZones: true);
    }
}
