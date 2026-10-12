# ⚡ Tray Hardware Monitor

<p align="center">
  <img src="https://img.shields.io/badge/.NET-8.0_Desktop-512BD4?style=for-the-badge&logo=dotnet&logoColor=white" alt=".NET 8" />
  <img src="https://img.shields.io/badge/Platform-Windows_10%20%7C%2011-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Backend-LibreHardwareMonitor-00B4D8?style=for-the-badge" alt="LibreHardwareMonitor" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <b>Sistem tepsisinde (System Tray) çalışan, ultra hafif (< %0.1 CPU, ~25 MB RAM), dinamik canlı simgeli ve akıcı animasyonlu yeni nesil donanım izleme aracı.</b>
</p>

---

## ✨ Öne Çıkan Özellikler

### 🎯 1. Canlı Dinamik Tepsi Simgesi
- Görev çubuğunda anlık sıcaklık veya kullanım değerini (yeşil/turuncu/kırmızı renk kodlarıyla) canlı çizer.
- **Tamamen Özelleştirilebilir:** Varsayılan olarak CPU sıcaklığıdır; detaylı raporda herhangi bir sensöre sağ tıklayarak (*"📌 Bu sensörü tepsi simgesinde göster"*) veya Ayarlar'dan dilediğiniz sensörü tepsi simgesi yapabilirsiniz.

### 💨 2. Windows Tarzı Mini Özet Kartı (Hover Overlay)
- **0.8 saniye bekleme süresi:** Fare simgenin üzerinden hızla geçtiğinde açılmaz; sadece üzerine bilerek gelindiğinde açılır.
- **Solarak Açılma ve Kapanma (Fade-In / Fade-Out):** Kart pürüzsüz bir animasyonla açılır ve fare çekildiğinde solarak zarifçe kapanır.
- **Özelleştirilebilir Sensör Listesi:** Kartta görmek istediğiniz donanımları detay tablosunda sağ tıklayarak (*"⭐ Mini özet kartına ekle/kaldır"*) veya Ayarlar menüsünden sıralayarak seçebilirsiniz.
- **Dinamik Boyut:** Kartın boyu seçilen sensör sayısına göre otomatik uzar veya kısalır.

### 📊 3. HWMonitor Tarzı Detaylı Donanım Raporu (Sol Tık)
- Sol tarafta tüm donanım bileşenleri hiyerarşik ağaç yapısında.
- Sağ tarafta tüm sensörler: **Anlık Değer**, **Minimum** ve **Maksimum**.
- **Arka Plan Taraması:** Taramalar asenkron iş parçacığında yapılır; arayüz asla donmaz veya takılmaz (60 FPS pürüzsüz UI).
- **Duyarlı (Responsive) Sütunlar:** Pencere boyutu ne olursa olsun sütunlar otomatik orantılanır, kesilme yaşanmaz.
- Canlı arama filtresi, **Min/Maks Sıfırla**, **Panoya Kopyala** ve **TXT Olarak Kaydet** seçenekleri.
- Çarpı (`X`) basıldığında kapanmaz, arka planda izlemeye devam etmek için tepsiye gizlenir.

### 🚀 4. UAC Uyarısız Windows Başlangıcı (Task Scheduler)
- CPU ve anakart kayıtlarını okumak için Yönetici izni gerekir.
- Ayarlar menüsünden tek tıkla Windows ile başlatma etkinleştirilebilir; Windows Görev Zamanlayıcı entegrasyonu sayesinde her açılışta **UAC onay kutusu sormadan sessizce** başlar.

---

## 📥 Kurulum ve Çalıştırma

1. **Gereksinimler:**
   - Windows 10 / Windows 11 (64-bit)
   - [.NET Desktop Runtime 8.0](https://dotnet.microsoft.com/download/dotnet/8.0) (Sisteminizde yoksa uygulama açılışta resmi indirme bağlantısına otomatik yönlendirir).

2. **Çalıştırma:**
   - [Baslat.bat](Baslat.bat) dosyasına çift tıklayın veya `publish/TrayHardwareMonitor.exe` dosyasını çalıştırın.

---

## 🛠️ Kaynak Koddan Derleme

```bash
# Projeyi derle
dotnet build -c Release

# Dağıtım paketini oluştur
dotnet publish -c Release -r win-x64 --no-self-contained -o ./publish
```

---

## 📄 Lisans
Bu proje [MIT Lisansı](LICENSE) kapsamında açık kaynaklı olarak paylaşılmıştır.
`LibreHardwareMonitorLib` kütüphanesine dayanmaktadır.

