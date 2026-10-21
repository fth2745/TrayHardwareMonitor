/* ==========================================================================
   F. YOĞUNLUK / ISI HARİTASI (F1 — 9 Kademeli Keskin Termal Altıgen Petek)
   - 9 keskin kademeli zengin ara renk paleti (Koyu Lacivert -> Mavi -> Turkuaz -> Yeşil -> Limon -> Sarı -> Turuncu -> Kırmızı)
   - Keskin petek sınırları (1.2px) ile net hücre geçişleri
   - container.clientWidth ile dinamik sütun sayısı (asla sündürülmez)
   ========================================================================== */

function hexPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
  }
  return pts.join(' ');
}

// 9 Kademeli Keskin Termal Renk Paleti
const THERMAL_9_STOPS = [
  '#0F172A', // 0: Koyu Gece Laciverti (Çok Soğuk / Boş)
  '#1E3A8A', // 1: Derin Mavi
  '#0284C7', // 2: Parlak Gök Mavi
  '#0D9488', // 3: Canlı Turkuaz
  '#16A34A', // 4: Zümrüt Yeşili (Normal)
  '#84CC16', // 5: Limon Yeşili
  '#EAB308', // 6: Parlak Kehribar Sarısı
  '#EA580C', // 7: Keskin Sıcak Turuncu
  '#DC2626'  // 8: Yoğun Kızıl Kırmızı (Tepe / Yüksek)
];

function getThermalColor(norm) {
  const clamped = Math.max(0, Math.min(0.999, norm));
  const idx = Math.floor(clamped * THERMAL_9_STOPS.length);
  return THERMAL_9_STOPS[idx];
}

/**
 * F1 — Altıgen Isı Şeridi (9 Kademeli Keskin Ara Renkler · needs: 'single')
 */
export function renderF1(container, data) {
  const w = Math.max(220, Math.round(container.clientWidth || 340));
  const rows = 3;
  const r = 8.2;
  const dx = Math.sqrt(3) * r + 2.5;
  const dy = 1.5 * r + 2.4;

  const cols = Math.max(12, Math.floor((w - 24) / dx));
  const svgH = Math.round(rows * dy + 16);

  const hist = Array.isArray(data.history) && data.history.length > 0
    ? data.history
    : [42, 48, 55, 62, 69, 75, 68, 74, 71.2];
  const minH = Math.min(...hist);
  const maxH = Math.max(...hist, minH + 8);

  let polys = '';
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = 14 + col * dx + (row % 2 === 1 ? dx / 2 : 0);
      const cy = 13 + row * dy;

      const histIdx = Math.floor((col / Math.max(1, cols - 1)) * (hist.length - 1));
      const val = hist[histIdx] ?? data.value ?? 50;
      const baseNorm = (val - minH) / Math.max(0.001, maxH - minH);

      // Hücre bazlı hafif deterministik dalgalanma ile zengin ara renk dağılımı
      const cellJitter = Math.sin(col * 0.72 + row * 1.5) * 0.16 + Math.cos(col * 0.3) * 0.08;
      const finalNorm = Math.max(0, Math.min(1, baseNorm + cellJitter));
      const fill = getThermalColor(finalNorm);

      polys += `
        <polygon points="${hexPoints(cx, cy, r)}"
          fill="${fill}"
          stroke="var(--bg-card)"
          stroke-width="1.3"
          stroke-linejoin="round" />
      `;
    }
  }

  // 9 Renkli Mini Gösterge Şeridi
  const legendHtml = THERMAL_9_STOPS.map(c => `
    <span style="flex:1;height:4px;background:${c};border-radius:1px;"></span>
  `).join('');

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:7px;width:100%;">
      <svg width="100%" height="${svgH}" viewBox="0 0 ${w} ${svgH}" style="display:block;">
        ${polys}
      </svg>
      <div style="display:flex;align-items:center;gap:3px;padding:0 2px;">
        ${legendHtml}
      </div>
      <div class="tabular-nums" style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);font-family:var(--font-mono);">
        <span>▼ Soğuk (9 Kademeli Termal)</span>
        <span>Ort: ${data.formattedAvg || '-'}</span>
        <span style="color:var(--accent-orange);">▲ Anlık: ${data.formattedValue || '-'}</span>
      </div>
    </div>
  `;
}
