/* ==========================================================================
   G. LİSTE GRAFİĞİ (G1)
   G2, G3, G4 kaldırıldı. Yalnızca G1 (Sıralı Değişim Listesi) kaldı.
   ========================================================================== */

function getMultiSensorList(data, limit = 4) {
  if (Array.isArray(data.multiSensors) && data.multiSensors.length >= 2) {
    return data.multiSensors.slice(0, limit).map(s => ({
      name: s.name,
      hardware: s.hardware,
      badge: s.type || 'Sensör',
      formattedValue: s.formattedValue || '-',
      formattedAvg: s.formattedAvg || '-'
    }));
  }
  if (Array.isArray(data.peers) && data.peers.length >= 2) {
    return data.peers.slice(0, limit).map(p => ({
      name: p.name,
      hardware: p.hardware,
      badge: p.type || 'Sensör',
      formattedValue: p.formattedValue || '-',
      formattedAvg: p.formattedAvg || '-'
    }));
  }
  return [
    { name: data.name || 'Odak Sensör', hardware: data.hardware, badge: data.type || 'Anlık', formattedValue: data.formattedValue || '-', formattedAvg: data.formattedAvg || '-' },
    { name: 'Kümülatif Ortalama', hardware: data.hardware, badge: 'Ort', formattedValue: data.formattedAvg || '-', formattedAvg: data.formattedAvg || '-' },
    { name: 'Tepe Noktası (Maks)', hardware: data.hardware, badge: 'Maks', formattedValue: data.formattedMax || '-', formattedAvg: data.formattedAvg || '-' },
    { name: 'Taban Seviye (Min)', hardware: data.hardware, badge: 'Min', formattedValue: data.formattedMin || '-', formattedAvg: data.formattedAvg || '-' }
  ].slice(0, limit);
}

/**
 * G1 — Sıralı Değişim Listesi + Rozet + Delta (needs: 'multi')
 */
export function renderG1(container, data) {
  const list = getMultiSensorList(data, 4);

  container.innerHTML = `
    <div class="g1-ranked-list tabular-nums">
      ${list.map((p, idx) => `
        <div class="g1-rank-row">
          <div class="g1-rank-left">
            <span class="g1-rank-num">${idx + 1}</span>
            <span class="g1-rank-name" title="${p.name}">${p.name}</span>
            <span class="g1-rank-badge">${p.badge}</span>
          </div>
          <span class="delta-chip ${idx === 0 ? 'up' : idx === 2 ? 'warn' : 'down'}" style="font-family:var(--font-mono);">
            ${idx === 0 ? '▲' : idx === 2 ? '◆' : '▼'} ${p.formattedValue}
          </span>
        </div>
      `).join('')}
    </div>
  `;
}
