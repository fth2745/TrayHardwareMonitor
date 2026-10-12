# Tray Hardware Monitor (Sistem Tepsisi Donanım İzleyici)

LibreHardwareMonitorLib tabanlı, ultra düşük kaynak (RAM/CPU) tüketen sistem tepsisi donanım izleme uygulaması.

---

## 🚀 Başlatma
- Klasör içerisindeki [Baslat.bat](file:///c:/Users/Fatih/Desktop/Program/Baslat.bat) dosyasına çift tıklayabilir veya
- [publish/TrayHardwareMonitor.exe](file:///c:/Users/Fatih/Desktop/Program/publish/TrayHardwareMonitor.exe) dosyasını doğrudan çalıştırabilirsiniz.

> **Yönetici İzni:** CPU sıcaklıkları ve anakart sensörleri gibi düşük seviyeli donanım kayıtlarını okumak için program otomatik olarak Yönetici (UAC) izni ile çalışır.

---

## 🌟 Özellikler

1. **Dinamik Tepsi Simgesi:**
   - Varsayılan olarak CPU sıcaklığı renkli rakamla gösterilir (yeşil / turuncu / kırmızı).
   - **İstediğin herhangi bir sensör** gösterilebilir: Detaylı raporda sensöre sağ tık → **"📌 Bu sensörü tepsi simgesinde göster"** veya Ayarlar → *Tepsi Simgesinde Gösterilecek Değer*.

2. **Fare Üzerine Gelince (Hover - Mini Özet Kartı):**
   - Windows'un gri ipucu balonu kapatıldı; yalnızca özel mini kart açılır.
   - Kartta görünecek sensörleri sen seçersin: Detaylı raporda sağ tık → **"⭐ Mini özet kartına ekle/kaldır"** (veya satıra çift tık), ya da Ayarlar → listede işaretle, ▲/▼ ile sırala.
   - Kartın yüksekliği seçilen sensör sayısına göre otomatik ayarlanır.
   - Fare simgeden uzaklaştığında otomatik olarak gizlenir.

3. **Sol Tık (Detaylı HWMonitor Rapor Penceresi):**
   - Simgeye tıklandığında HWMonitor tarzı detaylı rapor penceresi açılır.
   - Sol tarafta hiyerarşik donanım ağacı (Anakart, CPU, GPU, RAM, Diskler, Ağ, Soğutucu).
   - Sağ tarafta tüm sensörler: **Anlık Değer**, **Minimum** ve **Maksimum**.
   - Canlı arama/filtreleme kutusu.
   - **Min/Maks Sıfırla**, **Panoya Kopyala** ve **TXT Olarak Kaydet** butonları.
   - Çarpı (`X`) basıldığında pencere kapanmaz; arka planda izlemeye devam etmek için tepsiye gizlenir.

4. **Sağ Tık Menüsü:**
   - **📊 Detaylı Rapor:** Detay penceresini açar.
   - **🔄 Şimdi Yenile:** Anlık sensör taraması yapar.
   - **⚙️ Ayarlar:** Yenileme aralıkları ve otomatik başlatma ayarları.
   - **❌ Çıkış:** Programı ve arka plan izlemeyi tamamen kapatır.

5. **Otomatik Başlatma (Task Scheduler):**
   - Ayarlar menüsünden "Windows ile otomatik başlat" seçildiğinde Windows Görev Zamanlayıcı'ya kaydedilir.
   - Böylece bilgisayar her açıldığında kullanıcıya **UAC izin kutusu sormadan** sessizce sistem tepsisinde başlar.

6. **Minimum Sistem Tüketimi:**
   - Arka plandayken yalnızca özet sensörler okunur (CPU < %0.1).
   - Kullanılmayan formlar bellekten düşürülür, GDI/Icon nesneleri otomatik temizlenir.

