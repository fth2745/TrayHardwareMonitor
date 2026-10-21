/* ==========================================================================
   C. BAR HELPER MODÜLÜ
   ========================================================================== */

export function buildMultiOrPeerRows(data, count = 4) {
  const sourceList = (Array.isArray(data.multiSensors) && data.multiSensors.length >= 2)
    ? data.multiSensors
    : (Array.isArray(data.peers) && data.peers.length >= 2 ? data.peers : null);

  if (sourceList) {
    const maxVal = Math.max(...sourceList.map(s => Number.isFinite(s.value) ? s.value : 50), 100);
    return sourceList.slice(0, count).map((p, idx) => ({
      label: p.name,
      sub: p.hardware,
      formatted: p.formattedValue || '-',
      pct: Math.max(15, Math.min(96, ((p.value || 50) / maxVal) * 100)),
      focus: p.id === data.sensorId || idx === 0
    }));
  }

  return [
    { label: data.name || 'Odak Kanal', sub: 'Anlık', formatted: data.formattedValue || '68.4', pct: 76, focus: true },
    { label: 'Ortalama İz', sub: 'Kümülatif', formatted: data.formattedAvg || '54.2', pct: 58, focus: false },
    { label: 'Tepe Noktası (Maks)', sub: 'Maksimum', formatted: data.formattedMax || '84.0', pct: 88, focus: false },
    { label: 'Taban Seviye (Min)', sub: 'Minimum', formatted: data.formattedMin || '36.0', pct: 38, focus: false }
  ].slice(0, count);
}

