using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using LibreHardwareMonitor.Hardware;
using TrayHardwareMonitor.Helpers;

namespace TrayHardwareMonitor.Services;

/// <summary>
/// Mobil ve masaüstü tarayıcılardan anlık telemetri takibi sağlayan,
/// Windows izinlerinden (URLACL) bağımsız çalışan TcpListener tabanlı hafif yerel HTTP sunucusu.
/// </summary>
public class WebServerService : IDisposable
{
    private readonly HardwareMonitorService _hardwareService;
    private readonly AppSettings _settings;
    private TcpListener? _listener;
    private CancellationTokenSource? _cts;
    private readonly object _lock = new();

    // Sensörlerin kümülatif ortalama istatistikleri (Sum, Count)
    private readonly Dictionary<ISensor, (double Sum, int Count)> _stats = new();

    // UI v2 için 15 dakikalık (900 örnek @ 1sn) sunucu tarafı halka tamponu (Ring Buffer)
    private const int MaxHistorySamples = 900;
    private readonly Dictionary<string, List<float>> _historyBuffer = new();
    private readonly object _configLock = new();
    private static readonly string UiV2ConfigPath = Path.Combine(AppContext.BaseDirectory, "uiv2-config.json");

    public bool IsRunning { get; private set; }
    public int Port => _settings.WebServerPort;
    public string? LastError { get; private set; }

    public event Action? StatusChanged;

    public WebServerService(HardwareMonitorService hardwareService, AppSettings settings)
    {
        _hardwareService = hardwareService;
        _settings = settings;
    }

    public bool Start()
    {
        lock (_lock)
        {
            if (IsRunning) return true;
            LastError = null;

            int port = _settings.WebServerPort;
            if (port < 1024 || port > 65535) port = 8085;

            try
            {
                _listener = new TcpListener(IPAddress.Any, port);
                _listener.Server.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                _listener.Start();

                IsRunning = true;
                _cts = new CancellationTokenSource();
                _ = AcceptClientsAsync(_listener, _cts.Token);
                _ = RecordHistoryLoopAsync(_cts.Token);
                StatusChanged?.Invoke();
                return true;
            }
            catch (Exception ex)
            {
                LastError = $"Port {port} başlatılamadı: {ex.Message}";
                _listener = null;
                IsRunning = false;
                StatusChanged?.Invoke();
                return false;
            }
        }
    }

    public void Stop()
    {
        lock (_lock)
        {
            if (!IsRunning) return;
            try
            {
                _cts?.Cancel();
                _listener?.Stop();
            }
            catch { }
            finally
            {
                _listener = null;
                _cts = null;
                lock (_stats)
                {
                    _stats.Clear();
                }
                lock (_historyBuffer)
                {
                    _historyBuffer.Clear();
                }
                IsRunning = false;
                StatusChanged?.Invoke();
                GC.Collect(1, GCCollectionMode.Optimized);
            }
        }
    }

    public void Restart()
    {
        Stop();
        Start();
    }

    private async Task AcceptClientsAsync(TcpListener listener, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var client = await listener.AcceptTcpClientAsync(ct).ConfigureAwait(false);
                _ = HandleClientAsync(client, ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (ObjectDisposedException)
            {
                break;
            }
            catch (Exception ex)
            {
                if (!IsRunning) break;
                System.Diagnostics.Debug.WriteLine($"[WebServer] Accept error: {ex.Message}");
            }
        }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken ct)
    {
        try
        {
            using (client)
            using (var stream = client.GetStream())
            {
                using var reqCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                reqCts.CancelAfter(4000); // Her HTTP isteği için en fazla 4 sn zaman aşımı

                try
                {
                    stream.ReadTimeout = 4000;
                    stream.WriteTimeout = 4000;

                    // Başlıkları ve isteği ham bayt tamponuna oku
                    byte[] headerBuf = new byte[8192];
                    int totalHeaderRead = 0;
                    int headerEnd = -1;

                    while (totalHeaderRead < headerBuf.Length)
                    {
                        int n = await stream.ReadAsync(headerBuf.AsMemory(totalHeaderRead, headerBuf.Length - totalHeaderRead), reqCts.Token).ConfigureAwait(false);
                        if (n <= 0) break;
                        totalHeaderRead += n;

                        headerEnd = FindHeaderEnd(headerBuf, totalHeaderRead);
                        if (headerEnd != -1) break;
                    }

                    if (headerEnd == -1) return;

                    string headerText = Encoding.ASCII.GetString(headerBuf, 0, headerEnd);
                    string[] lines = headerText.Split("\r\n");
                    if (lines.Length == 0 || string.IsNullOrWhiteSpace(lines[0])) return;

                    string requestLine = lines[0];
                    var parts = requestLine.Split(' ');
                    string method = parts.Length > 0 ? parts[0].ToUpperInvariant() : "GET";
                    string rawPath = parts.Length > 1 ? parts[1] : "/";
                    string path = rawPath.Split('?')[0].ToLowerInvariant();

                    int contentLength = 0;
                    foreach (var h in lines)
                    {
                        if (h.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                        {
                            int.TryParse(h.Substring(15).Trim(), out contentLength);
                        }
                    }

                    string? requestBody = null;
                    if (method == "POST" && contentLength > 0 && contentLength <= 262144)
                    {
                        int bodyStart = headerEnd + 4;
                        int bodyBytesAvailable = Math.Max(0, totalHeaderRead - bodyStart);
                        byte[] bodyBuf = new byte[contentLength];

                        int copied = Math.Min(bodyBytesAvailable, contentLength);
                        if (copied > 0)
                        {
                            Buffer.BlockCopy(headerBuf, bodyStart, bodyBuf, 0, copied);
                        }

                        int bodyTotal = copied;
                        while (bodyTotal < contentLength)
                        {
                            int n = await stream.ReadAsync(bodyBuf.AsMemory(bodyTotal, contentLength - bodyTotal), reqCts.Token).ConfigureAwait(false);
                            if (n <= 0) break;
                            bodyTotal += n;
                        }

                        requestBody = Encoding.UTF8.GetString(bodyBuf, 0, bodyTotal);
                    }

                    if (method == "OPTIONS")
                    {
                        byte[] optHeader = Encoding.UTF8.GetBytes(
                            "HTTP/1.1 204 No Content\r\n" +
                            "Access-Control-Allow-Origin: *\r\n" +
                            "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
                            "Access-Control-Allow-Headers: Content-Type\r\n" +
                            "Connection: close\r\n\r\n");
                        await stream.WriteAsync(optHeader, reqCts.Token).ConfigureAwait(false);
                        return;
                    }

                    if (path == "/api/stats")
                    {
                        string json = GenerateStatsJson();
                        byte[] body = Encoding.UTF8.GetBytes(json);
                        string resp = $"HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {body.Length}\r\nCache-Control: no-cache, no-store\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n\r\n";
                        byte[] headerBytes = Encoding.UTF8.GetBytes(resp);
                        await stream.WriteAsync(headerBytes, reqCts.Token).ConfigureAwait(false);
                        await stream.WriteAsync(body, reqCts.Token).ConfigureAwait(false);
                    }
                    else if (path == "/api/v2/history")
                    {
                        string json = GenerateHistoryJson(rawPath);
                        byte[] body = Encoding.UTF8.GetBytes(json);
                        string resp = $"HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {body.Length}\r\nCache-Control: no-cache, no-store\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n\r\n";
                        byte[] headerBytes = Encoding.UTF8.GetBytes(resp);
                        await stream.WriteAsync(headerBytes, reqCts.Token).ConfigureAwait(false);
                        await stream.WriteAsync(body, reqCts.Token).ConfigureAwait(false);
                    }
                    else if (path == "/api/v2/config")
                    {
                        string json = HandleUiV2Config(method, requestBody);
                        byte[] body = Encoding.UTF8.GetBytes(json);
                        string resp = $"HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {body.Length}\r\nCache-Control: no-cache, no-store\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n\r\n";
                        byte[] headerBytes = Encoding.UTF8.GetBytes(resp);
                        await stream.WriteAsync(headerBytes, reqCts.Token).ConfigureAwait(false);
                        await stream.WriteAsync(body, reqCts.Token).ConfigureAwait(false);
                    }
                    else if (path == "/api/ping")
                    {
                        byte[] body = Encoding.UTF8.GetBytes("pong");
                        string resp = $"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {body.Length}\r\nConnection: close\r\n\r\n";
                        byte[] headerBytes = Encoding.UTF8.GetBytes(resp);
                        await stream.WriteAsync(headerBytes, reqCts.Token).ConfigureAwait(false);
                        await stream.WriteAsync(body, reqCts.Token).ConfigureAwait(false);
                    }
                    else if (path == "/" || path == "/index.html" || path == "/v2" || path == "/v2/" ||
                             path.StartsWith("/v2/") || path.StartsWith("/styles/") || path.StartsWith("/js/"))
                    {
                        // UI v2 artık tek ve varsayılan arayüzdür
                        await ServeUiV2AssetAsync(stream, rawPath.Split('?')[0], reqCts.Token).ConfigureAwait(false);
                    }
                    else
                    {
                        byte[] body = Encoding.UTF8.GetBytes("404 Not Found");
                        string resp = $"HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: {body.Length}\r\nConnection: close\r\n\r\n";
                        byte[] headerBytes = Encoding.UTF8.GetBytes(resp);
                        await stream.WriteAsync(headerBytes, reqCts.Token).ConfigureAwait(false);
                        await stream.WriteAsync(body, reqCts.Token).ConfigureAwait(false);
                    }
                    await stream.FlushAsync(reqCts.Token).ConfigureAwait(false);
                }
                catch
                {
                    // Bağlantı koptu veya zaman aşımına uğradı
                }
            }
        }
        catch
        {
            // Socket alma hatası
        }
        finally
        {
            try { client.Close(); } catch { }
        }
    }

    private static int FindHeaderEnd(byte[] buf, int len)
    {
        for (int i = 0; i <= len - 4; i++)
        {
            if (buf[i] == '\r' && buf[i + 1] == '\n' && buf[i + 2] == '\r' && buf[i + 3] == '\n')
                return i;
        }
        return -1;
    }

    private static async Task ServeUiV2AssetAsync(NetworkStream stream, string requestPath, CancellationToken ct)
    {
        string relative;
        if (requestPath == "/" || requestPath == "/index.html" || requestPath == "/v2" || requestPath == "/v2/")
        {
            relative = "index.html";
        }
        else if (requestPath.StartsWith("/v2/", StringComparison.OrdinalIgnoreCase))
        {
            relative = requestPath.Substring(4).TrimStart('/');
        }
        else
        {
            relative = requestPath.TrimStart('/');
        }
        if (string.IsNullOrWhiteSpace(relative)) relative = "index.html";

        // Path traversal koruması
        if (relative.Contains("..") || relative.Contains('\\') || relative.Contains(':'))
        {
            byte[] badBody = Encoding.UTF8.GetBytes("400 Bad Request");
            byte[] badHdr = Encoding.UTF8.GetBytes($"HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nContent-Length: {badBody.Length}\r\nConnection: close\r\n\r\n");
            await stream.WriteAsync(badHdr, ct).ConfigureAwait(false);
            await stream.WriteAsync(badBody, ct).ConfigureAwait(false);
            return;
        }

        byte[]? contentBytes = null;
        string osRelPath = relative.Replace('/', Path.DirectorySeparatorChar);

        // 1. Önce çalışma dizinindeki veya exe yanındaki UIv2 klasörüne bak (canlı düzenleme desteği)
        string[] candidateRoots =
        {
            Path.Combine(Directory.GetCurrentDirectory(), "UIv2"),
            Path.Combine(AppContext.BaseDirectory, "UIv2"),
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "UIv2"))
        };

        foreach (string root in candidateRoots)
        {
            string fullPath = Path.Combine(root, osRelPath);
            if (File.Exists(fullPath))
            {
                contentBytes = await File.ReadAllBytesAsync(fullPath, ct).ConfigureAwait(false);
                break;
            }
        }

        // 2. Bulunamazsa gömülü kaynaklardan (EmbeddedResource) oku
        if (contentBytes == null)
        {
            var asm = typeof(WebServerService).Assembly;
            string resSuffix = "UIv2." + relative.Replace('/', '.').Replace('-', '_');
            string exactSuffix = "UIv2." + relative.Replace('/', '.');
            string? matchName = asm.GetManifestResourceNames()
                .FirstOrDefault(n => n.EndsWith(exactSuffix, StringComparison.OrdinalIgnoreCase)
                                  || n.EndsWith(resSuffix, StringComparison.OrdinalIgnoreCase));

            if (matchName != null)
            {
                using var resStream = asm.GetManifestResourceStream(matchName);
                if (resStream != null)
                {
                    using var ms = new MemoryStream();
                    await resStream.CopyToAsync(ms, ct).ConfigureAwait(false);
                    contentBytes = ms.ToArray();
                }
            }
        }

        if (contentBytes == null)
        {
            byte[] notFound = Encoding.UTF8.GetBytes("404 Not Found: " + relative);
            byte[] nfHdr = Encoding.UTF8.GetBytes($"HTTP/1.1 404 Not Found\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {notFound.Length}\r\nConnection: close\r\n\r\n");
            await stream.WriteAsync(nfHdr, ct).ConfigureAwait(false);
            await stream.WriteAsync(notFound, ct).ConfigureAwait(false);
            return;
        }

        string ext = Path.GetExtension(relative).ToLowerInvariant();
        string mime = ext switch
        {
            ".html" => "text/html; charset=utf-8",
            ".css" => "text/css; charset=utf-8",
            ".js" => "application/javascript; charset=utf-8",
            ".svg" => "image/svg+xml",
            ".json" => "application/json; charset=utf-8",
            ".png" => "image/png",
            ".ico" => "image/x-icon",
            ".ttf" => "font/ttf",
            ".otf" => "font/otf",
            ".woff" => "font/woff",
            ".woff2" => "font/woff2",
            _ => "application/octet-stream"
        };

        string header =
            $"HTTP/1.1 200 OK\r\n" +
            $"Content-Type: {mime}\r\n" +
            $"Content-Length: {contentBytes.Length}\r\n" +
            $"Cache-Control: no-cache, no-store\r\n" +
            $"Connection: close\r\n" +
            $"Access-Control-Allow-Origin: *\r\n\r\n";

        byte[] headerBytes = Encoding.UTF8.GetBytes(header);
        await stream.WriteAsync(headerBytes, ct).ConfigureAwait(false);
        await stream.WriteAsync(contentBytes, ct).ConfigureAwait(false);
    }

    private async Task RecordHistoryLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && IsRunning)
        {
            try
            {
                // Web arayüzü aktifken donanım sensörlerinin değerlerini düzenli tara
                await _hardwareService.UpdateAllAsync().ConfigureAwait(false);

                var sensors = _hardwareService.AllSensors;
                lock (_historyBuffer)
                {
                    foreach (var s in sensors)
                    {
                        if (s.Value is { } val && !float.IsNaN(val))
                        {
                            string id = HardwareMonitorService.GetId(s);
                            if (!_historyBuffer.TryGetValue(id, out var list))
                            {
                                list = new List<float>(128);
                                _historyBuffer[id] = list;
                            }
                            list.Add((float)Math.Round(val, 2));
                            if (list.Count > MaxHistorySamples)
                            {
                                list.RemoveRange(0, list.Count - MaxHistorySamples);
                            }
                        }
                    }
                }
            }
            catch { }

            try
            {
                await Task.Delay(1000, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private string GenerateHistoryJson(string rawPath)
    {
        int window = 60;
        int qIdx = rawPath.IndexOf('?');
        if (qIdx >= 0)
        {
            string query = rawPath.Substring(qIdx + 1);
            foreach (var part in query.Split('&'))
            {
                var kv = part.Split('=');
                if (kv.Length == 2 && kv[0].Equals("window", StringComparison.OrdinalIgnoreCase))
                {
                    if (int.TryParse(kv[1], out int parsed))
                    {
                        window = Math.Clamp(parsed, 10, MaxHistorySamples);
                    }
                }
            }
        }

        var dict = new Dictionary<string, List<float>>();
        lock (_historyBuffer)
        {
            foreach (var kvp in _historyBuffer)
            {
                var src = kvp.Value;
                int take = Math.Min(window, src.Count);
                dict[kvp.Key] = src.GetRange(src.Count - take, take);
            }
        }

        return JsonSerializer.Serialize(new
        {
            window,
            history = dict
        });
    }

    private string HandleUiV2Config(string method, string? requestBody)
    {
        lock (_configLock)
        {
            if (method == "POST" && !string.IsNullOrWhiteSpace(requestBody))
            {
                try
                {
                    // Geçerli JSON olup olmadığını doğrula
                    using var doc = JsonDocument.Parse(requestBody);
                    File.WriteAllText(UiV2ConfigPath, requestBody, Encoding.UTF8);
                    return "{\"ok\":true}";
                }
                catch
                {
                    return "{\"ok\":false,\"error\":\"Invalid JSON\"}";
                }
            }

            if (File.Exists(UiV2ConfigPath))
            {
                try
                {
                    return File.ReadAllText(UiV2ConfigPath, Encoding.UTF8);
                }
                catch { }
            }
            return "{}";
        }
    }

    private string GenerateStatsJson()
    {
        var sensors = _hardwareService.AllSensors;

        // İstatistikleri güncelle (kümülatif ortalama)
        lock (_stats)
        {
            foreach (var s in sensors)
            {
                if (s.Value is { } val && !float.IsNaN(val))
                {
                    if (_stats.TryGetValue(s, out var stat))
                    {
                        _stats[s] = (stat.Sum + val, stat.Count + 1);
                    }
                    else
                    {
                        _stats[s] = (val, 1);
                    }
                }
            }
        }

        var sensorDtos = new List<object>(sensors.Count);
        foreach (var s in sensors)
        {
            float? avg = null;
            lock (_stats)
            {
                if (_stats.TryGetValue(s, out var stat) && stat.Count > 0)
                {
                    avg = (float)(stat.Sum / stat.Count);
                }
                else
                {
                    avg = s.Value;
                }
            }

            var type = s.SensorType;
            sensorDtos.Add(new
            {
                id = HardwareMonitorService.GetId(s),
                name = s.Name,
                hardware = s.Hardware?.Name ?? "Donanım",
                type = SensorFormat.GetTypeName(type),
                value = s.Value,
                formattedValue = SensorFormat.FormatValue(type, s.Value, true),
                min = s.Min,
                formattedMin = SensorFormat.FormatValue(type, s.Min, true),
                max = s.Max,
                formattedMax = SensorFormat.FormatValue(type, s.Max, true),
                avg = avg,
                formattedAvg = SensorFormat.FormatValue(type, avg, true)
            });
        }

        var payload = new
        {
            hostName = Environment.MachineName,
            timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
            uptimeSeconds = (long)(Environment.TickCount64 / 1000),
            sensors = sensorDtos
        };

        return JsonSerializer.Serialize(payload);
    }

    /// <summary>
    /// Bilgisayarın yerel ağdaki (Wi-Fi ve Ethernet) aktif IPv4 adreslerini döndürür.
    /// Link-local (169.254.x.x) adresleri eler ve 192.168.x.x adreslerini başa alır.
    /// </summary>
    public static List<string> GetLocalIpAddresses()
    {
        var list = new List<string>();
        try
        {
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up ||
                    ni.NetworkInterfaceType == NetworkInterfaceType.Loopback)
                {
                    continue;
                }

                var ipProps = ni.GetIPProperties();
                foreach (var addr in ipProps.UnicastAddresses)
                {
                    if (addr.Address.AddressFamily == AddressFamily.InterNetwork &&
                        !IPAddress.IsLoopback(addr.Address))
                    {
                        string ip = addr.Address.ToString();
                        // 169.254.x.x link-local adresleri elenir
                        if (!ip.StartsWith("169.254."))
                        {
                            list.Add(ip);
                        }
                    }
                }
            }
        }
        catch { }

        // Gerçek yerel ağ IP'lerini önceliklendir (192.168.*, 10.*, 172.*)
        var sorted = list.Distinct().OrderByDescending(ip =>
            ip.StartsWith("192.168.") ? 3 :
            ip.StartsWith("10.") ? 2 :
            ip.StartsWith("172.") ? 1 : 0
        ).ToList();

        if (sorted.Count == 0) sorted.Add("127.0.0.1");
        return sorted;
    }

    public string GetPrimaryUrl()
    {
        var ips = GetLocalIpAddresses();
        string ip = ips.FirstOrDefault(a => !a.StartsWith("127.")) ?? "localhost";
        return $"http://{ip}:{Port}";
    }

    public void Dispose()
    {
        Stop();
    }
}
