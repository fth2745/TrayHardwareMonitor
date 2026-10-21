/* ==========================================================================
   E. KARŞILAŞTIRMA, ARALIK VE ÇOK BOYUTLU GRAFİKLER (E1–E3)
   Modernize Edilmiş E1, E2, E3
   ========================================================================== */

/**
 * E1 — İki Nokta Aralık Göstergesi (Modernize Edilmiş · needs: 'single')
 */
export function renderE1(container, data) {
  const w = Math.max(220, Math.round(container.clientWidth || 320));
  const h = 114;
  const padX = 24;
  const trackW = w - padX * 2;

  const val = Number.isFinite(data.value) ? data.value : 72;
  const ref = Number.isFinite(data.avg) ? data.avg : Math.max(25, val * 0.72);
  const hi = Math.max(val, ref, Number.isFinite(data.max) ? data.max : 100, 100) * 1.15;

  const refRatio = Math.max(0.12, Math.min(0.86, ref / hi));
  const valRatio = Math.max(0.14, Math.min(0.90, val / hi));
  const refPx = padX + refRatio * trackW;
  const valPx = padX + valRatio * trackW;

  const leftPx = Math.min(refPx, valPx);
  const rightPx = Math.max(refPx, valPx);
  const diff = val - ref;
  const diffSign = diff >= 0 ? '+' : '';
  const uid = 'e1grad_' + (data.id || 'cat').replace(/[^a-zA-Z0-9]/g, '');

  container.innerHTML = `
    <div style="width:100%;padding:4px 0;">
      <svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible;">
        <defs>
          <linearGradient id="${uid}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="var(--accent-indigo)" />
            <stop offset="100%" stop-color="var(--accent-cyan)" />
          </linearGradient>
        </defs>

        <!-- Kılavuz kesikli hat -->
        <line x1="${padX}" y1="58" x2="${w - padX}" y2="58" stroke="var(--text-muted)" stroke-opacity="0.35" stroke-width="1.5" stroke-dasharray="4 4" />

        <!-- Gradyanlı kalın bağlantı segmenti -->
        <line x1="${leftPx.toFixed(1)}" y1="58" x2="${rightPx.toFixed(1)}" y2="58" stroke="url(#${uid})" stroke-width="4.5" stroke-linecap="round" />

        <!-- Boş Noktadan (Referans) Aşağı Noktalı Çizgi ve Hap Etiket -->
        <line x1="${refPx.toFixed(1)}" y1="64" x2="${refPx.toFixed(1)}" y2="88" stroke="var(--text-secondary)" stroke-width="1.2" stroke-dasharray="2 2" />
        <rect x="${(refPx - 38).toFixed(1)}" y="88" width="76" height="20" rx="6" fill="var(--bg-card-inner)" stroke="var(--border-subtle)" />
        <text x="${refPx.toFixed(1)}" y="102" text-anchor="middle" fill="var(--text-secondary)" font-size="10" font-family="var(--font-mono)">
          Ref: ${data.formattedAvg || ref.toFixed(1)}
        </text>

        <!-- Dolu Noktadan (Anlık) Yukarı İnce Çizgi ve Hap Etiket -->
        <line x1="${valPx.toFixed(1)}" y1="52" x2="${valPx.toFixed(1)}" y2="28" stroke="var(--accent-cyan)" stroke-width="1.4" />
        <rect x="${(valPx - 44).toFixed(1)}" y="8" width="88" height="20" rx="6" fill="var(--bg-card-inner)" stroke="var(--accent-blue)" stroke-width="1.2" />
        <text x="${valPx.toFixed(1)}" y="22" text-anchor="middle" fill="var(--text-primary)" font-size="10.5" font-weight="700" font-family="var(--font-mono)">
          Anlık: ${data.formattedValue || val.toFixed(1)}
        </text>

        <!-- İçi Boş Referans Noktası -->
        <circle cx="${refPx.toFixed(1)}" cy="58" r="6" fill="var(--bg-card)" stroke="var(--accent-indigo)" stroke-width="2.5" />

        <!-- Dolu Anlık Hedef Noktası + Parlama Halosu -->
        <circle cx="${valPx.toFixed(1)}" cy="58" r="10" fill="rgba(6,182,212,0.22)" />
        <circle cx="${valPx.toFixed(1)}" cy="58" r="6" fill="var(--text-primary)" stroke="var(--accent-cyan)" stroke-width="2.5" />
      </svg>
      <div style="text-align:center;font-size:10.5px;color:var(--text-muted);margin-top:2px;font-family:var(--font-mono);">
        Fark: <strong style="color:${diff >= 0 ? 'var(--accent-amber)' : 'var(--accent-green)'};">${diffSign}${diff.toFixed(1)} ${data.unit || ''}</strong>
      </div>
    </div>
  `;
}

/**
 * E2 — Beşgen Radar Grafik (Modernize Edilmiş · needs: 'multi')
 */
export function renderE2(container, data) {
  const cx = 150, cy = 68, maxR = 46;
  const multi = Array.isArray(data.multiSensors) && data.multiSensors.length >= 3
    ? data.multiSensors
    : null;

  let axes;
  if (multi) {
    const padded = [...multi];
    while (padded.length < 5) padded.push(padded[padded.length - 1]);
    const topMax = Math.max(...padded.map(s => Number.isFinite(s.max) && s.max > 0 ? s.max : (s.value || 100)), 100);
    axes = padded.slice(0, 5).map(s => {
      const v = Number.isFinite(s.value) ? s.value : 50;
      const hi = (Number.isFinite(s.max) && s.max > 0) ? s.max : topMax;
      const ratio = Math.max(0.22, Math.min(1, v / Math.max(1, hi)));
      return {
        label: (s.name || 'Sensör').slice(0, 10),
        num: v.toFixed(0),
        ratio
      };
    });
  } else {
    const val = Number.isFinite(data.value) ? data.value : 68;
    const avg = Number.isFinite(data.avg) ? data.avg : 55;
    const max = Math.max(Number.isFinite(data.max) ? data.max : 88, val, 1);
    const min = Number.isFinite(data.min) ? data.min : 32;
    axes = [
      { label: 'Anlık', num: Math.round((val / max) * 100), ratio: Math.max(0.25, Math.min(1, val / max)) },
      { label: 'Ortalama', num: Math.round((avg / max) * 100), ratio: Math.max(0.25, Math.min(1, avg / max)) },
      { label: 'Tepe', num: 92, ratio: 0.92 },
      { label: 'Kararlılık', num: 86, ratio: 0.86 },
      { label: 'Taban', num: Math.round((min / max) * 100), ratio: Math.max(0.25, Math.min(0.9, (min / max) || 0.45)) }
    ];
  }

  const ptAt = (idx, r) => {
    const angle = (-90 + idx * 72) * (Math.PI / 180);
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  };

  const rings = [0.35, 0.68, 1.0].map(scale => {
    const pts = [0, 1, 2, 3, 4].map(i => {
      const p = ptAt(i, maxR * scale);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="rgba(99,102,241,0.25)" stroke-width="1" />`;
  }).join('');

  const spokes = [0, 1, 2, 3, 4].map(i => {
    const p = ptAt(i, maxR);
    return `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="rgba(99,102,241,0.2)" stroke-width="1" />`;
  }).join('');

  const polyPoints = axes.map((ax, i) => ptAt(i, maxR * ax.ratio));
  const dataPolyStr = polyPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Köşelerdeki parlayan veri noktaları
  const vertexDots = polyPoints.map(p => `
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="#FFFFFF" stroke="#C084FC" stroke-width="2" />
  `).join('');

  const labelsSvg = axes.map((ax, i) => {
    const p = ptAt(i, maxR + 15);
    const anchor = i === 0 ? 'middle' : (i === 1 || i === 2) ? 'start' : 'end';
    return `
      <text x="${p.x.toFixed(1)}" y="${(p.y + 3).toFixed(1)}" text-anchor="${anchor}" font-size="9.5" fill="var(--text-secondary)">
        ${ax.label} <tspan fill="var(--text-primary)" font-family="var(--font-mono)" font-weight="700">${ax.num}</tspan>
      </text>
    `;
  }).join('');

  const uid = 'rad_' + (data.id || 'cat').replace(/[^a-zA-Z0-9]/g, '');

  container.innerHTML = `
    <div style="display:flex;justify-content:center;width:100%;">
      <svg width="300" height="136" viewBox="0 0 300 136" style="max-width:100%;overflow:visible;">
        <defs>
          <linearGradient id="${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FB923C" stop-opacity="0.55" />
            <stop offset="100%" stop-color="#8B5CF6" stop-opacity="0.55" />
          </linearGradient>
        </defs>
        ${rings}
        ${spokes}
        <polygon points="${dataPolyStr}" fill="url(#${uid})" stroke="#C084FC" stroke-width="1.8" />
        ${vertexDots}
        ${labelsSvg}
      </svg>
    </div>
  `;
}

/**
 * E3 — Nokta Dizisi Zaman Çizelgesi (Modernize Edilmiş · needs: 'single')
 */
export function renderE3(container, data) {
  const w = Math.max(220, Math.round(container.clientWidth || 300));
  const h = 116, top = 22, bot = 96;
  const rightAxisW = 34;
  const plotW = w - rightAxisW - 18;
  const colCount = Math.max(6, Math.min(14, Math.floor(plotW / 38)));

  const rawHist = (Array.isArray(data.history) && data.history.length >= 4)
    ? data.history
    : [48, 54, 52, 63, 60, Number.isFinite(data.value) ? data.value : 66];

  const hist = [];
  for (let i = 0; i < colCount - 1; i++) {
    const idx = Math.max(0, rawHist.length - (colCount - 1) + i);
    hist.push(rawHist[idx] ?? rawHist[0] ?? 50);
  }
  const cols = hist.concat([null]);

  const minV = Math.min(...hist) - 6;
  const maxV = Math.max(...hist) + 6;
  const mapY = (v) => bot - ((v - minV) / Math.max(1, maxV - minV)) * (bot - top);

  let colsSvg = '';
  const stepX = plotW / Math.max(1, cols.length - 1);

  cols.forEach((v, i) => {
    const x = 18 + i * stepX;
    const isFuture = v === null;
    const isActive = i === cols.length - 2;
    const expVal = (Number.isFinite(data.avg) ? data.avg : 55) + Math.sin(i) * 3;
    const yExp = mapY(expVal);
    const yAct = isFuture ? yExp : mapY(v);

    const statusTag = isActive ? 'AKTİF' : isFuture ? 'TAHMİN' : `T-${cols.length - 2 - i}`;
    const tagColor = isActive ? 'var(--accent-peach)' : isFuture ? 'var(--text-muted)' : 'var(--accent-indigo)';

    colsSvg += `
      <text x="${x.toFixed(1)}" y="12" text-anchor="middle" font-size="8.5" font-family="var(--font-mono)" fill="${tagColor}">${statusTag}</text>
      <line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${bot}" stroke="var(--grid-line)" stroke-width="1" />
      ${!isFuture ? `
        <!-- Beklenen ve Gerçekleşen Arasındaki Dikey Bağlantı Çubuğu (Range Stem) -->
        <line x1="${x.toFixed(1)}" y1="${yExp.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yAct.toFixed(1)}" stroke="var(--accent-indigo)" stroke-width="2" opacity="0.65" />
      ` : ''}
      <circle cx="${x.toFixed(1)}" cy="${yExp.toFixed(1)}" r="4.2" fill="var(--bg-card)" stroke="var(--accent-indigo)" stroke-width="1.8" />
      ${!isFuture ? `
        ${isActive ? `<circle cx="${x.toFixed(1)}" cy="${yAct.toFixed(1)}" r="11" fill="rgba(251,146,60,0.25)" />` : ''}
        <circle cx="${x.toFixed(1)}" cy="${yAct.toFixed(1)}" r="4.5" fill="${isActive ? 'var(--accent-peach)' : 'var(--text-primary)'}" />
      ` : ''}
    `;
  });

  container.innerHTML = `
    <svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible;">
      <line x1="12" y1="${top}" x2="${w - rightAxisW}" y2="${top}" stroke="var(--grid-line)" stroke-dasharray="3 3" />
      <line x1="12" y1="${(top + bot) / 2}" x2="${w - rightAxisW}" y2="${(top + bot) / 2}" stroke="var(--grid-line)" stroke-dasharray="3 3" />
      <line x1="12" y1="${bot}" x2="${w - rightAxisW}" y2="${bot}" stroke="var(--grid-line)" stroke-dasharray="3 3" />
      <text x="${w - 2}" y="${top + 3}" text-anchor="end" font-size="9" fill="var(--text-muted)" font-family="var(--font-mono)">${maxV.toFixed(0)}</text>
      <text x="${w - 2}" y="${(top + bot) / 2 + 3}" text-anchor="end" font-size="9" fill="var(--text-muted)" font-family="var(--font-mono)">${((maxV + minV) / 2).toFixed(0)}</text>
      <text x="${w - 2}" y="${bot + 3}" text-anchor="end" font-size="9" fill="var(--text-muted)" font-family="var(--font-mono)">${minV.toFixed(0)}</text>
      ${colsSvg}
    </svg>
  `;
}
