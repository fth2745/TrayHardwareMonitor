# ⚡ Tray Hardware Monitor (v2.1)

<p align="center">
  <img src="https://img.shields.io/badge/.NET-8.0_Desktop-512BD4?style=for-the-badge&logo=dotnet&logoColor=white" alt=".NET 8" />
  <img src="https://img.shields.io/badge/Platform-Windows_10%20%7C%2011-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Version-2.1.0-blue?style=for-the-badge" alt="Version 2.1.0" />
  <img src="https://img.shields.io/badge/UI-Bento_v2_Modular-00B4D8?style=for-the-badge" alt="Bento UI v2" />
  <img src="https://img.shields.io/badge/RAM_Footprint-~42--78_MB_Private-success?style=for-the-badge" alt="RAM Footprint" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/Privacy-100%25_Offline-success?style=for-the-badge" alt="100% Offline" />
</p>

<p align="center">
  <a href="https://github.com/fth2745/TrayHardwareMonitor/releases">
    <img src="https://img.shields.io/badge/⬇️_Hemen_İndir-TrayHardwareMonitor_v2.1.0.zip_(Hazır_Çalıştır)-00B4D8?style=for-the-badge&logo=windows&logoColor=white" alt="Hemen İndir v2.1.0" />
  </a>
</p>

<p align="center">
  <b>Sistem tepsisinde çalışan ultra hafif, dinamik simgeli, UAC uyarısız başlangıç destekli Windows masaüstü aracı ve Apple / NZXT CAM esintili modern Bento UI v2 yerel web telemetri kontrol merkezi.</b>
</p>

---

## 📑 İçindekiler
1. [Projenin Amacı ve Vizyonu](#-projenin-amacı-ve-vizyonu)
2. [Sistem Mimarisi ve Katmanlar](#-sistem-mimarisi-ve-katmanlar)
   - [Katman 1: Donanım Algılama ve Sürücü Katmanı](#katman-1-donanım-algılama-ve-sürücü-katmanı)
   - [Katman 2: Windows Sistem Tepsisi ve Yerel Masaüstü](#katman-2-windows-sistem-tepsisi-ve-yerel-masaüstü)
   - [Katman 3: Yerel HTTP REST & Ring Buffer Motoru](#katman-3-yerel-http-rest--ring-buffer-motoru)
   - [Katman 4: Bento UI v2 Web Telemetri Ön Yüzü](#katman-4-bento-ui-v2-web-telemetri-ön-yüzü)
   - [Katman 5: Mobil Web İzleme ve Saf C# QR Kod Motoru](#katman-5-mobil-web-izleme-ve-saf-c-qr-kod-motoru)
3. [Öne Çıkan Özellikler](#-öne-çıkan-özellikler)
4. [Bellek (RAM) ve Performans Analizi](#-bellek-ram-ve-performans-analizi)
5. [Dizin ve Dosya Yapısı](#-dizin-ve-dosya-yapısı)
6. [REST API Uç Noktaları](#-rest-api-uç-noktaları)
7. [Kurulum ve Çalıştırma](#-kurulum-ve-çalıştırma)
8. [Kaynak Koddan Derleme](#-kaynak-koddan-derleme)
9. [Güvenlik ve Gizlilik](#-güvenlik-ve-gizlilik)
10. [Lisans](#-lisans)

---

## 🎯 Projenin Amacı ve Vizyonu

AIDA64, NZXT CAM, Corsair iCUE veya HWMonitor gibi geleneksel donanım izleme yazılımları; arka planda yüksek bellek/CPU tüketimi, karmaşık lisanslama gereksinimleri, kullanıcıyı rahatsız eden telemetri veri gönderimleri ve hantal arayüzlerle çalışır.

**Tray Hardware Monitor**, bu sorunlara modern bir yanıt olarak geliştirilmiştir:
- **Sıfır Telemetri:** Hiçbir veri buluta veya dış sunuculara gönderilmez. %100 yerel ve çevrimdışı çalışır.
- **Düşük Kaynak Tüketimi:** Boşta <%0.1 CPU ve ~42-78 MB Private RAM ile sisteminizi asla yormaz.
- **Bento UI v2:** Tarayıcı üzerinden açılan, mobil cihazlarla uyumlu, 60 FPS akıcı eğriler ve modüler donanım kartları sunan ödüllü Bento Grid tasarım dili.
- **Oyun ve Çalışma Dostu:** Ekranınızı kaplamaz; sistem tepsisinde canlı simge olarak yaşar, fareyle üzerine gelindiğinde pürüzsüz bir HUD kartı açar, istendiğinde tek tıkla mobil ekrana yansıtılır.

---

## 🏛️ Sistem Mimarisi ve Katmanlar

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Bento UI v2 Web Arayüzü (HTML5 / CSS / ES6)           │
│   [6 Sabit Özet Kartı]  [4 M1 Varyantı]  [60 FPS Lead Dot Lerp]        │
│   [Masaüstü 2/3 Sütun]  [Mobil Dikey Tekli / Yatay Çift Sütun]          │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ HTTP / JSON API (Port 8085)
┌───────────────────────────────────┴────────────────────────────────────┐
│          Yerel HTTP Sunucusu (WebServerService - TcpListener)          │
│   - URLACL gerektirmeyen saf C# soket motoru                           │
│   - 15 Dakikalık Halka Tamponu (Ring Buffer - 900 Örnek)               │
│   - REST API: /api/stats, /api/v2/history, /api/v2/config              │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │
┌───────────────────────────────────┴────────────────────────────────────┐
│        TrayHardwareMonitor Çekirdeği (WinForms + .NET 8 Desktop)        │
│   - TrayApplicationContext: Dinamik Tepsi Simgesi (GDI+ 32x32)         │
│   - MiniSummaryForm: Fare Üzerine Gelince Açılan Fade HUD Kartı        │
│   - DetailForm: Ağaç Yapılı Detaylı Sensör İnceleme Tablosu            │
│   - StartupManager: Windows Task Scheduler UAC'siz Başlangıç           │
│   - QrCodeHelper: Üçüncü parti kütüphanesiz Saf C# QR Oluşturucu       │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │
┌───────────────────────────────────┴────────────────────────────────────┐
│               Donanım Katmanı (LibreHardwareMonitorLib)                │
│   - Ring-0 Kernel Sürücüsü: WinRing0 / InpOutx64                        │
│   - CPU: Sıcaklık, Saat Frekansı, Güç (W), Voltaj (Vcore), Yük         │
│   - GPU: Çekirdek Sıcaklığı, Hotspot, Bellek Sıcaklığı, Fan RPM, Güç   │
│   - RAM & DIMM: Toplam Yük, Kullanılan/Boş GB, DIMM SPD Sensörleri     │
│   - Anakart & Fanlar: Super I/O Yonga Setleri (Nuvoton/ITE), 7+ Fan    │
└────────────────────────────────────────────────────────────────────────┘
```

### Katman 1: Donanım Algılama ve Sürücü Katmanı
- [`HardwareMonitorService.cs`](file:///c:/Users/Fatih/Desktop/Program/TrayHardwareMonitor/Services/HardwareMonitorService.cs): `LibreHardwareMonitorLib` kütüphanesini yönetir.
- CPU (AMD Ryzen & Intel Core), GPU (NVIDIA GeForce, AMD Radeon, Intel Arc), Bellek kontrolcüsü, Anakart Super I/O yongaları (Nuvoton NCT6798D, ITE IT8688E vb.) ve depolama sürücülerini tarar.
- Hatalı okumaları (örneğin bozuk I2C adreslerinden gelen `DIMM #3 \u0000\u0000` veya `0.0 °C` donanım limit sensörlerini) filtreler ve gerçek sensörleri kullanıcıya temiz olarak sunar.

### Katman 2: Windows Sistem Tepsisi ve Yerel Masaüstü
- **Canlı Dinamik Simge ([`IconRenderer.cs`](file:///c:/Users/Fatih/Desktop/Program/TrayHardwareMonitor/Helpers/IconRenderer.cs)):** 32x32 piksel `Bitmap` üzerine Windows GDI+ ile anlık sıcaklık veya kullanım değerini yazar. Değer aralığına göre otomatik renk kodlaması uygular:
  - 🟢 **Yeşil:** < 60°C (Normal)
  - 🟠 **Turuncu:** 60°C – 79°C (Orta / Yük Altında)
  - 🔴 **Kırmızı:** ≥ 80°C (Yüksek Sıcaklık)
- **Mini Özet Kartı ([`MiniSummaryForm.cs`](file:///c:/Users/Fatih/Desktop/Program/TrayHardwareMonitor/UI/MiniSummaryForm.cs)):** Fare tepsi simgesi üzerinde 800ms bekletildiğinde yumuşak bir fade-in animasyonu ile görev çubuğunun hemen üzerinde açılır; CPU, GPU, RAM ve Fan özetlerini gösterir.
- **Detaylı HWMonitor Ağacı ([`DetailForm.cs`](file:///c:/Users/Fatih/Desktop/Program/TrayHardwareMonitor/UI/DetailForm.cs)):** Anlık, Minimum, Maksimum ve Ortalama değerleri hiyerarşik ağaç tablosunda listeler. Canlı metin filtreleme ve tek tıkla panoya kopyalama imkanı tanır.
- **UAC Uyarısız Başlangıç ([`StartupManager.cs`](file:///c:/Users/Fatih/Desktop/Program/TrayHardwareMonitor/Services/StartupManager.cs)):** Windows Görev Zamanlayıcısı'na (`Task Scheduler`) en yüksek ayrıcalıklarla (`HighestAvailable`) görev kaydı açar. Böylece bilgisayar her açıldığında kullanıcıya **UAC "Evet/Hayır" onay kutusu sormadan** sessizce sistem tepsisinde başlar.

### Katman 3: Yerel HTTP REST & Ring Buffer Motoru
- [`WebServerService.cs`](file:///c:/Users/Fatih/Desktop/Program/TrayHardwareMonitor/Services/WebServerService.cs): Windows'un kısıtlayıcı `HttpListener` izinlerine (`netsh http add urlacl`) bağımlı kalmamak adına saf .NET `TcpListener` tabanlı mimariyle geliştirilmiştir.
- Yerel ağdaki istemcilere HTML, CSS, ES6 modülleri ve SVG kaynaklarını doğrudan sunar.
- **Sunucu Tarafı Halka Tamponu (Ring Buffer):** Her sensör için 1 saniyelik aralıklarla 900 adet örnek (15 dakikalık tam geçmiş) bellekte saklanır. Tarayıcı açıldığında veya sayfa yenilendiğinde grafiğin baştan dolmasını beklemeden son 15 dakikalık geçmiş anında ekrana çizilir.

### Katman 4: Bento UI v2 Web Telemetri Ön Yüzü
- **6 Sabit Donanım Kartı:**
  1. `w_cpu`: İşlemci (CPU) Özeti (Sıcaklık, Hız, Güç, Vcore, Yük).
  2. `w_gpu`: Ekran Kartı (GPU) Özeti (Sıcaklık, Yük, Güç, Saat, Voltaj, Fanlar).
  3. `w_ram`: Bellek (RAM) & DIMM SPD Sıcaklıkları (Kullanım %, Kullanılan/Kalan GB, Modül Sıcaklıkları).
  4. `w_board`: Anakart Özeti (Sensör sıcaklıkları, +3.3V, AVCC, 3VSB voltaj hatları).
  5. `w_psu`: Güç Tüketimi (PSU) Özeti (Tahmini toplam sistem tüketimi, CPU & GPU tüketim payları).
  6. `w_fans`: Kasa Fanları & Soğutma (Kasa içi tüm fanların devirlerini dairesel halka HUD'larla gösterir).
- **4 Değiştirilebilir M1 Görünüm Varyantı:**
  - 🎨 **Hibrit Dalga:** Canlı 60 FPS Bezier sparkline eğrisi + milimetrik hizalı 5 satırlı ilerleme tablosu.
  - 🎨 **HUD Kutuları:** NZXT CAM esintili, 5 adet cam efektli kompakt kutucuk.
  - 🎨 **Minimalist:** Saf tipografi, büyük metrik vurgusu ve dinamik delta çipleri.
  - 🎨 **Kadranlı:** 240° dairesel SVG ibre ve uydu metrikleri.
- **Masaüstü ve Mobil Uyumu:**
  - **Masaüstü:** 2 Sütun (İkili) ve 3 Sütun (Üçlü) yerleşim seçenekleri.
  - **Mobil Dikey (Portrait):** Kartlar sıkışmadan, tek sütun halinde rahat ve ferah bir dizilimde sunulur.
  - **Mobil Yatay (Landscape):** Telefon yan çevrildiğinde arayüz otomatik olarak 2 sütunlu düzene adapte olur.

### Katman 5: Mobil Web İzleme ve Saf C# QR Kod Motoru
- [`QrCodeHelper.cs`](file:///c:/Users/Fatih/Desktop/Program/TrayHardwareMonitor/Helpers/QrCodeHelper.cs): Hiçbir harici kütüphane (ZXing vb.) kullanmadan, QR Code Specification (ISO/IEC 18004) standardını saf C# ile uygular (Reed-Solomon hata düzeltme kodlayıcısı dahildir).
- Bilgisayarın yerel ağ IP'sini (`192.168.x.x:8085`) tespit eder ve tek tıkla QR kod penceresini açar. Telefon kamerasıyla okutulduğu an mobil telemetri paneli devreye girer.

---

## ⚡ Bellek (RAM) ve Performans Analizi

Uygulama, oyun oynarken veya yoğun render/kodlama süreçlerinde arka planda varlığını unutturacak seviyede hafif çalışmak üzere tasarlanmıştır.

### Canlı Çalışma Ölçümleri (Chrome Sayfası Hariç - Salt C# / .NET 8 Uygulaması):

| Metrik | Boşta / Başlangıç Durumu | Aktif Telemetri & Web Sunucusu Açık | Açıklama |
| :--- | :--- | :--- | :--- |
| **Private Memory (Ayrılmış Net RAM)** | **~42.3 MB** | **~77.7 MB** | İşletim sisteminden doğrudan ayrılan net özel bellek. Tüm donanım sürücüleri, sensör ağacı ve 15 dakikalık halka tamponu bu alandadır. |
| **Working Set (Toplam Çalışma Kümesi)** | **~98.4 MB** | **~154.8 MB** | Windows Görev Yöneticisi'nde görünen değer. .NET 8 JIT, paylaşılan DLL'ler (GDI+, WinForms, HidSharp) ve sayfa önbelleğini içerir. |
| **CPU Tüketimi** | **< %0.1** | **%0.1 – %0.3** | 1 saniyelik yoklama döngüsü modern çok çekirdekli işlemcilerde neredeyse ölçülemez düzeydedir. |
| **Web Sunucusu Soket İzi** | **~1.2 MB** | **~2.5 MB** | TcpListener saf thread-pool soketleri üzerinden çalıştığı için ek web sunucusu yükü getirmez. |

> [!NOTE]
> Chrome veya Edge gibi harici tarayıcılarda Bento UI v2 sekmesi açıldığında, tarayıcının kendi GPU hızlandırma ve V8 motoru bellek tüketimi tarayıcıya aittir. Tray Hardware Monitor arka plan servisi sabit olarak **~77 MB Private RAM** bandında kararlı kalır.

---

## 📂 Dizin ve Dosya Yapısı

```
TrayHardwareMonitor/
├── Helpers/                      # Yardımcı Sınıflar
│   ├── IconRenderer.cs           # Görev çubuğu simgesi GDI+ çizim motoru
│   ├── QrCodeHelper.cs           # Harici kütüphanesiz Saf C# QR Kod motoru
│   └── SensorFormat.cs           # Birim ve sayı formatlama araçları
├── Services/                     # Arka Plan Servisleri
│   ├── HardwareMonitorService.cs # LibreHardwareMonitor donanım algılama servisi
│   ├── StartupManager.cs         # Windows Görev Zamanlayıcı (UAC'siz başlangıç)
│   └── WebServerService.cs       # TcpListener tabanlı yerel HTTP sunucusu
├── UI/                           # Windows Forms Masaüstü Pencereleri
│   ├── DetailForm.cs             # Detaylı donanım ağaç tablosu rapor penceresi
│   ├── MiniSummaryForm.cs        # Hover mini özet HUD kartı (Fade animasyonlu)
│   ├── SettingsForm.cs           # Uygulama ayarları iletişim kutusu
│   ├── TrayApplicationContext.cs # Sistem tepsisi yaşam döngüsü yöneticisi
│   └── WebRemoteForm.cs          # Mobil QR kod bağlantı penceresi
├── UIv2/                         # Bento UI v2 Web Telemetri Ön Yüzü
│   ├── index.html                # Tek sayfa modüler telemetri kabuğu
│   ├── js/
│   │   ├── app.js                # Durum yönetimi, veri döngüsü ve dashboard kontrolü
│   │   ├── catalog-data.js       # Sensör katalog tanımları
│   │   ├── popover.js            # Büyüteç detay popover kontrolü
│   │   ├── charts/               # Modüler SVG/Canvas grafik motorları (A–X, M1)
│   │   ├── services/             # Yapılandırma ve türetilmiş metrik servisleri
│   │   └── ui/                   # Kart iskeletleri ve yardımcı UI bileşenleri
│   └── styles/
│       ├── components.css        # Kartlar, barlar, butonlar ve popover stilleri
│       ├── layout.css            # Bento grid, masaüstü sütunları ve mobil medya sorguları
│       └── tokens.css            # Renk paletleri, temalar ve tipografi değişkenleri
├── docs/                         # GitHub Pages dokümantasyon ve tanıtım sayfası
├── app.manifest                  # Windows 10/11 DPI farkındalığı ve yönetici hakları
├── LICENSE                       # MIT Lisans Metni
├── Program.cs                    # Uygulama giriş noktası ve tekil örnek mutex kontrolü
├── Settings.cs                   # Kullanıcı tercihleri kalıcılık modeli
└── TrayHardwareMonitor.csproj    # .NET 8 Proje Yapılandırması
```

---

## 🔌 REST API Uç Noktaları

Tray Hardware Monitor, yerel ağınızdaki diğer araçlarla (Home Assistant, Rainmeter, Stream Deck vb.) entegrasyon kurabilmeniz için basit ve hızlı bir JSON REST API sunar:

### 1. `GET /api/stats`
Sistemdeki tüm donanımları ve anlık sensör değerlerini döndürür.
```json
{
  "uptimeSeconds": 7420,
  "sensors": [
    {
      "id": "cpu_temp",
      "hardware": "AMD Ryzen 7 7800X3D 8-Core Processor",
      "name": "CPU Core",
      "type": "Sıcaklık",
      "value": 54.2,
      "formattedValue": "54.2 °C",
      "min": 42.0,
      "formattedMin": "42.0 °C",
      "max": 78.0,
      "formattedMax": "78.0 °C",
      "avg": 52.1,
      "formattedAvg": "52.1 °C"
    }
  ]
}
```

### 2. `GET /api/v2/history`
Sunucuda biriken son 15 dakikalık halka tamponu geçmiş verisini sensör ID'lerine göre dizi halinde döner.

### 3. `GET /api/v2/config` & `POST /api/v2/config`
Bento UI panelinin kart dizilimini, seçili temasını ve düzen ayarlarını kaydeder / yükler.

---

## 🚀 Kurulum ve Çalıştırma

### Sistem Gereksinimleri
- **İşletim Sistemi:** Windows 10 veya Windows 11 (64-bit)
- **Çalışma Zamanı:** [.NET Desktop Runtime 8.0](https://dotnet.microsoft.com/download/dotnet/8.0)
- **Ayrıcalık:** Düşük seviyeli CPU/Anakart sensörlerine erişebilmek için Yönetici (Administrator) hakları gereklidir (Uygulama bildiriminde gömülüdür).

### Hazır Sürüm ile Başlatma
1. [Releases](https://github.com/fth2745/TrayHardwareMonitor/releases) sayfasından en güncel paketi indirin.
2. Arşivi istediğiniz bir klasöre çıkartın.
3. `TrayHardwareMonitor.exe` dosyasını çalıştırın.
4. Sistem tepsisindeki dinamik simgeden sisteminizi anlık izleyin veya tarayıcınızdan `http://localhost:8085` adresini açın!

---

## 🛠️ Kaynak Koddan Derleme

Projeyi yerel ortamınızda derlemek için .NET 8 SDK yüklü olmalıdır:

```powershell
# 1. Repoyu klonlayın
git clone https://github.com/fth2745/TrayHardwareMonitor.git
cd TrayHardwareMonitor

# 2. Release modunda derleyin
dotnet build -c Release

# 3. Dağıtım klasörünü oluşturun
dotnet publish -c Release -r win-x64 --no-self-contained -o ./publish
```

---

## 🔒 Güvenlik ve Gizlilik

- **%100 Çevrimdışı (Zero Telemetry):** Donanım bilgileriniz veya kullanım verileriniz asla internete aktarılmaz.
- **Yerel Ağ Dışına Kapalı:** Dahili HTTP sunucusu yalnızca yerel ağınızda (`LAN`) dinleme yapar, harici port yönlendirmesi yapılmadıkça dış dünyaya tamamen kapalıdır.
- **Şeffaf Açık Kaynak:** Tüm kaynak kodlar incelenebilir; gömülü reklam, madencilik veya arka kapı barındırmaz.

---

## 📄 Lisans

Bu proje **[MIT Lisansı](LICENSE)** altında lisanslanmıştır. 
Donanım tarama çekirdeği **[LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor)** projesine dayanmaktadır.
