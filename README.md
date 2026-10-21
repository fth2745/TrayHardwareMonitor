# ⚡ Tray Hardware Monitor (v2.0)

<p align="center">
  <img src="https://img.shields.io/badge/.NET-8.0_Desktop-512BD4?style=for-the-badge&logo=dotnet&logoColor=white" alt=".NET 8" />
  <img src="https://img.shields.io/badge/Platform-Windows_10%20%7C%2011-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Version-2.0.0-blue?style=for-the-badge" alt="Version 2.0.0" />
  <img src="https://img.shields.io/badge/UI-Bento_v2_Modular-00B4D8?style=for-the-badge" alt="Bento UI v2" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/Privacy-100%25_Offline-success?style=for-the-badge" alt="100% Offline" />
</p>

<p align="center">
  <b>Sistem tepsisinde çalışan ultra hafif (< %0.1 CPU, ~25 MB RAM), dinamik canlı simgeli ve Apple / NZXT CAM esintili modüler Bento UI v2 web telemetri sistemi.</b>
</p>

---

## 🌟 Öne Çıkan Özellikler

### 1. 🖥️ Sistem Tepsisi (System Tray) Katmanı
- **Canlı Dinamik Tepsi Simgesi:** Görev çubuğunda anlık sıcaklık veya kullanım değerini (yeşil / turuncu / kırmızı renk kodlarıyla) GDI+ ile doğrudan simge üzerine çizer. Varsayılan olarak CPU sıcaklığıdır; istenen herhangi bir sensör tepsi simgesi yapılabilir.
- **Yumuşak Geçişli Mini Özet Kartı (Hover Overlay):** Farenin bilerek simge üzerine gelmesiyle (0.8s gecikmeli) pürüzsüzce solarak açılan (fade-in) ve fare ayrıldığında zarifçe kapanan (fade-out) özel mini bilgi kartı.
- **Detaylı HWMonitor Rapor Penceresi:** Simgeye tıklandığında açılan donanım hiyerarşi ağacı. Anlık, Minimum ve Maksimum değerler, canlı filtreleme, panoya kopyalama ve TXT dışa aktarma.
- **UAC Uyarısız Windows Başlangıcı (Task Scheduler):** Düşük seviyeli sensör kayıtlarını okumak için gereken yönetici izinlerini, Windows Görev Zamanlayıcı entegrasyonu sayesinde her açılışta kullanıcıya **onay kutusu sormadan sessizce** arka planda başlatır.

### 2. 🌐 Yeni Nesil Web Telemetri Paneli (Bento UI v2)
Tarayıcınızdan (`http://localhost:8085`) veya yerel ağdaki herhangi bir cihazdan erişilebilen ultra modern kontrol paneli:
- **17 Farklı Grafik Havuzu:** Sparkline, eşik renkli çizgiler, çift seri karşılaştırma, yatay iz çubukları, hibrit kapasite barları, beşgen radar, altıgen petek termal harita ve dağılım histogramları.
- **4 M1 Donanım Matrisi Varyantı:** 
  1. *Hibrit Dalga:* Canlı Bezier eğrisi ve 5 satırlı ilerleme tablosu.
  2. *HUD Kutuları:* NZXT CAM tarzı kompakt 5'li cam kutucuklar.
  3. *Minimalist:* Saf tipografik Apple estetiği ve parlayan delta çipleri.
  4. *Kadranlı:* 240° dairesel SVG ibre ve uydu metrikleri.
- **60 FPS Akıcı Dalga ve Süzülen Uç Nokta (Lead Dot Lerp):** Telemetri yenilemelerinde grafiğin en ucundaki nokta anında ışınlanmaz; 1000ms boyunca ara piksel koordinatları üzerinden kübik sönümleme ile süzülür.
- **Kritik Sıcaklık Nabzı (Pulsing Alert):** İşlemci veya GPU sıcaklığı 85°C'yi geçtiğinde kart kenarlıkları hafifçe kırmızı neon bir nefes alma ritminde nabız gibi atar (`🔥 KRİTİK`).
- **Yatay Saat / Masa Modu (Desk Zen HUD):** Üst barda zarif monospaced dijital saat, Windows sistem açık kalma süresi (`Uptime`) ve tek tıkla odaklanmış minimalist tam ekran konsol modu.

### 3. 📱 Mobil & Yerel Ağ İzleme (QR Kod Entegrasyonu)
- Tepsi menüsünden **"📱 Mobil Web İzleme (QR Kod)"** seçildiğinde ekrana gelen özel pencereden telefon veya tablet kamerasıyla QR kodu okutarak bilgisayarın telemetrisini anında ikinci bir ekranda canlı izleyebilirsiniz.
- Harici sunucu veya bulut gerektirmez; yerel Wi-Fi/Ethernet üzerinden TcpListener tabanlı hafif HTTP motoru ile doğrudan çalışır.

---

## 🏗️ Mimari ve Proje Yapısı

```
TrayHardwareMonitor/
├── Helpers/                      # Yardımcı araçlar
│   ├── IconRenderer.cs           # Görev çubuğu simgesi dinamik çizim motoru
│   ├── QrCodeHelper.cs           # Yerel ağ bağlantısı için saf C# QR üretici
│   └── SensorFormat.cs           # Birim ve metrik formatlayıcıları
├── Services/                     # Çekirdek servisler
│   ├── HardwareMonitorService.cs # LibreHardwareMonitor donanım tarama motoru
│   ├── StartupManager.cs         # Windows Task Scheduler başlangıç yöneticisi
│   └── WebServerService.cs       # TcpListener tabanlı REST API & Web Sunucusu
├── UI/                           # Windows Forms masaüstü pencereleri
│   ├── DetailForm.cs             # HWMonitor tarzı detaylı donanım rapor penceresi
│   ├── MiniSummaryForm.cs        # Hover mini özet kartı (Fade animasyonlu)
│   ├── SettingsForm.cs           # Yenileme süreleri ve başlangıç ayarları
│   ├── TrayApplicationContext.cs # Sistem tepsisi yaşam döngüsü yöneticisi
│   └── WebRemoteForm.cs          # Mobil QR kod bağlantı penceresi
├── UIv2/                         # Bento UI v2 Web Telemetri Ön Yüzü
│   ├── index.html                # Tek sayfa modüler telemetri kabuğu
│   ├── js/
│   │   ├── app.js                # Ana uygulama döngüsü & durum yöneticisi
│   │   ├── charts/               # 17 modüler grafik render motoru (A–X, M1)
│   │   ├── services/             # Yapılandırma ve halka tamponu servisleri
│   │   └── ui/                   # Kart iskeletleri ve yardımcı bileşenler
│   └── styles/                   # Modern Bento, cam ve tema stilleri
├── docs/                         # GitHub Pages tanıtım sitesi
├── Program.cs                    # Uygulama başlangıç noktası (Tekil örnek kontrolü)
├── Settings.cs                   # Kullanıcı tercihleri kalıcılık modeli
└── TrayHardwareMonitor.csproj    # .NET 8 Proje Yapılandırması
```

---

## 📥 Kurulum ve Çalıştırma

### Sistem Gereksinimleri
- **İşletim Sistemi:** Windows 10 veya Windows 11 (64-bit)
- **Çalışma Zamanı:** [.NET Desktop Runtime 8.0](https://dotnet.microsoft.com/download/dotnet/8.0)
- **İzinler:** Düşük seviyeli CPU/Anakart sensörlerine erişebilmek için uygulama Yönetici (Administrator) ayrıcalıklarıyla çalıştırılmalıdır (Uygulama bildiriminde gömülü manifest bulunur).

### Hazır Sürümü Kullanma
1. [Releases](https://github.com/fth2745/TrayHardwareMonitor/releases) sayfasından en son sürümü indirin.
2. Zip arşivini bir klasöre çıkartın.
3. `TrayHardwareMonitor.exe` dosyasını çalıştırın.
4. Tarayıcınızdan `http://localhost:8085` adresini açarak Bento UI v2 panelinin keyfini çıkarın!

---

## 🛠️ Kaynak Koddan Derleme

```bash
# Depoyu klonlayın
git clone https://github.com/fth2745/TrayHardwareMonitor.git
cd TrayHardwareMonitor

# Projeyi Release modunda derleyin
dotnet build -c Release

# Dağıtım paketi oluşturun (Self-contained olmadan, hafif paket)
dotnet publish -c Release -r win-x64 --no-self-contained -o ./publish
```

---

## 🔒 Güvenlik ve Gizlilik

- **%100 Çevrimdışı (Zero Telemetry):** Donanım verileriniz kesinlikle herhangi bir harici bulut sunucusuna gönderilmez.
- **Yerel Ağ Dışına Kapalı:** Web sunucusu yalnızca yerel ağınızda (`LAN`) dinleme yapar, dış internete kapalıdır.
- **Açık Kaynak Şeffaflığı:** Tüm kod açık kaynaklıdır; LibreHardwareMonitorLib dışında hiçbir harici ağır kütüphane içermez.

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) kapsamında açık kaynak olarak geliştirilmiştir.
Donanım tarama katmanı [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) projesine dayanmaktadır.
