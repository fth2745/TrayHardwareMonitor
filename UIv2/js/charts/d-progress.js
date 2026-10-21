/* ==========================================================================
   D. HİBRİT MODERN İLERLEME & KAPASİTE BARI (D1)
   D1 + D2 + D3 birleştirilerek tek ve güçlü modern D1 bileşeni oluşturuldu.
   - Üst Satır (D1): Durum rozeti + Sensör adı + sağda yüzde/değer rozeti.
   - Orta Katman (D2+D3): Çok kademeli dolgu barı (Anlık gradyan + Maksimum/Tepe izi + Ortalama pini).
   - Alt Şerit (D2): Min, Ort, Maks sayaç rozetleri.
   ========================================================================== */

function getPct(data) {
  const v = Number.isFinite(data.value) ? data.value : 64;
  if (data.unit === '%') return Math.max(0, Math.min(100, v));
  const max = (Number.isFinite(data.max) && data.max > 0) ? Math.max(data.max * 1.1, 100) : 100;
  return Math.max(5, Math.min(100, (v / max) * 100));
}

/**
 * D1 — Hibrit Modern İlerleme & Kapasite Barı (needs: 'single')
 */
export function renderD1(container, data) {
  const pct = getPct(data);
  const val = Number.isFinite(data.value) ? data.value : 50;
  const max = Number.isFinite(data.max) ? data.max : Math.max(100, val * 1.25);
  const avg = Number.isFinite(data.avg) ? data.avg : val * 0.85;
  const min = Number.isFinite(data.min) ? data.min : val * 0.45;

  const avgPct = Math.max(0, Math.min(100, (avg / Math.max(1, max)) * 100));
  const peakHeadroom = Math.max(0, Math.min(100 - pct, 24));

  container.innerHTML = `
    <div class="tabular-nums" style="display:flex;flex-direction:column;gap:10px;width:100%;padding:4px 0;">
      <!-- Üst Satır (D1 Rozet + İsim + Yüzde) -->
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;">
        <span style="display:flex;align-items:center;gap:6px;min-width:0;">
          <span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;background:rgba(59,130,246,0.18);color:var(--accent-blue);font-family:var(--font-mono);">01</span>
          <span style="font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${data.name || 'Telemetri Kapasitesi'}</span>
        </span>
        <span style="font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(34,197,94,0.18);color:var(--accent-green);font-family:var(--font-mono);flex-shrink:0;">
          ${data.formattedValue || pct.toFixed(0) + '%'} (${pct.toFixed(0)}%)
        </span>
      </div>

      <!-- Orta Katman (D2 + D3 Hibrit Barı: Anlık Gradyan + Tepe İzi + Ort Çentiği) -->
      <div style="position:relative;height:12px;background:var(--track-bg);border-radius:999px;overflow:hidden;display:flex;">
        <!-- Anlık Dolgu (Yeşil -> Cyan Gradyanı) -->
        <div style="width:${pct.toFixed(1)}%;height:100%;background:linear-gradient(90deg, #10B981, #06B6D4);border-radius:999px 0 0 999px;transition:width 0.35s ease;"></div>
        <!-- İkincil Tepe İzi (Yarı Saydam Magenta) -->
        <div style="width:${peakHeadroom.toFixed(1)}%;height:100%;background:rgba(236,72,153,0.35);transition:width 0.35s ease;" title="Tepe Aralığı"></div>
        <!-- Ortalama Pini / Çizgisi -->
        <div style="position:absolute;left:${avgPct.toFixed(1)}%;top:0;bottom:0;width:2px;background:#F59E0B;box-shadow:0 0 4px #F59E0B;" title="Ortalama: ${data.formattedAvg || avg.toFixed(1)}"></div>
      </div>

      <!-- Alt Şerit (D2 Sayaç Rozetleri) -->
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--text-secondary);padding-top:2px;font-family:var(--font-mono);">
        <span><strong style="color:var(--text-muted);">▼ Min:</strong> ${data.formattedMin || min.toFixed(1)}</span>
        <span style="color:var(--accent-amber);"><strong style="color:var(--text-muted);">◆ Ort:</strong> ${data.formattedAvg || avg.toFixed(1)}</span>
        <span><strong style="color:var(--text-muted);">▲ Maks:</strong> ${data.formattedMax || max.toFixed(1)}</span>
      </div>
    </div>
  `;
}
