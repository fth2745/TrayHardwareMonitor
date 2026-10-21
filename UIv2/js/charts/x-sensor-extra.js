/* ==========================================================================
   X. EKSTRA SENSÖR GRAFİKLERİ (X2, X3)
   X1 ve X4 kaldırıldı. X2 ve X3 modernize edildi.
   ========================================================================== */

function buildSmoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const mx = (p0.x + p1.x) / 2;
    d += ` C ${mx.toFixed(2)} ${p0.y.toFixed(2)}, ${mx.toFixed(2)} ${p1.y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }
  return d;
}

/**
 * X2 — Çoklu Sensör Bindirmeli Çizgi Grafik (Modernize Edilmiş · needs: 'multi')
 * - Pürüzsüz kübik Bezier eğrileri
 * - Her serinin ucunda parlayan renkli uç nokta
 * - Üstte her serinin anlık değerini gösteren canlı etiketler
 */
export function renderX2(container, data) {
  const w = Math.max(200, Math.round(container.clientWidth || 280));
  const h = 96;
  const padL = 8;
  const padR = 12;
  const padT = 10;
  const padB = 12;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const multi = Array.isArray(data.multiSensors) && data.multiSensors.length >= 2
    ? data.multiSensors
    : null;

  const s1 = (Array.isArray(data.history) && data.history.length >= 3)
    ? data.history.slice(-20)
    : [45, 50, 48, 56, 62, 58, 66, 64];

  const s2 = multi && multi[1] && Array.isArray(multi[1].history) && multi[1].history.length >= 3
    ? multi[1].history.slice(-s1.length)
    : s1.map((v, i) => v * 0.85 + Math.cos(i) * 2.2);

  const s3 = multi && multi[2] && Array.isArray(multi[2].history) && multi[2].history.length >= 3
    ? multi[2].history.slice(-s1.length)
    : s1.map((v, i) => v * 0.72 + Math.sin(i) * 1.8);

  const all = s1.concat(s2, s3);
  let minV = Math.min(...all) - 2;
  let maxV = Math.max(...all) + 2;
  if (maxV - minV < 4) { minV -= 2; maxV += 2; }

  const mapPts = (arr) => arr.map((v, i) => ({
    x: padL + (i / Math.max(1, arr.length - 1)) * plotW,
    y: padT + plotH - ((v - minV) / Math.max(0.001, maxV - minV)) * plotH
  }));

  const pts3 = mapPts(s3);
  const pts2 = mapPts(s2);
  const pts1 = mapPts(s1);

  const d3 = buildSmoothPath(pts3);
  const d2 = buildSmoothPath(pts2);
  const d1 = buildSmoothPath(pts1);

  const last1 = pts1[pts1.length - 1];
  const last2 = pts2[pts2.length - 1];
  const last3 = pts3[pts3.length - 1];

  const l1 = (data.name || 'Kanal 1').slice(0, 10);
  const l2 = multi?.[1] ? multi[1].name.slice(0, 10) : 'Ortalama';
  const l3 = multi?.[2] ? multi[2].name.slice(0, 10) : 'Taban';

  const v1 = s1[s1.length - 1]?.toFixed(0) || '-';
  const v2 = s2[s2.length - 1]?.toFixed(0) || '-';
  const v3 = s3[s3.length - 1]?.toFixed(0) || '-';

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:5px;width:100%;">
      <div class="tabular-nums" style="display:flex;gap:10px;font-size:10px;color:var(--text-secondary);justify-content:flex-end;flex-wrap:wrap;align-items:center;">
        <span><strong style="color:var(--accent-cyan);">● ${l1}:</strong> ${v1}</span>
        <span><strong style="color:var(--accent-indigo);">● ${l2}:</strong> ${v2}</span>
        <span><strong style="color:var(--accent-magenta);">● ${l3}:</strong> ${v3}</span>
      </div>
      <svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible;">
        <!-- Seri 3 (Magenta) -->
        <path d="${d3}" fill="none" stroke="var(--accent-magenta)" stroke-width="1.8" opacity="0.75" />
        <circle cx="${last3.x.toFixed(1)}" cy="${last3.y.toFixed(1)}" r="3" fill="var(--accent-magenta)" />

        <!-- Seri 2 (İndigo) -->
        <path d="${d2}" fill="none" stroke="var(--accent-indigo)" stroke-width="2.0" opacity="0.88" />
        <circle cx="${last2.x.toFixed(1)}" cy="${last2.y.toFixed(1)}" r="3.5" fill="var(--accent-indigo)" />

        <!-- Seri 1 (Cyan - Birincil) -->
        <path d="${d1}" fill="none" stroke="var(--accent-cyan)" stroke-width="2.6" stroke-linecap="round" />
        <circle cx="${last1.x.toFixed(1)}" cy="${last1.y.toFixed(1)}" r="6" fill="rgba(6,182,212,0.25)" />
        <circle cx="${last1.x.toFixed(1)}" cy="${last1.y.toFixed(1)}" r="4.2" fill="#FFFFFF" stroke="var(--accent-cyan)" stroke-width="2.2" />
      </svg>
    </div>
  `;
}

/**
 * X3 — Değer Dağılım Histogramı (Modernize Edilmiş · needs: 'single')
 * - Aktif dilim vurgusu ve üst ok göstergesi
 * - Yuvarlatılmış kapsül sütunlar ve çok kademeli termal renkler
 */
export function renderX3(container, data) {
  const w = Math.max(200, Math.round(container.clientWidth || 280));
  const binCount = Math.max(8, Math.min(14, Math.floor(w / 30)));

  const hist = (Array.isArray(data.history) && data.history.length >= 5)
    ? data.history
    : [35, 42, 48, 51, 52, 54, 55, 58, 62, 64, 53, 51, 49, 72];
  const minV = Math.min(...hist);
  const maxV = Math.max(...hist, minV + 10);
  const currentVal = Number.isFinite(data.value) ? data.value : hist[hist.length - 1];

  const bins = new Array(binCount).fill(0);
  hist.forEach(v => {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor(((v - minV) / Math.max(0.001, maxV - minV)) * binCount)));
    bins[idx]++;
  });
  const maxBin = Math.max(...bins, 1);

  // Anlık değerin hangi dilime düştüğünü bul
  const activeBinIdx = Math.min(binCount - 1, Math.max(0, Math.floor(((currentVal - minV) / Math.max(0.001, maxV - minV)) * binCount)));

  const colors = [
    '#3B82F6', '#06B6D4', '#10B981', '#84CC16', '#F59E0B', '#F97316', '#EF4444'
  ];

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:5px;width:100%;">
      <!-- Aktif Dilim İşaretçi Şeridi -->
      <div style="display:grid;grid-template-columns:repeat(${binCount},1fr);height:12px;gap:5px;text-align:center;">
        ${bins.map((_, i) => `
          <span style="font-size:10px;color:var(--accent-cyan);line-height:1;">${i === activeBinIdx ? '▼' : ''}</span>
        `).join('')}
      </div>

      <!-- Kapsül Çubuklar -->
      <div style="display:grid;grid-template-columns:repeat(${binCount},1fr);align-items:end;height:72px;gap:5px;">
        ${bins.map((count, i) => {
          const pct = Math.max(12, (count / maxBin) * 100);
          const isActive = i === activeBinIdx;
          const color = colors[Math.min(colors.length - 1, Math.floor((i / binCount) * colors.length))];
          return `
            <div style="height:100%;display:flex;flex-direction:column;justify-content:flex-end;">
              <div style="height:${pct.toFixed(0)}%;background:${color};border-radius:5px 5px 2px 2px;transition:height 0.3s ease;${isActive ? 'box-shadow: 0 0 8px ' + color + '; border: 1.5px solid #FFFFFF;' : 'opacity:0.8;'}"
                   title="Dilim ${i + 1}: ${count} okuma"></div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="tabular-nums" style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);font-family:var(--font-mono);">
        <span>Min: ${minV.toFixed(0)}</span>
        <span>Anlık Dilim: <strong style="color:var(--accent-cyan);">${currentVal?.toFixed(1) || '-'}</strong></span>
        <span>Maks: ${maxV.toFixed(0)}</span>
      </div>
    </div>
  `;
}
