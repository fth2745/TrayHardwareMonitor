/* ==========================================================================
   H. YARDIMCI VE ETKİLEŞİM BİLEŞENLERİ (H1–H6) + İSKELET KATALOĞU (S-*)
   H grubu grafik değildir; kart iskeleti ve etkileşim parçalarıdır.
   ========================================================================== */

export const SKELETON_POOL = [
  { code: 'S-bento',   refSource: 'REF-2', name: 'S-bento · Standart Bento Kart İskeleti' },
  { code: 'S-minimal', refSource: 'REF-1', name: 'S-minimal · Simetrik Ortalanmış Minimal İskelet' },
  { code: 'S-hero',    refSource: 'REF-2', name: 'S-hero (H1) · Vurgu Zeminli Kahraman Kart + Alt Şerit' },
  { code: 'S-row',     refSource: 'REF-4', name: 'S-row · Tek Satırlık Yatay Kompakt İskelet' }
];

export const UI_HELPER_POOL = [
  {
    code: 'H1',
    refSource: 'REF-2',
    name: 'H1 · Kahraman Kart Kabuğu & Değişim Rozeti (S-hero)',
    desc: 'Yüksek kontrastlı vurgu zemini (--bg-hero), sağda görsel alanı ve altta koyu bilgi şeridi (--bg-hero-band).'
  },
  {
    code: 'H2',
    refSource: 'REF-1',
    name: 'H2 · Alt Çizgili Metin Sekmeleri + Karşı Uçta Özet',
    desc: 'Aktif sekme 2px mavi alt çizgili, pasif sekme gri; sağ uçta yalnızca sayı kısmı renkli özet metni.'
  },
  {
    code: 'H3',
    refSource: 'REF-3',
    name: 'H3 · 3\'lü Segmentli Kontrol (Segmented Pill)',
    desc: 'Üst barda görünüm modu ve zaman penceresi (1dk / 5dk / 15dk) seçimi sağlayan beyaz aktif dolgulu kapsül.'
  },
  {
    code: 'H4',
    refSource: 'REF-3',
    name: 'H4 · Detay Penceresi (Scrim + Blur Popover)',
    desc: 'Karta tıklandığında bulanık arka plan üzerinde açılan ~390px detaylı analiz ve sensör/grafik yapılandırma penceresi.'
  },
  {
    code: 'H5',
    refSource: 'REF-2',
    name: 'H5 · Sağ Üst Mavi Genişlet & Aksiyon İkonları',
    desc: 'Kartın sağ üst köşesinde yer alan mavi popover tetikleyici (⤢), genişlik değiştirici (⇔) ve kart silme (×) butonları.'
  },
  {
    code: 'H6',
    refSource: 'REF-4',
    name: 'H6 · Renkli Dolgulu Hap Etiketler (Pill Tags + "+")',
    desc: 'Kart üstünde sensör kategorisini ve donanım birimini belirten yarı saydam renkli hap etiketler ve "+" çipi.'
  }
];

export function renderH2TabsHtml(data, activeTab = 'live') {
  return `
    <div class="h2-tabs-bar">
      <div class="h2-tab-list">
        <button class="h2-tab ${activeTab === 'live' ? 'active' : ''}" data-h2tab="live" type="button">Canlı İz</button>
        <button class="h2-tab ${activeTab === 'stats' ? 'active' : ''}" data-h2tab="stats" type="button">Kümülatif</button>
      </div>
      <span class="h2-summary tabular-nums">Ort: <strong class="js-avg-text">${data.formattedAvg || '-'}</strong></span>
    </div>
  `;
}

export function renderH6PillsHtml(data) {
  return `
    <div class="h6-pills">
      <span class="h6-pill blue">${data.type || 'Telemetri'}</span>
      <span class="h6-pill orange">${data.hardware || 'Sistem'}</span>
      <span class="h6-pill plus" title="Çoklu Sensör / Kanal Bağla">+</span>
    </div>
  `;
}

/**
 * Katalog modunun 2. Bölümünde H1–H6 ve S-* İskelet bileşenlerini canlı etkileşimli vitrin olarak çizer.
 */
export function createUiHelperShowcaseElement(helperItem, onOpenDemoPopover) {
  const el = document.createElement('article');
  el.className = 'uiv2-card S-bento span-4';
  el.style.minHeight = '195px';

  let demoHtml = '';
  if (helperItem.code === 'H1') {
    demoHtml = `
      <div style="background:var(--bg-hero);color:var(--text-on-hero);border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.12);">
        <div style="padding:12px 14px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:10.5px;color:var(--text-on-hero-muted);">S-hero İskeleti</div>
            <div class="tabular-nums" style="font-size:24px;font-weight:700;">82,4%</div>
          </div>
          <span class="delta-chip up" style="background:rgba(255,255,255,0.2);color:#fff;">▲ +4.2%</span>
        </div>
        <div style="background:var(--bg-hero-band);padding:6px 14px;font-size:10.5px;color:var(--text-on-hero-muted);">
          Alt Bilgi Şeridi · Kontrast Korumalı (--text-on-hero)
        </div>
      </div>
    `;
  } else if (helperItem.code === 'H2') {
    demoHtml = renderH2TabsHtml({ formattedAvg: '56.4 °C' }, 'live');
  } else if (helperItem.code === 'H3') {
    demoHtml = `
      <div style="display:flex;justify-content:center;padding:10px 0;">
        <div class="seg-control">
          <button class="seg-btn active" type="button">1dk</button>
          <button class="seg-btn" type="button">5dk</button>
          <button class="seg-btn" type="button">15dk</button>
        </div>
      </div>
    `;
  } else if (helperItem.code === 'H4') {
    demoHtml = `
      <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card-inner);padding:12px;border-radius:10px;">
        <span style="font-size:11.5px;color:var(--text-secondary);">Scrim + Blur Detay Penceresi</span>
        <button class="ctrl-btn primary js-demo-popover-btn" type="button" style="padding:5px 10px;font-size:11px;">H4 Popover'ı Test Et ⤢</button>
      </div>
    `;
  } else if (helperItem.code === 'H5') {
    demoHtml = `
      <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card-inner);padding:12px;border-radius:10px;">
        <span style="font-size:11.5px;color:var(--text-secondary);">Kart Köşe Aksiyon Grubu</span>
        <div class="card-action-btns">
          <button class="icon-btn-ghost" type="button" title="Genişlik">⇔</button>
          <button class="icon-btn-blue" type="button" title="Genişlet">⤢</button>
          <button class="icon-btn-danger" type="button" title="Kartı Kaldır">×</button>
        </div>
      </div>
    `;
  } else if (helperItem.code === 'H6') {
    demoHtml = renderH6PillsHtml({ type: 'Sıcaklık', hardware: 'AMD Ryzen 9' });
  }

  el.innerHTML = `
    <div>
      <div class="s-bento-top">
        <div class="s-bento-title">
          <span class="chart-code-pill" style="background:rgba(139,92,246,0.2);color:var(--accent-purple);">${helperItem.code}</span>
          <span style="font-weight:600;color:var(--text-primary);">${helperItem.name}</span>
        </div>
        <span class="chart-code-pill">${helperItem.refSource}</span>
      </div>
      <p style="font-size:11.5px;color:var(--text-secondary);line-height:1.45;margin:6px 0 12px;">${helperItem.desc}</p>
    </div>
    <div>${demoHtml}</div>
  `;

  el.querySelector('.js-demo-popover-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onOpenDemoPopover) onOpenDemoPopover();
  });

  return el;
}

