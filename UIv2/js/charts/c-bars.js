/* ==========================================================================
   C. ÇUBUK, KAPSÜL VE BLOK GRAFİKLERİ (C1, C4, C7)
   C2, C3, C5, C6 kaldırıldı.
   ========================================================================== */

import { buildMultiOrPeerRows } from './c-bars-helper.js';

/**
 * C1 — Yatay Noktalı İz Çubukları (needs: 'multi')
 */
export function renderC1(container, data) {
  const rows = buildMultiOrPeerRows(data, 4);
  container.innerHTML = `
    <div class="c1-track-list">
      ${rows.map((r, idx) => {
        const isFocus = r.focus || idx === 0;
        const pct = Math.max(14, Math.min(88, r.pct ?? 55));
        const startLeft = Math.max(0, Math.min(50, (idx * 14) % 42));
        const widthPct = Math.max(20, Math.min(100 - startLeft, pct * 0.58));
        return `
          <div class="c1-row">
            <span class="c1-label" title="${r.label}">${r.label}</span>
            <div class="c1-dotted-rail">
              <div class="c1-segment ${isFocus ? 'focus' : 'ref'}" style="left:${startLeft}%;width:${widthPct}%;"></div>
            </div>
            <span class="c1-val ${isFocus ? 'focus' : 'ref'}">${r.formatted}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/**
 * C4 — 2x2 Yatay Kapsül Izgarası (needs: 'single')
 */
export function renderC4(container, data) {
  const val = Number.isFinite(data.value) ? data.value : 64;
  const max = Math.max(Number.isFinite(data.max) ? data.max : 100, val, 1);
  const avg = Number.isFinite(data.avg) ? data.avg : val * 0.8;
  const min = Number.isFinite(data.min) ? data.min : val * 0.5;

  const items = [
    { k: 'Anlık', v: data.formattedValue || '-', pct: Math.min(100, Math.max(12, (val / max) * 100)) },
    { k: 'Ortalama', v: data.formattedAvg || '-', pct: Math.min(100, Math.max(12, (avg / max) * 100)) },
    { k: 'Minimum', v: data.formattedMin || '-', pct: Math.min(100, Math.max(12, (min / max) * 100)) },
    { k: 'Maksimum', v: data.formattedMax || '-', pct: 92 }
  ];

  container.innerHTML = `
    <div class="c4-grid">
      ${items.map(it => `
        <div class="c4-capsule">
          <div class="c4-fill" style="width:${it.pct.toFixed(0)}%;"></div>
          <span class="c4-k">${it.k}</span>
          <span class="c4-v">${it.v}</span>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * C7 — Üç Durumlu Çubuk Grafik + Alt 3 Özet Kutu (needs: 'multi')
 */
export function renderC7(container, data) {
  const w = Math.max(200, Math.round(container.clientWidth || 280));
  const barCount = Math.max(9, Math.min(22, Math.floor(w / 22)));
  const rawHist = (Array.isArray(data.history) && data.history.length >= 4)
    ? data.history
    : [32, 48, 41, 64, 88, 56, 72, 39, 78];

  const hist = [];
  for (let i = 0; i < barCount; i++) {
    const srcIdx = Math.max(0, rawHist.length - barCount + i);
    hist.push(rawHist[srcIdx] ?? rawHist[0] ?? 50);
  }

  const maxV = Math.max(...hist, 1);
  const peakIdx = hist.indexOf(Math.max(...hist));

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;width:100%;">
      <div style="display:grid;grid-template-columns:repeat(${hist.length},1fr);align-items:end;height:68px;gap:5px;">
        ${hist.map((v, i) => {
          const pct = Math.max(14, (v / maxV) * 100);
          const bg = i === peakIdx || i === hist.length - 1
            ? 'var(--accent-cyan)'
            : v > maxV * 0.55 ? 'var(--accent-indigo)' : 'var(--track-fill-muted)';
          return `<div style="height:${pct.toFixed(0)}%;background:${bg};border-radius:5px;transition:height 0.3s ease;"></div>`;
        }).join('')}
      </div>
      <div class="tabular-nums" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
        <div style="background:var(--bg-card-inner);padding:6px 8px;border-radius:8px;font-size:10.5px;">
          <div style="color:var(--accent-cyan);">▲ Aktif</div>
          <strong style="font-family:var(--font-mono);">${data.formattedValue || '-'}</strong>
        </div>
        <div style="background:var(--bg-card-inner);padding:6px 8px;border-radius:8px;font-size:10.5px;">
          <div style="color:var(--accent-indigo);">◆ Normal</div>
          <strong style="font-family:var(--font-mono);">${data.formattedAvg || '-'}</strong>
        </div>
        <div style="background:var(--bg-card-inner);padding:6px 8px;border-radius:8px;font-size:10.5px;">
          <div style="color:var(--text-muted);">▼ Baz</div>
          <strong style="font-family:var(--font-mono);">${data.formattedMin || '-'}</strong>
        </div>
      </div>
    </div>
  `;
}
