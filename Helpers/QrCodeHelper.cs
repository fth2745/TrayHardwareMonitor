using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Text;

namespace TrayHardwareMonitor.Helpers;

/// <summary>
/// Harici kütüphane gerektirmeyen, hafif, saf C# QR Kod üretici.
/// Verilen metni (URL) QR Matrix'e dönüştürür ve yüksek çözünürlüklü GDI+ Bitmap olarak çizer.
/// </summary>
public static class QrCodeHelper
{
    public static Bitmap GenerateQrBitmap(string text, int pixelSize = 260)
    {
        bool[,] matrix = EncodeQr(text);
        int modules = matrix.GetLength(0);
        int margin = 4; // Quiet zone
        int totalModules = modules + margin * 2;
        int scale = Math.Max(1, pixelSize / totalModules);
        int actualSize = totalModules * scale;

        var bitmap = new Bitmap(actualSize, actualSize);
        using (var g = Graphics.FromImage(bitmap))
        {
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            g.Clear(Color.White);

            using var brush = new SolidBrush(Color.FromArgb(20, 10, 40)); // Deep Twilight Purple modules

            for (int r = 0; r < modules; r++)
            {
                for (int c = 0; c < modules; c++)
                {
                    if (matrix[r, c])
                    {
                        g.FillRectangle(brush, (c + margin) * scale, (r + margin) * scale, scale, scale);
                    }
                }
            }
        }
        return bitmap;
    }

    // ---------------------------------------------------------------- QR Encoder Core
    // QR Code Model 2 (Byte encoding, ECC Low/Medium, Versions 1-6)

    private static readonly int[] CapacityBytesEccM = { 0, 14, 26, 42, 62, 84, 106 };
    private static readonly int[] TotalCodewords = { 0, 26, 44, 70, 100, 134, 172 };
    private static readonly int[] EccCodewordsPerBlock = { 0, 10, 16, 26, 18, 24, 16 };
    private static readonly int[] NumBlocks = { 0, 1, 1, 1, 2, 2, 4 };

    private static bool[,] EncodeQr(string text)
    {
        byte[] data = Encoding.UTF8.GetBytes(text);
        int version = 1;
        while (version < CapacityBytesEccM.Length && data.Length > CapacityBytesEccM[version])
        {
            version++;
        }
        if (version >= CapacityBytesEccM.Length) version = CapacityBytesEccM.Length - 1;

        int size = 17 + version * 4;
        var matrix = new bool[size, size];
        var isFunction = new bool[size, size];

        // 1. Finder patterns
        DrawFinder(matrix, isFunction, 0, 0);
        DrawFinder(matrix, isFunction, size - 7, 0);
        DrawFinder(matrix, isFunction, 0, size - 7);

        // 2. Alignment patterns (version >= 2)
        if (version >= 2)
        {
            int alignPos = version * 4 + 10;
            DrawAlignment(matrix, isFunction, alignPos, alignPos);
        }

        // 3. Timing patterns
        for (int i = 8; i < size - 8; i++)
        {
            bool val = (i % 2) == 0;
            matrix[6, i] = val; isFunction[6, i] = true;
            matrix[i, 6] = val; isFunction[i, 6] = true;
        }

        // 4. Reserve format info areas
        for (int i = 0; i < 9; i++)
        {
            isFunction[8, i] = true;
            isFunction[i, 8] = true;
            if (size - 1 - i < size)
            {
                isFunction[8, size - 1 - i] = true;
                isFunction[size - 1 - i, 8] = true;
            }
        }
        isFunction[size - 8, 8] = true;
        matrix[size - 8, 8] = true; // Dark module

        // 5. Build bit stream
        byte[] payload = GenerateCodewords(data, version);

        // 6. Place data bits (zigzag)
        int byteIdx = 0;
        int bitIdx = 7;
        int right = size - 1;
        bool upward = true;

        while (right > 0)
        {
            if (right == 6) right--; // Skip vertical timing pattern
            for (int vert = 0; vert < size; vert++)
            {
                int r = upward ? size - 1 - vert : vert;
                for (int colOffset = 0; colOffset < 2; colOffset++)
                {
                    int c = right - colOffset;
                    if (isFunction[r, c]) continue;

                    bool bit = false;
                    if (byteIdx < payload.Length)
                    {
                        bit = ((payload[byteIdx] >> bitIdx) & 1) == 1;
                        bitIdx--;
                        if (bitIdx < 0)
                        {
                            bitIdx = 7;
                            byteIdx++;
                        }
                    }

                    // Apply mask 000: (r + c) % 2 == 0
                    bool mask = ((r + c) % 2) == 0;
                    matrix[r, c] = bit ^ mask;
                }
            }
            upward = !upward;
            right -= 2;
        }

        // 7. Write Format Bits (ECC M, Mask 000 = format 0x4E7B)
        int formatBits = 0x4E7B;
        for (int i = 0; i < 15; i++)
        {
            bool b = ((formatBits >> i) & 1) == 1;
            if (i < 6) matrix[8, i] = b;
            else if (i < 8) matrix[8, i + 1] = b;
            else if (i == 8) matrix[7, 8] = b;
            else matrix[14 - i, 8] = b;

            if (i < 8) matrix[size - 1 - i, 8] = b;
            else matrix[8, size - 15 + i] = b;
        }

        return matrix;
    }

    private static void DrawFinder(bool[,] m, bool[,] f, int r, int c)
    {
        for (int dr = -1; dr <= 7; dr++)
        {
            for (int dc = -1; dc <= 7; dc++)
            {
                int nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < m.GetLength(0) && nc >= 0 && nc < m.GetLength(1))
                {
                    f[nr, nc] = true;
                    if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6)
                    {
                        m[nr, nc] = (dr == 0 || dr == 6 || dc == 0 || dc == 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
                    }
                    else
                    {
                        m[nr, nc] = false;
                    }
                }
            }
        }
    }

    private static void DrawAlignment(bool[,] m, bool[,] f, int r, int c)
    {
        for (int dr = -2; dr <= 2; dr++)
        {
            for (int dc = -2; dc <= 2; dc++)
            {
                int nr = r + dr, nc = c + dc;
                f[nr, nc] = true;
                m[nr, nc] = (Math.Abs(dr) == 2 || Math.Abs(dc) == 2 || (dr == 0 && dc == 0));
            }
        }
    }

    private static byte[] GenerateCodewords(byte[] data, int version)
    {
        int totalDataBytes = CapacityBytesEccM[version];
        var bitBuffer = new List<bool>();

        // Mode: Byte (0100)
        bitBuffer.Add(false); bitBuffer.Add(true); bitBuffer.Add(false); bitBuffer.Add(false);

        // Character count indicator (8 bits for version 1-9 in byte mode)
        int length = Math.Min(data.Length, totalDataBytes);
        for (int i = 7; i >= 0; i--)
        {
            bitBuffer.Add(((length >> i) & 1) == 1);
        }

        // Data bytes
        for (int i = 0; i < length; i++)
        {
            byte b = data[i];
            for (int bit = 7; bit >= 0; bit--)
            {
                bitBuffer.Add(((b >> bit) & 1) == 1);
            }
        }

        // Terminator (up to 4 zeroes)
        int maxBits = totalDataBytes * 8;
        for (int i = 0; i < 4 && bitBuffer.Count < maxBits; i++)
        {
            bitBuffer.Add(false);
        }

        // Pad to byte
        while (bitBuffer.Count % 8 != 0 && bitBuffer.Count < maxBits)
        {
            bitBuffer.Add(false);
        }

        // Pad bytes (0xEC, 0x11)
        byte[] dataCodewords = new byte[totalDataBytes];
        int bytePos = 0;
        for (int i = 0; i < bitBuffer.Count; i += 8)
        {
            byte b = 0;
            for (int bit = 0; bit < 8; bit++)
            {
                if (bitBuffer[i + bit]) b |= (byte)(1 << (7 - bit));
            }
            dataCodewords[bytePos++] = b;
        }

        byte pad = 0xEC;
        while (bytePos < totalDataBytes)
        {
            dataCodewords[bytePos++] = pad;
            pad = (pad == 0xEC) ? (byte)0x11 : (byte)0xEC;
        }

        // Reed-Solomon Error Correction
        int eccPerBlock = EccCodewordsPerBlock[version];
        int numBlocks = NumBlocks[version];
        int dataBytesPerBlock = totalDataBytes / numBlocks;

        var blockData = new byte[numBlocks][];
        var blockEcc = new byte[numBlocks][];

        for (int b = 0; b < numBlocks; b++)
        {
            blockData[b] = new byte[dataBytesPerBlock];
            Array.Copy(dataCodewords, b * dataBytesPerBlock, blockData[b], 0, dataBytesPerBlock);
            blockEcc[b] = CalculateReedSolomon(blockData[b], eccPerBlock);
        }

        // Interleave data and ECC codewords
        int totalCw = TotalCodewords[version];
        byte[] result = new byte[totalCw];
        int outIdx = 0;

        for (int i = 0; i < dataBytesPerBlock; i++)
        {
            for (int b = 0; b < numBlocks; b++)
            {
                result[outIdx++] = blockData[b][i];
            }
        }

        for (int i = 0; i < eccPerBlock; i++)
        {
            for (int b = 0; b < numBlocks; b++)
            {
                result[outIdx++] = blockEcc[b][i];
            }
        }

        return result;
    }

    // Reed-Solomon Galois Field GF(256) with generator poly 0x11D
    private static readonly byte[] Exp = new byte[512];
    private static readonly byte[] Log = new byte[256];

    static QrCodeHelper()
    {
        int x = 1;
        for (int i = 0; i < 255; i++)
        {
            Exp[i] = (byte)x;
            Exp[i + 255] = (byte)x;
            Log[x] = (byte)i;
            x <<= 1;
            if ((x & 0x100) != 0) x ^= 0x11D;
        }
    }

    private static byte GfMultiply(byte x, byte y)
    {
        if (x == 0 || y == 0) return 0;
        return Exp[Log[x] + Log[y]];
    }

    private static byte[] CalculateReedSolomon(byte[] data, int eccCount)
    {
        // Build generator polynomial
        byte[] gen = { 1 };
        for (int i = 0; i < eccCount; i++)
        {
            byte[] nextGen = new byte[gen.Length + 1];
            byte factor = Exp[i];
            for (int j = 0; j < gen.Length; j++)
            {
                nextGen[j] ^= GfMultiply(gen[j], factor);
                nextGen[j + 1] ^= gen[j];
            }
            gen = nextGen;
        }

        // Polynomial division
        byte[] res = new byte[eccCount];
        foreach (byte d in data)
        {
            byte factor = (byte)(d ^ res[0]);
            Array.Copy(res, 1, res, 0, eccCount - 1);
            res[eccCount - 1] = 0;
            for (int j = 0; j < eccCount; j++)
            {
                res[j] ^= GfMultiply(gen[j], factor);
            }
        }
        return res;
    }
}

