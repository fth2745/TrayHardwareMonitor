/* ==========================================================================
   KART İSKELETLERİ (S-bento, S-minimal, S-hero, S-row)
   - Kart içi 350 elemanlı hantal <select> KALDIRILDI!
   - Hızlı "🎯 Sensör ▾" modal tetikleyici butonu getirildi.
   - Yalnızca 16 seçkin grafik motoru seçilebilir.
   - Kart gövdesi tıklamaları tuşları yutmaz (Popover yalnızca ⤢ butonuna bağlı).
   ========================================================================== */

import { CHART_POOL, getChartMeta, getNeedsLabel, normalizeChartCode } from '../charts/registry.js';
import { renderH2TabsHtml, renderH6PillsHtml } from './h-helpers.js';

export function splitNumberAndUnit(formatted) {
  if (!formatted) return { num: '-', unit: '' };
  const s = String(formatted).trim();
  const idx = s.lastIndexOf(' ');
  if (idx === -1) return { num: s, unit: '' };
  return { num: s.slice(0, idx), unit: s.slice(idx + 1) };
}

export function computeAccessibleDelta(data) {
  const hist = data.history || [];
  const val = Number.isFinite(data.value) ? data.value : 0;
  if ((data.type === 'Sıcaklık' && val >= 85) || (data.unit === '%' && val >= 92)) {
    return { text: '⚠ Kritik', cls: 'crit' };
  }
  if (hist.length < 2) return { text: '▲ Normal', cls: 'up' };
  const prev = hist[Math.max(0, hist.length - 5)] || hist[0] || 1;
  const cur = hist[hist.length - 1] ?? val;
  const diff = cur - prev;
  const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : 0;
  const sign = pct >= 0 ? '+' : '';
  const icon = Math.abs(pct) < 0.5 ? '◆' : pct > 0 ? '▲' : '▼';
  return {
    text: `${icon} ${sign}${pct.toFixed(1)}%`,
    cls: pct > 6 ? 'warn' : pct >= 0 ? 'up' : 'down'
  };
}

function buildChartSelectHtml(activeCode) {
  const normCode = normalizeChartCode(activeCode);
  return CHART_POOL.map(c =>
    `<option value="${c.code}" ${c.code === normCode ? 'selected' : ''}>${c.code}</option>`
  ).join('');
}

export const FEATURE_FLAGS = {
  allowInlineChartSelect: false,
  allowSpanCycle: false,
  allowSensorPick: false,
  allowCardDelete: false,
  allowCatalog: false
};

function buildSensorTriggerHtml(data, isLiveMode) {
  const title = data.name || 'Özet Tablosu';
  if (!isLiveMode || !FEATURE_FLAGS.allowSensorPick) {
    return `<span class="card-fixed-title js-sensor-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</span>`;
  }
  return `
    <button class="card-sensor-btn js-pick-sensor-btn" type="button" title="Sensörü Değiştir (Tıkla)">
      <span>🎯</span>
      <span class="js-sensor-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</span>
      <span style="opacity:0.6;font-size:9px;">▾</span>
    </button>
  `;
}

export function renderCardSkeletonHtml(el, data, { isLiveMode = true }) {
  const skeleton = data.skeleton || 'S-bento';
  const chartCode = normalizeChartCode(data.chartCode);
  el.className = `uiv2-card ${skeleton} ${data.span || 'span-6'}`;
  el.dataset.skeleton = skeleton;
  el.dataset.span = data.span || 'span-6';
  el.dataset.chartCode = chartCode;
  el.dataset.m1Variant = data.m1Variant || '';
  el.dataset.sensorId = data.sensorId || '';

  const { num, unit } = splitNumberAndUnit(data.formattedValue);
  const delta = computeAccessibleDelta(data);
  const sensorTriggerHtml = buildSensorTriggerHtml(data, isLiveMode);

  const isFans = data.cardType === 'fans' || (data.name && data.name.includes('Fan'));
  const isM1 = chartCode === 'M1';
  const m1Variant = data.m1Variant || 'hybrid';
  const hideBigValue = isM1 && (isFans || m1Variant === 'tiles' || m1Variant === 'gauge');
  const showMinMaxPills = !hideBigValue && m1Variant !== 'minimal';

  const chartSelectHtml = FEATURE_FLAGS.allowInlineChartSelect
    ? `<select class="js-inline-chart-select ctrl-select" style="padding:2px 5px;font-size:10px;border-radius:6px;" title="Grafik Motoru">${buildChartSelectHtml(chartCode)}</select>`
    : '';

  const cycleSpanBtnHtml = FEATURE_FLAGS.allowSpanCycle
    ? `<button class="icon-btn-ghost js-cycle-span" type="button" title="Genişlik">⇔</button>`
    : '';

  const removeBtnHtml = (isLiveMode && FEATURE_FLAGS.allowCardDelete)
    ? `<button class="icon-btn-danger js-remove-card" type="button" title="Kartı Kaldır">×</button>`
    : '';

  if (skeleton === 'S-minimal') {
    // S-minimal: Simetrik Ortalanmış Minimal İskelet
    el.innerHTML = `
      <div class="s-minimal-header">
        <div class="card-corner-actions">
          ${chartSelectHtml}
          ${cycleSpanBtnHtml}
          <button class="icon-btn-blue js-open-popover" type="button" title="Detay">⤢</button>
          ${removeBtnHtml}
        </div>
        ${hideBigValue ? '' : `<div class="s-minimal-value"><span class="js-val-num">${num}</span><span class="unit-suffix js-val-unit">${unit}</span></div>`}
        <div class="s-minimal-subtitle">
          ${sensorTriggerHtml}
        </div>
      </div>
      ${data.hasH2Tabs ? renderH2TabsHtml(data) : ''}
      <div class="card-viz-area js-viz-container"></div>
    `;
  } else if (skeleton === 'S-hero') {
    // S-hero: Vurgu Zeminli Kahraman Kart
    el.innerHTML = `
      <div class="hero-main">
        <div class="hero-top-bar">
          <div class="hero-title">
            ${sensorTriggerHtml}
          </div>
          <div class="card-action-btns">
            ${cycleSpanBtnHtml}
            <button class="icon-btn-ghost js-open-popover" type="button" style="color:var(--text-on-hero);" title="Detay">⤢</button>
            ${removeBtnHtml}
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex:1;">
          <div>
            <div class="hero-big-val"><span class="js-val-num">${num}</span><span class="unit-suffix js-val-unit" style="color:var(--text-on-hero-muted);">${unit}</span></div>
            <div style="font-size:11.5px;color:var(--text-on-hero-muted);margin-top:4px;">${data.hardware || ''}</div>
          </div>
          <div class="card-viz-area js-viz-container" style="flex:1;min-height:96px;"></div>
        </div>
      </div>
      <div class="hero-bottom-band tabular-nums">
        <span>Ort: <strong class="js-avg-text">${data.formattedAvg || '-'}</strong> · Maks: <strong class="js-max-text">${data.formattedMax || '-'}</strong></span>
        ${chartSelectHtml}
      </div>
    `;
  } else if (skeleton === 'S-row') {
    // S-row: Yatay Tek Satırlık Kompakt İskelet
    const icon = data.type === 'Sıcaklık' ? '🌡️' : data.type === 'Fan' ? '🌀' : data.type === 'Güç' ? '⚡' : '💠';
    el.innerHTML = `
      <div class="s-row-grid">
        <div class="s-row-icon">${icon}</div>
        <div style="min-width:0;">
          <div style="display:flex;align-items:center;gap:5px;">
            ${sensorTriggerHtml}
          </div>
          <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${data.hardware || 'Donanım'} · Ort: <span class="js-avg-text">${data.formattedAvg || '-'}</span>
          </div>
        </div>
        <div class="card-viz-area js-viz-container"></div>
        <div class="s-row-value">
          <div><span class="js-val-num">${num}</span> <span class="js-val-unit" style="font-size:11px;color:var(--text-secondary);">${unit}</span></div>
          <span class="delta-chip ${delta.cls} js-delta-chip" style="font-size:9.5px;padding:1px 6px;">${delta.text}</span>
        </div>
        <div class="card-action-btns">
          ${chartSelectHtml}
          <button class="icon-btn-blue js-open-popover" type="button" title="Detay">⤢</button>
          ${removeBtnHtml}
        </div>
      </div>
    `;
  } else {
    // S-bento (Varsayılan Standart Bento Kartı)
    el.innerHTML = `
      <div>
        <div class="s-bento-top">
          <div class="s-bento-title" title="${data.hardware || ''} — ${data.name || ''}">
            ${sensorTriggerHtml}
          </div>
          <div class="card-action-btns">
            ${chartSelectHtml}
            ${cycleSpanBtnHtml}
            <button class="icon-btn-blue js-open-popover" type="button" title="Detay">⤢</button>
            ${removeBtnHtml}
          </div>
        </div>
        ${data.hasH6Pills ? renderH6PillsHtml(data) : ''}
        ${hideBigValue ? '' : `
          <div class="s-bento-metric-row">
            <div class="s-bento-metric-left">
              <div class="s-bento-big-number"><span class="js-val-num">${num}</span><span class="unit-suffix js-val-unit">${unit}</span></div>
              <span class="delta-chip ${delta.cls} js-delta-chip">${delta.text}</span>
            </div>
            ${showMinMaxPills ? `
              <div class="s-bento-minmax-group tabular-nums">
                <div class="minmax-pill" title="Minimum Değer"><span class="minmax-lbl">MİN</span><strong class="js-min-text">${data.formattedMin || '-'}</strong></div>
                <div class="minmax-pill" title="Ortalama Değer"><span class="minmax-lbl">ORT</span><strong class="js-avg-text">${data.formattedAvg || '-'}</strong></div>
                <div class="minmax-pill" title="Maksimum Değer"><span class="minmax-lbl">MAKS</span><strong class="js-max-text">${data.formattedMax || '-'}</strong></div>
              </div>
            ` : ''}
          </div>
        `}
      </div>
      <div class="card-viz-area js-viz-container"></div>
    `;
  }
}
