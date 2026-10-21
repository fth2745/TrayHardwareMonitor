/* ==========================================================================
   M1: HİBRİT BENTO TELEMETRİ ÖZET TABLOSU & VARYASYONLARI
   - 4 Farklı Görünüm Varyantı:
     1. 'hybrid'  : Canlı Bezier Dalga + 5 Satırlı İlerleme Tablosu
     2. 'tiles'   : NZXT CAM / Bento HUD 5'li Kompakt Cam Kutucuklar
     3. 'minimal' : Saf Tipografik Apple Minimalizmi + Parlayan Delta Çipleri
     4. 'gauge'   : Sol SVG Dairesel Kadran İbresi + Sağ Uydu Metrikleri
   ========================================================================== */

import { renderSmoothLineCore } from './b-lines.js';

const M1_VARIANTS = [
  { id: 'hybrid',  name: 'Hibrit Dalga' },
  { id: 'tiles',   name: 'HUD Kutuları' },
  { id: 'minimal', name: 'Minimalist' },
  { id: 'gauge',   name: 'Kadranlı' }
];

export function renderSummaryMatrix(container, data, options = {}) {
  const cardType = data.cardType || (
    data.name && data.name.includes('CPU') ? 'cpu' :
    data.name && (data.name.includes('GeForce') || data.name.includes('GPU')) ? 'gpu' :
    data.name && data.name.includes('Bellek') ? 'ram' :
    data.name && data.name.includes('Anakart') ? 'board' :
    data.name && data.name.includes('Güç') ? 'psu' :
    data.name && data.name.includes('Fan') ? 'fans' : 'cpu'
  );

  const typeLabels = {
    cpu: 'İşlemci Matrisi',
    gpu: 'Grafik Matrisi',
    ram: 'Bellek Matrisi',
    board: 'Anakart Matrisi',
    psu: 'Güç Kaynağı & Raylar',
    fans: 'Soğutma & Fan Halkaları'
  };

  const variant = data.m1Variant || 'hybrid';
  const variantMeta = M1_VARIANTS.find(v => v.id === variant) || M1_VARIANTS[0];

  const rows = Array.isArray(data.matrixRows) && data.matrixRows.length > 0
    ? data.matrixRows
    : getDefaultMatrixRows(cardType === 'cpu', data);

  const topBarHtml = `
    <div class="m1-variant-bar">
      <span class="m1-variant-tag">${typeLabels[cardType] || 'Donanım Matrisi'}</span>
      <button class="m1-variant-toggle-btn js-toggle-m1-variant" type="button" title="Görünüm Değiştir (Hibrit / HUD / Minimal / Kadran)">
        <span>🎨</span>
        <span>${variantMeta.name}</span>
        <span style="opacity:0.6;font-size:9px;">▾</span>
      </button>
    </div>
  `;

  // Fan kartı için özel iOS şarj widget görünümü (veya diğer 4 varyant)
  if (cardType === 'fans' && variant === 'hybrid') {
    renderFansIosWidget(container, data, rows, topBarHtml);
  } else if (variant === 'tiles') {
    renderTilesVariant(container, data, rows, topBarHtml);
  } else if (variant === 'minimal') {
    renderMinimalVariant(container, data, rows, topBarHtml);
  } else if (variant === 'gauge') {
    renderGaugeVariant(container, data, rows, topBarHtml);
  } else {
    renderHybridVariant(container, data, rows, topBarHtml, cardType === 'cpu');
  }

  // Varyant değiştirme tıklaması (güvenli tekil dinleyici)
  const btnToggle = container.querySelector('.js-toggle-m1-variant');
  if (btnToggle) {
    btnToggle.onclick = (e) => {
      e.stopPropagation();
      container.dispatchEvent(new CustomEvent('cycle-m1-variant', {
        bubbles: true,
        detail: { cardId: data.id }
      }));
    };
  }
}

/**
 * 0. FANLAR İÇİN iOS ŞARJ WIDGET GÖRSELİ (Dairesel Halkalar)
 */
function renderFansIosWidget(container, data, rows, topBarHtml) {
  let box = container.querySelector('.summary-matrix-container.variant-fans-ios');
  const activeCount = rows.filter(r => (Number.isFinite(r.value) && r.value > 0)).length;

  if (!box) {
    container.innerHTML = `
      <div class="summary-matrix-container variant-fans-ios">
        ${topBarHtml}
        <div class="fans-ios-sub-bar">
          <span class="fans-ios-badge">🌀 Aktif: <strong>${activeCount}</strong> / ${rows.length} Fan</span>
          <span style="font-size:10.5px;color:var(--text-muted);">iOS Ring HUD</span>
        </div>
        <div class="fans-ios-grid">
          ${rows.map((row) => {
            const rad = 20;
            const circ = 2 * Math.PI * rad;
            const pct = Math.min(100, Math.max(0, row.pct || 0));
            const strokeOffset = circ - (pct / 100) * circ;
            const isActive = Number.isFinite(row.value) && row.value > 0;
            const ringColor = isActive ? (row.color || 'var(--accent-green)') : 'rgba(255,255,255,0.08)';

            return `
              <div class="fan-ring-card ${isActive ? 'is-active' : 'is-idle'}" title="${row.label}: ${row.formattedValue}">
                <div class="fan-ring-svg-wrap">
                  <svg viewBox="0 0 52 52" class="fan-ring-svg">
                    <circle cx="26" cy="26" r="${rad}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4" />
                    <circle class="js-fan-stroke" cx="26" cy="26" r="${rad}" fill="none" stroke="${ringColor}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${strokeOffset}" transform="rotate(-90 26 26)" style="transition: stroke-dashoffset 0.5s ease;" />
                  </svg>
                  <div class="fan-ring-center">
                    <span class="fan-ring-icon ${isActive ? 'spinning' : ''}">${isActive ? '🌀' : '💤'}</span>
                  </div>
                </div>
                <div class="fan-ring-info tabular-nums">
                  <span class="fan-ring-name">${row.label}</span>
                  <span class="fan-ring-val js-fan-val" style="color: ${isActive ? 'var(--text-primary)' : 'var(--text-muted)'};">${row.formattedValue}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    box = container.querySelector('.summary-matrix-container.variant-fans-ios');
  } else {
    // In-place güncelleme
    const badgeEl = box.querySelector('.fans-ios-badge');
    if (badgeEl) {
      badgeEl.innerHTML = `🌀 Aktif: <strong>${activeCount}</strong> / ${rows.length} Fan`;
    }
    const cardEls = box.querySelectorAll('.fan-ring-card');
    rows.forEach((row, idx) => {
      const el = cardEls[idx];
      if (!el) return;
      const isActive = Number.isFinite(row.value) && row.value > 0;
      el.className = `fan-ring-card ${isActive ? 'is-active' : 'is-idle'}`;
      const circleEl = el.querySelector('.js-fan-stroke');
      if (circleEl) {
        const rad = 20;
        const circ = 2 * Math.PI * rad;
        const pct = Math.min(100, Math.max(0, row.pct || 0));
        const strokeOffset = circ - (pct / 100) * circ;
        circleEl.style.strokeDashoffset = strokeOffset;
        circleEl.style.stroke = isActive ? (row.color || 'var(--accent-green)') : 'rgba(255,255,255,0.08)';
      }
      const valEl = el.querySelector('.js-fan-val');
      if (valEl) {
        valEl.textContent = row.formattedValue;
        valEl.style.color = isActive ? 'var(--text-primary)' : 'var(--text-muted)';
      }
    });
  }
}

/**
 * 1. HİBRİT VARYANT (Varsayılan): Üst dalga + 5 satırlı tablo
 */
function renderHybridVariant(container, data, rows, topBarHtml, isCpu) {
  let box = container.querySelector('.summary-matrix-container.variant-hybrid');
  if (!box) {
    container.innerHTML = `
      <div class="summary-matrix-container variant-hybrid">
        ${topBarHtml}
        <div class="summary-matrix-sparkline js-matrix-spark"></div>
        <div class="summary-matrix-table tabular-nums">
          ${rows.map(row => `
            <div class="matrix-row" title="${row.label}: ${row.formattedValue}">
              <div class="matrix-row-info">
                <span class="matrix-row-icon">${row.icon || '💠'}</span>
                <span class="matrix-row-label">${row.label}</span>
              </div>
              <div class="matrix-bar-track">
                <div class="matrix-bar-fill" style="width: ${Math.min(100, Math.max(3, row.pct || 0))}%; background: ${row.color || 'var(--accent-blue)'};"></div>
              </div>
              <div class="matrix-row-value">
                <span class="matrix-val-text" style="color: ${row.valColor || 'var(--text-primary)'};">${row.formattedValue}</span>
                ${row.badge ? `<span class="matrix-badge ${row.badgeCls || ''}">${row.badge}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    box = container.querySelector('.summary-matrix-container.variant-hybrid');
  } else {
    // Kalıcı DOM: Satırları yerinde güncelle (sparkline silinmez)
    const rowEls = box.querySelectorAll('.matrix-row');
    rows.forEach((row, idx) => {
      const el = rowEls[idx];
      if (!el) return;
      const fillEl = el.querySelector('.matrix-bar-fill');
      if (fillEl) {
        fillEl.style.width = `${Math.min(100, Math.max(3, row.pct || 0))}%`;
        fillEl.style.background = row.color || 'var(--accent-blue)';
      }
      const valEl = el.querySelector('.matrix-val-text');
      if (valEl) {
        valEl.textContent = row.formattedValue;
        valEl.style.color = row.valColor || 'var(--text-primary)';
      }
      const badgeEl = el.querySelector('.matrix-badge');
      if (badgeEl) {
        badgeEl.textContent = row.badge || '';
        badgeEl.className = `matrix-badge ${row.badgeCls || ''}`;
      }
    });
  }

  const sparkEl = box?.querySelector('.js-matrix-spark');
  if (sparkEl) {
    renderSmoothLineCore(sparkEl, data, {
      strokeMode: isCpu ? 'blue' : 'threshold',
      showYAxis: false,
      showArea: true,
      height: 48
    });
  }
}

/**
 * 2. BENTO HUD KUTULARI VARYANTI (NZXT CAM / Apple Bento Tiles)
 */
function renderTilesVariant(container, data, rows, topBarHtml) {
  const mainRow = rows[0] || {};
  const subRows = rows.slice(1);

  container.innerHTML = `
    <div class="summary-matrix-container variant-tiles">
      ${topBarHtml}
      <!-- Ana Vurgu Başlık Kartı -->
      <div class="matrix-tile-hero" style="border-left: 3px solid ${mainRow.valColor || 'var(--accent-blue)'};">
        <div>
          <span class="matrix-tile-hero-title">${mainRow.label}</span>
          <div class="matrix-tile-hero-val tabular-nums" style="color: ${mainRow.valColor || 'var(--text-primary)'};">
            ${mainRow.formattedValue}
          </div>
        </div>
        <div class="matrix-tile-hero-right">
          <div class="matrix-tile-hero-stats tabular-nums">
            <div class="minmax-pill" title="Minimum Değer"><span class="minmax-lbl">MİN</span><strong>${mainRow.minFormatted || data.formattedMin || '-'}</strong></div>
            <div class="minmax-pill" title="Ortalama Değer"><span class="minmax-lbl">ORT</span><strong>${mainRow.avgFormatted || data.formattedAvg || '-'}</strong></div>
            <div class="minmax-pill" title="Maksimum Değer"><span class="minmax-lbl">MAKS</span><strong>${mainRow.maxFormatted || data.formattedMax || '-'}</strong></div>
          </div>
          <span class="matrix-badge ${mainRow.badgeCls || 'up'}" style="font-size: 10px; padding: 2px 7px;">${mainRow.badge || 'Canlı'}</span>
        </div>
      </div>

      <!-- 4'lü Kompakt HUD Kutucukları Izgarası -->
      <div class="matrix-tiles-grid tabular-nums">
        ${subRows.map(row => `
          <div class="matrix-tile-card">
            <div class="matrix-tile-top">
              <span class="matrix-tile-icon">${row.icon}</span>
              <span class="matrix-tile-name">${row.label}</span>
            </div>
            <div class="matrix-tile-val" style="color: ${row.valColor || 'var(--text-primary)'};">${row.formattedValue}</div>
            <div class="matrix-bar-track" style="margin-top: 6px;">
              <div class="matrix-bar-fill" style="width: ${Math.min(100, Math.max(4, row.pct || 0))}%; background: ${row.color || 'var(--accent-blue)'};"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * 3. MİNİMALİST LİSTE VARYANTI (Saf Tipografi & Yüksek Kontrast)
 */
function renderMinimalVariant(container, data, rows, topBarHtml) {
  container.innerHTML = `
    <div class="summary-matrix-container variant-minimal">
      ${topBarHtml}
      <div class="matrix-minimal-list tabular-nums">
        ${rows.map((row, idx) => `
          <div class="matrix-minimal-row">
            <div class="matrix-minimal-left">
              <span class="matrix-minimal-num">0${idx + 1}</span>
              <span class="matrix-minimal-icon">${row.icon}</span>
              <span class="matrix-minimal-label">${row.label}</span>
            </div>
            <div class="matrix-minimal-right">
              <span class="matrix-minimal-val" style="color: ${row.valColor || 'var(--text-primary)'};">${row.formattedValue}</span>
              <span class="matrix-minimal-line" style="background: ${row.color || 'var(--accent-blue)'}; width: 24px; height: 3px; border-radius: 2px;"></span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * 4. KADRANLI ÖZET VARYANTI (Sol SVG Yarım Dairesel İbre + Sağ 4 Metrik)
 */
function renderGaugeVariant(container, data, rows, topBarHtml) {
  const main = rows[0] || { value: 50, formattedValue: '50 °C' };
  const subRows = rows.slice(1);
  const curVal = Number.isFinite(main.value) ? main.value : 50;

  const cardType = data.cardType || (
    data.name && data.name.includes('CPU') ? 'cpu' :
    data.name && (data.name.includes('GeForce') || data.name.includes('GPU')) ? 'gpu' :
    data.name && data.name.includes('Bellek') ? 'ram' :
    data.name && data.name.includes('Anakart') ? 'board' :
    data.name && data.name.includes('Güç') ? 'psu' :
    data.name && data.name.includes('Fan') ? 'fans' : 'cpu'
  );

  let gaugeUnit = '°C';
  if (cardType === 'fans' || String(main.formattedValue || '').includes('RPM')) {
    gaugeUnit = 'RPM';
  } else if (cardType === 'psu' || String(main.formattedValue || '').includes('W')) {
    gaugeUnit = 'W';
  } else if (cardType === 'ram' || String(main.formattedValue || '').includes('%')) {
    gaugeUnit = '%';
  } else if (String(main.formattedValue || '').includes('V')) {
    gaugeUnit = 'V';
  }

  const pct = Number.isFinite(main.pct)
    ? Math.min(100, Math.max(0, main.pct))
    : Math.min(100, Math.max(0, ((curVal - 25) / 65) * 100));

  // Dairesel ibre açı hesaplama: -120deg to +120deg (240deg total sweep)
  const angle = -120 + (pct / 100) * 240;
  const rad = 42;
  const circ = 2 * Math.PI * rad;
  const strokeDash = (240 / 360) * circ;
  const strokeOffset = strokeDash - (pct / 100) * strokeDash;

  container.innerHTML = `
    <div class="summary-matrix-container variant-gauge">
      ${topBarHtml}
      <div class="matrix-gauge-layout">
        <!-- Sol Dairesel İbre -->
        <div class="matrix-gauge-box">
          <svg viewBox="0 0 110 110" class="matrix-gauge-svg">
            <circle cx="55" cy="55" r="${rad}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8" stroke-dasharray="${strokeDash} ${circ}" stroke-dashoffset="0" transform="rotate(150 55 55)" stroke-linecap="round"/>
            <circle cx="55" cy="55" r="${rad}" fill="none" stroke="${main.valColor || 'var(--accent-blue)'}" stroke-width="8" stroke-dasharray="${strokeDash} ${circ}" stroke-dashoffset="${strokeOffset}" transform="rotate(150 55 55)" stroke-linecap="round" style="transition: stroke-dashoffset 0.4s ease;"/>
          </svg>
          <div class="matrix-gauge-center">
            <span class="matrix-gauge-big-num tabular-nums">${Math.round(curVal)}</span>
            <span class="matrix-gauge-unit">${gaugeUnit}</span>
            <span class="matrix-gauge-tag">${main.badge || (cardType === 'psu' ? 'Tahmini' : 'Anlık')}</span>
          </div>
        </div>

        <!-- Sağ Uydu Metrik Listesi -->
        <div class="matrix-gauge-metrics tabular-nums">
          ${subRows.map(row => `
            <div class="matrix-gauge-pill">
              <span class="matrix-gauge-pill-icon">${row.icon}</span>
              <span class="matrix-gauge-pill-label">${row.label}</span>
              <span class="matrix-gauge-pill-val" style="color: ${row.valColor || 'var(--text-primary)'};">${row.formattedValue}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function getDefaultMatrixRows(isCpu, data) {
  const curVal = Number.isFinite(data.value) ? data.value : 50;

  if (isCpu) {
    return [
      {
        icon: '🌡️',
        label: 'İşlemci Sıcaklığı',
        value: curVal,
        formattedValue: `${curVal.toFixed(1)} °C`,
        pct: Math.min(100, Math.max(10, ((curVal - 25) / 65) * 100)),
        color: curVal > 80 ? 'var(--accent-red)' : curVal > 65 ? 'var(--accent-amber)' : 'linear-gradient(90deg, #3B82F6, #6366F1)',
        valColor: curVal > 80 ? 'var(--accent-red)' : 'var(--text-primary)',
        badge: curVal > 80 ? 'Yüksek' : 'Normal',
        badgeCls: curVal > 80 ? 'warn' : 'up'
      },
      {
        icon: '⚡',
        label: 'Saat Hızı (Frekans)',
        value: 4.85,
        formattedValue: '4.85 GHz',
        pct: 82,
        color: 'linear-gradient(90deg, #8B5CF6, #A855F7)',
        valColor: 'var(--text-primary)',
        badge: 'Turbo',
        badgeCls: 'up'
      },
      {
        icon: '🔋',
        label: 'Çekirdek Voltajı (Vcore)',
        value: 1.38,
        formattedValue: '1.380 V',
        pct: 68,
        color: 'linear-gradient(90deg, #06B6D4, #3B82F6)',
        valColor: 'var(--text-primary)'
      },
      {
        icon: '🧠',
        label: 'DIMM 1 Sıcaklığı',
        value: 28.2,
        formattedValue: '28.2 °C',
        pct: 35,
        color: 'linear-gradient(90deg, #10B981, #06B6D4)',
        valColor: 'var(--text-primary)'
      },
      {
        icon: '🧠',
        label: 'DIMM 2 Sıcaklığı',
        value: 28.5,
        formattedValue: '28.5 °C',
        pct: 36,
        color: 'linear-gradient(90deg, #10B981, #06B6D4)',
        valColor: 'var(--text-primary)'
      }
    ];
  }

  // GPU Varsayılanları
  return [
    {
      icon: '🌡️',
      label: 'GPU Sıcaklığı',
      value: curVal,
      formattedValue: `${curVal.toFixed(1)} °C`,
      pct: Math.min(100, Math.max(10, ((curVal - 25) / 65) * 100)),
      color: curVal > 78 ? 'var(--accent-red)' : curVal > 62 ? 'var(--accent-amber)' : 'linear-gradient(90deg, #10B981, #06B6D4)',
      valColor: curVal > 78 ? 'var(--accent-red)' : 'var(--text-primary)',
      badge: 'Serin',
      badgeCls: 'up'
    },
    {
      icon: '📊',
      label: 'GPU Kullanımı (Yük)',
      value: 34.0,
      formattedValue: '%34.0',
      pct: 34,
      color: 'linear-gradient(90deg, #3B82F6, #6366F1)',
      valColor: 'var(--text-primary)'
    },
    {
      icon: '⚡',
      label: 'Güç Tüketimi (Watt)',
      value: 145.0,
      formattedValue: '145.0 W',
      pct: 42,
      color: 'linear-gradient(90deg, #F59E0B, #EF4444)',
      valColor: 'var(--text-primary)'
    },
    {
      icon: '⏱️',
      label: 'Çekirdek Frekansı',
      value: 2760,
      formattedValue: '2760 MHz',
      pct: 88,
      color: 'linear-gradient(90deg, #8B5CF6, #EC4899)',
      valColor: 'var(--text-primary)'
    },
    {
      icon: '🔋',
      label: 'GPU Voltajı',
      value: 0.925,
      formattedValue: '0.925 V',
      pct: 65,
      color: 'linear-gradient(90deg, #06B6D4, #3B82F6)',
      valColor: 'var(--text-primary)'
    }
  ];
}
