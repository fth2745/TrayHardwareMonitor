/* ==========================================================================
   A. HALKALAR, YAYLAR VE KADRANLAR (A6)
   A1–A5 kaldırıldı, yalnızca A6 (Saat Kadranı + Kanat Metrikler) kaldı.
   ========================================================================== */

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getNormalizedPct(data) {
  const val = Number.isFinite(data.value) ? data.value : 0;
  if (data.unit === '%') return clamp(val, 0, 100);
  const hi = (Number.isFinite(data.max) && data.max > 0) ? Math.max(data.max * 1.1, 100) : 100;
  return clamp((val / hi) * 100, 0, 100);
}

/**
 * A6 — Saat Kadranı Gösterge + Sağ/Sol Kanat Metrikleri (needs: 'single')
 */
export function renderA6(container, data) {
  const pct = getNormalizedPct(data);
  const ticks = 28;
  const activeTicks = Math.round((pct / 100) * ticks);
  let tickSvg = '';
  for (let i = 0; i < ticks; i++) {
    const angle = -210 + (i / (ticks - 1)) * 240;
    const rad = (angle * Math.PI) / 180;
    const x1 = 55 + Math.cos(rad) * 38;
    const y1 = 55 + Math.sin(rad) * 38;
    const x2 = 55 + Math.cos(rad) * 46;
    const y2 = 55 + Math.sin(rad) * 46;
    const isLit = i < activeTicks;
    const color = isLit
      ? (i > ticks * 0.8 ? 'var(--accent-red)' : i > ticks * 0.6 ? 'var(--accent-amber)' : 'var(--accent-blue)')
      : 'var(--track-bg)';
    tickSvg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="2.6" stroke-linecap="round" />`;
  }

  const hist = data.history || [];
  const delta10 = hist.length >= 2 ? (hist[hist.length - 1] - hist[0]) : 0;
  const trendStr = (delta10 >= 0 ? '+' : '') + delta10.toFixed(1);

  container.innerHTML = `
    <div class="tabular-nums" style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;width:100%;">
      <div style="display:flex;flex-direction:column;gap:8px;text-align:left;">
        <div>
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">MİN</div>
          <div style="font-size:12.5px;font-weight:600;font-family:var(--font-mono);color:var(--text-primary);">${data.formattedMin || '-'}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">ORT</div>
          <div style="font-size:12.5px;font-weight:600;font-family:var(--font-mono);color:var(--accent-blue);">${data.formattedAvg || '-'}</div>
        </div>
      </div>

      <svg width="110" height="104" viewBox="0 0 110 104" style="flex-shrink:0;">
        ${tickSvg}
        <circle cx="55" cy="55" r="31" fill="none" stroke="var(--divider-faint)" stroke-width="1" />
        <text x="55" y="54" text-anchor="middle" fill="var(--text-primary)" font-size="14" font-weight="700" font-family="var(--font-mono)">${pct.toFixed(0)}%</text>
        <text x="55" y="68" text-anchor="middle" fill="var(--text-muted)" font-size="9">KADRAN</text>
      </svg>

      <div style="display:flex;flex-direction:column;gap:8px;text-align:right;">
        <div>
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">MAKS</div>
          <div style="font-size:12.5px;font-weight:600;font-family:var(--font-mono);color:var(--text-primary);">${data.formattedMax || '-'}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">TREND</div>
          <div style="font-size:12.5px;font-weight:600;font-family:var(--font-mono);color:${delta10 > 0 ? 'var(--accent-amber)' : 'var(--accent-green)'};">${trendStr}</div>
        </div>
      </div>
    </div>
  `;
}
