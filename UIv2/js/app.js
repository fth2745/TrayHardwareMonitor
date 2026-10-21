/* ==========================================================================
   UI v2 — Ana Uygulama Denetleyicisi (16 Seçkin Grafik Havuzu)
   - Tuş ve Sensör Seçimi Çakışmaları Kökten Çözüldü
   - ResizeObserver Döngü Koruması (lastWidth kontrolü)
   - 1sn Telemetri Döngüsünde Kesintisiz Buton ve Etkileşim Güvencesi
   - Kart Üzerinden Tek Tıkla Sensör Değiştirme, Grafik Seçme, Boyut Değiştirme ve Silme
   ========================================================================== */

import { CHART_POOL, getChartRenderer, getChartMeta, getNeedsLabel, normalizeChartCode } from './charts/registry.js';
import { CATALOG_CARDS } from './catalog-data.js';
import { SKELETON_POOL, UI_HELPER_POOL, createUiHelperShowcaseElement } from './ui/h-helpers.js';
import { renderCardSkeletonHtml, splitNumberAndUnit, computeAccessibleDelta } from './ui/skeletons.js';
import { initPopover, openPopover, updateOpenPopoverIfActive } from './popover.js';
import { loadLocalConfig, fetchServerConfig, saveConfig } from './services/config-store.js';
import { updateDerivedTelemetry, getDerivedTelemetry } from './services/derived-tracker.js';

const THEME_MIGRATION = {
  'bento-dark': 'T-bento',
  'neon-sunken': 'T-neon',
  'minimal-g1': 'T-minimal',
  'light-clean': 'T-light',
  'navy-purple': 'T-violet'
};

const SKEL_MIGRATION = {
  'skel-g2': 'S-bento',
  'skel-g1': 'S-minimal',
  'skel-hero': 'S-hero'
};

const state = {
  mode: 'live',              // 'live' | 'catalog'
  theme: 'T-bento',          // 'T-bento' | 'T-neon' | 'T-minimal' | 'T-light' | 'T-violet'
  layout: 'bento',           // 'bento' | 'g1-stage'
  windowSec: 60,             // 60 | 300 | 900
  catalogGroup: 'ALL',       // 'ALL' | 'REF-1' | 'REF-2' | 'REF-3' | 'REF-4' | 'EXTRA' | 'UI-HELPERS'
  drawerTab: 'active-cards', // 'active-cards' | 'add-sensor'
  targetCardForSensorPick: null, // Sensör ataması yapılan kart id'si
  widgets: [],               // [{ id, sensorId, secondarySensorIds, chartCode, skeleton, span }]
  sensorMap: new Map(),      // sensorId -> son okunan DTO
  historyMap: new Map()      // sensorId -> number[]
};

const cardDomMap = new Map();

// ResizeObserver Döngü Korumalı: Yalnızca yatay genişlik farkı >= 4px olduğunda yeniden çizer
const cardResizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const cardEl = entry.target.closest('.uiv2-card');
    if (!cardEl) continue;
    const cardId = cardEl.dataset.cardId;
    if (!cardId) continue;

    const currentW = Math.round(entry.contentRect.width || cardEl.clientWidth || 0);
    const lastW = Number(cardEl.dataset.lastRenderWidth || 0);
    if (Math.abs(currentW - lastW) < 4) continue;
    cardEl.dataset.lastRenderWidth = currentW;

    const cards = getActiveCardsData();
    const cardData = cards.find(c => c.id === cardId);
    if (!cardData) continue;
    const vizBox = cardEl.querySelector('.js-viz-container');
    if (vizBox) {
      const renderFn = getChartRenderer(cardData.chartCode);
      renderFn(vizBox, cardData);
    }
  }
});

function normalizeSavedConfig(cfg) {
  if (!cfg) return;
  if (cfg.theme) {
    state.theme = THEME_MIGRATION[cfg.theme] || cfg.theme;
  }
  if (cfg.layout) state.layout = cfg.layout;
  if (cfg.windowSec) state.windowSec = Number(cfg.windowSec) || 60;
  if (Array.isArray(cfg.widgets)) {
    state.widgets = cfg.widgets.map(w => ({
      ...w,
      chartCode: normalizeChartCode(w.chartCode),
      m1Variant: w.m1Variant || 'hybrid',
      skeleton: SKEL_MIGRATION[w.skeleton] || w.skeleton || 'S-bento',
      secondarySensorIds: Array.isArray(w.secondarySensorIds) ? w.secondarySensorIds : []
    }));
  }
}

function persistState() {
  saveConfig({
    theme: state.theme,
    layout: state.layout,
    windowSec: state.windowSec,
    widgets: state.widgets
  });
  updateDynamicBadges();
}

function updateDynamicBadges() {
  const btnLive = document.getElementById('btnTabLive');
  const btnCat = document.getElementById('btnTabCatalog');
  const btnDrawerActive = document.getElementById('btnDrawerActiveTab');

  if (btnLive) {
    btnLive.textContent = `Canlı Panel (${state.widgets.length} Kart)`;
  }
  if (btnCat) {
    btnCat.textContent = `Katalog (${CHART_POOL.length} Grafik + ${UI_HELPER_POOL.length} Bileşen)`;
  }
  if (btnDrawerActive) {
    btnDrawerActive.textContent = `Aktif Kartlarım (${state.widgets.length})`;
  }
}

function parseUnit(formatted) {
  if (!formatted) return '';
  const parts = String(formatted).trim().split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function buildLiveMatrixRows(s, allSensors) {
  const isCpu = (s.name && s.name.includes('CPU')) ||
                (s.hardware && (s.hardware.includes('Ryzen') || s.hardware.includes('CPU') || s.hardware.includes('Intel')));

  if (isCpu) {
    const tempSens = s.type === 'Sıcaklık' ? s : allSensors.find(x => x.hardware === s.hardware && x.type === 'Sıcaklık');
    const tVal = tempSens?.value ?? 48;

    const clockSens = allSensors.find(x => (x.hardware.includes('Ryzen') || x.hardware === s.hardware) && (x.type === 'Saat' || x.type === 'Frekans') && (x.name.includes('Core #1') || x.name.includes('Average') || x.name.includes('Max')))
      || allSensors.find(x => (x.hardware.includes('Ryzen') || x.hardware === s.hardware) && (x.type === 'Saat' || x.type === 'Frekans'));
    const cMhz = clockSens?.value ?? 4850;
    const cGhz = (cMhz / 1000).toFixed(2);

    const voltSens = allSensors.find(x => (x.type === 'Voltaj' || x.type === 'Voltage') && (x.name === 'Vcore' || x.name.includes('VID') || x.name.includes('Core')));
    const vVal = voltSens?.value ?? 1.38;

    const dimm1Sens = allSensors.find(x => (x.hardware.includes('AX5U6000') || x.hardware.includes('DIMM') || x.name.includes('DIMM #1')) && x.type === 'Sıcaklık' && (x.name === 'DIMM #1' || !x.name.includes('Limit')));
    const d1Val = dimm1Sens?.value ?? 28.2;

    const dimm2Sens = allSensors.find(x => (x.hardware.includes('AX5U6000') || x.hardware.includes('DIMM') || x.name.includes('DIMM #3') || x.name.includes('DIMM #2')) && x.type === 'Sıcaklık' && (x.name === 'DIMM #3' || x.name === 'DIMM #2') && x.id !== dimm1Sens?.id);
    const d2Val = dimm2Sens?.value ?? 32.5;

    return [
      {
        icon: '🌡️',
        label: 'İşlemci Sıcaklığı',
        value: tVal,
        formattedValue: `${tVal.toFixed(1)} °C`,
        pct: Math.min(100, Math.max(10, ((tVal - 25) / 65) * 100)),
        color: tVal > 80 ? 'var(--accent-red)' : tVal > 68 ? 'var(--accent-amber)' : 'linear-gradient(90deg, #3B82F6, #6366F1)',
        valColor: tVal > 80 ? 'var(--accent-red)' : 'var(--text-primary)',
        avgFormatted: tempSens?.formattedAvg || '-',
        maxFormatted: tempSens?.formattedMax || '-'
      },
      {
        icon: '⚡',
        label: 'İşlemci Hızı (GHz)',
        value: cMhz,
        formattedValue: `${cGhz} GHz`,
        pct: Math.min(100, Math.max(15, (cMhz / 5700) * 100)),
        color: 'linear-gradient(90deg, #8B5CF6, #A855F7)',
        badge: cMhz > 5000 ? 'Boost' : '',
        badgeCls: 'up',
        avgFormatted: clockSens?.formattedAvg || '-',
        maxFormatted: clockSens?.formattedMax || '-'
      },
      {
        icon: '🔋',
        label: 'Çekirdek Voltajı',
        value: vVal,
        formattedValue: `${vVal.toFixed(3)} V`,
        pct: Math.min(100, Math.max(15, (vVal / 1.5) * 100)),
        color: 'linear-gradient(90deg, #06B6D4, #3B82F6)',
        avgFormatted: voltSens?.formattedAvg || '-',
        maxFormatted: voltSens?.formattedMax || '-'
      },
      {
        icon: '🧠',
        label: 'DIMM 1 Sıcaklığı',
        value: d1Val,
        formattedValue: `${d1Val.toFixed(1)} °C`,
        pct: Math.min(100, Math.max(10, ((d1Val - 20) / 45) * 100)),
        color: d1Val > 55 ? 'var(--accent-red)' : 'linear-gradient(90deg, #10B981, #06B6D4)',
        avgFormatted: dimm1Sens?.formattedAvg || '-',
        maxFormatted: dimm1Sens?.formattedMax || '-'
      },
      {
        icon: '🧠',
        label: 'DIMM 2 Sıcaklığı',
        value: d2Val,
        formattedValue: `${d2Val.toFixed(1)} °C`,
        pct: Math.min(100, Math.max(10, ((d2Val - 20) / 45) * 100)),
        color: d2Val > 55 ? 'var(--accent-red)' : 'linear-gradient(90deg, #10B981, #06B6D4)',
        avgFormatted: dimm2Sens?.formattedAvg || '-',
        maxFormatted: dimm2Sens?.formattedMax || '-'
      }
    ];
  }

  // GPU
  const gpuTempSens = s.type === 'Sıcaklık' ? s : allSensors.find(x => (x.hardware.includes('GeForce') || x.hardware.includes('NVIDIA') || x.hardware.includes('GPU')) && x.type === 'Sıcaklık' && x.name.includes('Core'));
  const gtVal = gpuTempSens?.value ?? 34;

  const gpuLoadSens = allSensors.find(x => (x.hardware.includes('GeForce') || x.hardware.includes('NVIDIA') || x.hardware.includes('GPU')) && x.type === 'Yük' && x.name.includes('Core'));
  const glVal = gpuLoadSens?.value ?? 12;

  const gpuPowerSens = allSensors.find(x => (x.hardware.includes('GeForce') || x.hardware.includes('NVIDIA') || x.hardware.includes('GPU')) && x.type === 'Güç');
  const gpVal = gpuPowerSens?.value ?? 45;

  const gpuClockSens = allSensors.find(x => (x.hardware.includes('GeForce') || x.hardware.includes('NVIDIA') || x.hardware.includes('GPU')) && (x.type === 'Saat' || x.type === 'Frekans') && x.name.includes('Core'));
  const gcVal = gpuClockSens?.value ?? 1125;

  const gpuVoltSens = allSensors.find(x => (x.hardware.includes('GeForce') || x.hardware.includes('NVIDIA') || x.hardware.includes('GPU')) && (x.type === 'Voltaj' || x.type === 'Voltage'));
  const gvVal = gpuVoltSens?.value ?? 0.88;

  return [
    {
      icon: '🌡️',
      label: 'GPU Sıcaklığı',
      value: gtVal,
      formattedValue: `${gtVal.toFixed(1)} °C`,
      pct: Math.min(100, Math.max(10, ((gtVal - 25) / 65) * 100)),
      color: gtVal > 78 ? 'var(--accent-red)' : gtVal > 65 ? 'var(--accent-amber)' : 'linear-gradient(90deg, #10B981, #06B6D4)',
      valColor: gtVal > 78 ? 'var(--accent-red)' : 'var(--text-primary)',
      avgFormatted: gpuTempSens?.formattedAvg || '-',
      maxFormatted: gpuTempSens?.formattedMax || '-'
    },
    {
      icon: '📊',
      label: 'GPU Kullanımı (Yük)',
      value: glVal,
      formattedValue: `%${glVal.toFixed(1)}`,
      pct: Math.min(100, Math.max(4, glVal)),
      color: 'linear-gradient(90deg, #3B82F6, #6366F1)',
      avgFormatted: gpuLoadSens?.formattedAvg || '-',
      maxFormatted: gpuLoadSens?.formattedMax || '-'
    },
    {
      icon: '⚡',
      label: 'Güç Tüketimi (Watt)',
      value: gpVal,
      formattedValue: `${gpVal.toFixed(1)} W`,
      pct: Math.min(100, Math.max(5, (gpVal / 380) * 100)),
      color: 'linear-gradient(90deg, #F59E0B, #EF4444)',
      avgFormatted: gpuPowerSens?.formattedAvg || '-',
      maxFormatted: gpuPowerSens?.formattedMax || '-'
    },
    {
      icon: '⏱️',
      label: 'Çekirdek Frekansı',
      value: gcVal,
      formattedValue: `${Math.round(gcVal)} MHz`,
      pct: Math.min(100, Math.max(10, (gcVal / 3000) * 100)),
      color: 'linear-gradient(90deg, #8B5CF6, #EC4899)',
      avgFormatted: gpuClockSens?.formattedAvg || '-',
      maxFormatted: gpuClockSens?.formattedMax || '-'
    },
    {
      icon: '🔋',
      label: 'GPU Voltajı',
      value: gvVal,
      formattedValue: `${gvVal.toFixed(3)} V`,
      pct: Math.min(100, Math.max(10, (gvVal / 1.15) * 100)),
      color: 'linear-gradient(90deg, #06B6D4, #3B82F6)',
      avgFormatted: gpuVoltSens?.formattedAvg || '-',
      maxFormatted: gpuVoltSens?.formattedMax || '-'
    }
  ];
}

function buildDefaultWidgetsFromSensors(sensors) {
  if (!sensors || !sensors.length) return [];

  // 1. CPU Ana Sıcaklık Sensörü
  const cpuTemp = sensors.find(s => (s.hardware.includes('Ryzen') || s.hardware.includes('CPU')) && s.type === 'Sıcaklık' && s.name.includes('Core'))
               || sensors.find(s => (s.hardware.includes('Ryzen') || s.hardware.includes('CPU')) && s.type === 'Sıcaklık')
               || sensors.find(s => s.type === 'Sıcaklık');

  // 2. GPU Ana Sıcaklık Sensörü
  const gpuTemp = sensors.find(s => (s.hardware.includes('GeForce') || s.hardware.includes('RTX') || s.hardware.includes('NVIDIA') || s.hardware.includes('GPU')) && s.type === 'Sıcaklık' && s.name.includes('Core'))
               || sensors.find(s => (s.hardware.includes('GeForce') || s.hardware.includes('RTX') || s.hardware.includes('NVIDIA') || s.hardware.includes('GPU')) && s.type === 'Sıcaklık')
               || sensors.find(s => s.id !== cpuTemp?.id && s.type === 'Sıcaklık');

  const widgets = [];
  if (cpuTemp) {
    widgets.push({
      id: 'w_cpu_summary',
      sensorId: cpuTemp.id,
      chartCode: 'M1',
      skeleton: 'S-bento',
      span: 'span-6',
      customTitle: `${cpuTemp.hardware} Özeti`
    });
  }
  if (gpuTemp) {
    widgets.push({
      id: 'w_gpu_summary',
      sensorId: gpuTemp.id,
      chartCode: 'M1',
      skeleton: 'S-bento',
      span: 'span-6',
      customTitle: `${gpuTemp.hardware} Özeti`
    });
  }

  return widgets;
}

function buildCardDataForWidget(w) {
  const s = state.sensorMap.get(w.sensorId) || Array.from(state.sensorMap.values())[0];
  const chartCode = normalizeChartCode(w.chartCode);

  if (!s) {
    const fallback = CATALOG_CARDS[0];
    return { ...fallback, id: w.id, chartCode, skeleton: w.skeleton, span: w.span };
  }

  const hist = state.historyMap.get(s.id) || [s.value || 0, s.value || 0];
  const peers = Array.from(state.sensorMap.values())
    .filter(p => p.hardware === s.hardware && p.type === s.type)
    .slice(0, 5);

  let multiSensors = [];
  if (Array.isArray(w.secondarySensorIds) && w.secondarySensorIds.length > 0) {
    multiSensors = [s, ...w.secondarySensorIds.map(id => state.sensorMap.get(id)).filter(Boolean)].map(item => ({
      ...item,
      history: state.historyMap.get(item.id) || [item.value || 0]
    }));
  } else if (peers.length >= 2) {
    multiSensors = peers.map(item => ({
      ...item,
      history: state.historyMap.get(item.id) || [item.value || 0]
    }));
  }

  const derived = getDerivedTelemetry(s.id, s);
  const allSensors = Array.from(state.sensorMap.values());
  const matrixRows = chartCode === 'M1' ? buildLiveMatrixRows(s, allSensors) : null;
  const cardTitle = chartCode === 'M1'
    ? (w.customTitle || `${s.hardware} Özeti`)
    : (w.customTitle && !w.customTitle.endsWith('Özeti') ? w.customTitle : s.name);

  return {
    id: w.id,
    sensorId: s.id,
    secondarySensorIds: w.secondarySensorIds || [],
    chartCode,
    m1Variant: w.m1Variant || 'hybrid',
    skeleton: w.skeleton || 'S-bento',
    span: w.span || (chartCode === 'M1' ? 'span-6' : 'span-4'),
    name: cardTitle,
    hardware: s.hardware,
    type: s.type,
    value: s.value,
    formattedValue: s.formattedValue,
    min: s.min,
    formattedMin: s.formattedMin,
    max: s.max,
    formattedMax: s.formattedMax,
    avg: s.avg,
    formattedAvg: s.formattedAvg,
    unit: parseUnit(s.formattedValue),
    history: hist,
    peers,
    multiSensors,
    matrixRows,
    derived
  };
}

function bindCardEvents(el, data) {
  const allSensors = Array.from(state.sensorMap.values());
  const isLiveMode = state.mode === 'live';

  // 1. 🎯 Sensör Değiştirme Butonu (Doğrudan Sensör Seçici Penceresini Açar)
  const pickSensorBtn = el.querySelector('.js-pick-sensor-btn');
  pickSensorBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    openSensorPickerForCard(data.id);
  });

  // 2. 📊 Grafik Tipi Seçimi
  const chartSel = el.querySelector('.js-inline-chart-select');
  chartSel?.addEventListener('click', e => e.stopPropagation());
  chartSel?.addEventListener('change', (e) => {
    e.stopPropagation();
    changeCardChart(data.id, e.target.value);
  });

  // 3. ⇔ Kart Genişliği Değiştirme
  const spanBtn = el.querySelector('.js-cycle-span');
  spanBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    cycleCardSpan(data.id);
  });

  // 4. ⤢ Popover Detay Penceresi (Sadece bu butona basınca açılır!)
  const popBtn = el.querySelector('.js-open-popover');
  popBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    openPopover(data, allSensors, isLiveMode);
  });

  // 5. × Kartı Kaldır (Sil)
  const removeBtn = el.querySelector('.js-remove-card');
  removeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    removeCard(data.id);
  });
}

function createCardElement(data) {
  const el = document.createElement('article');
  el.dataset.cardId = data.id;
  rebuildCardDom(el, data);
  return el;
}

function applyCardCriticalAlert(el, data) {
  if (!el || !data) return;
  let isCritical = false;

  // 1. Tekli sensör sıcaklık kontrolü (>= 85°C)
  if (
    (data.type === 'Temperature' || data.type === 'Sıcaklık' || (data.unit && data.unit.includes('°C'))) &&
    Number.isFinite(data.value) &&
    data.value >= 85
  ) {
    isCritical = true;
  }

  // 2. M1 Özet Matrisi için (CPU veya GPU sıcaklığı >= 85°C)
  if (data.chartCode === 'M1' && Array.isArray(data.matrixRows)) {
    const tempRow = data.matrixRows.find(r => 
      (r.label && r.label.includes('Sıcaklık')) || r.icon === '🌡️'
    );
    if (tempRow && Number.isFinite(tempRow.value) && tempRow.value >= 85) {
      isCritical = true;
    }
  }

  el.classList.toggle('is-critical-alert', isCritical);
}

function rebuildCardDom(el, data) {
  const isLiveMode = state.mode === 'live';
  el.dataset.m1Variant = data.m1Variant || '';

  renderCardSkeletonHtml(el, data, { isLiveMode });
  bindCardEvents(el, data);
  applyCardCriticalAlert(el, data);

  const vizBox = el.querySelector('.js-viz-container');
  if (vizBox) {
    cardResizeObserver.observe(vizBox);
    const renderFn = getChartRenderer(data.chartCode);
    renderFn(vizBox, data);
  }
}

function updateCardElementInPlace(el, data) {
  const allSensors = Array.from(state.sensorMap.values());
  const isLiveMode = state.mode === 'live';
  const chartCode = normalizeChartCode(data.chartCode);

  if (
    el.dataset.skeleton !== data.skeleton ||
    el.dataset.span !== data.span ||
    el.dataset.chartCode !== chartCode ||
    el.dataset.m1Variant !== (data.m1Variant || '') ||
    el.dataset.sensorId !== (data.sensorId || '')
  ) {
    rebuildCardDom(el, data);
    return;
  }

  applyCardCriticalAlert(el, data);

  const { num, unit } = splitNumberAndUnit(data.formattedValue);
  const delta = computeAccessibleDelta(data);

  const numEl = el.querySelector('.js-val-num');
  if (numEl) numEl.textContent = num;

  const unitEl = el.querySelector('.js-val-unit');
  if (unitEl) unitEl.textContent = unit;

  const avgEl = el.querySelector('.js-avg-text');
  if (avgEl) avgEl.textContent = data.formattedAvg || '-';

  const maxEl = el.querySelector('.js-max-text');
  if (maxEl) maxEl.textContent = data.formattedMax || '-';

  const deltaEl = el.querySelector('.js-delta-chip');
  if (deltaEl) {
    deltaEl.className = `delta-chip ${delta.cls} js-delta-chip`;
    deltaEl.textContent = delta.text;
  }

  const sensorNameEl = el.querySelector('.js-sensor-name');
  if (sensorNameEl && data.name) {
    sensorNameEl.textContent = data.name;
  }

  const vizBox = el.querySelector('.js-viz-container');
  if (vizBox) {
    const renderFn = getChartRenderer(chartCode);
    renderFn(vizBox, data);
  }
}

function getActiveCardsData() {
  if (state.mode === 'catalog') {
    if (state.catalogGroup === 'UI-HELPERS') return [];
    return CATALOG_CARDS
      .filter(c => state.catalogGroup === 'ALL' || c.refSource === state.catalogGroup)
      .map(c => ({
        ...c,
        chartCode: normalizeChartCode(c.chartCode),
        derived: getDerivedTelemetry(c.id, c)
      }));
  }
  return state.widgets.map(w => buildCardDataForWidget(w));
}

function renderDashboard() {
  const grid = document.getElementById('dashboardGrid');
  if (!grid) return;

  grid.classList.toggle('layout-g1-stage', state.layout === 'g1-stage');
  updateDynamicBadges();

  if (state.mode === 'live' && state.widgets.length === 0) {
    cardDomMap.clear();
    grid.innerHTML = `
      <div class="uiv2-card S-bento span-12" style="align-items:center;justify-content:center;text-align:center;gap:12px;min-height:220px;">
        <div style="font-size:16px;font-weight:600;">Panelde Henüz Kart Yok</div>
        <div style="font-size:12.5px;color:var(--text-secondary);max-width:460px;">
          İstediğiniz sensörü seçip istediğiniz grafiği atamak için aşağıdaki butona tıklayın veya varsayılan kartları yükleyin.
        </div>
        <div style="display:flex;gap:10px;margin-top:6px;">
          <button id="btnEmptyAddSensor" class="ctrl-btn primary" type="button">＋ Sensör Seç ve Kart Ekle</button>
          <button id="btnEmptyRestoreDefaults" class="ctrl-btn" type="button">Varsayılan Kartları Yükle</button>
        </div>
      </div>
    `;
    grid.querySelector('#btnEmptyAddSensor')?.addEventListener('click', () => {
      openDrawerWithTab('add-sensor');
    });
    grid.querySelector('#btnEmptyRestoreDefaults')?.addEventListener('click', () => {
      state.widgets = buildDefaultWidgetsFromSensors(Array.from(state.sensorMap.values()));
      persistState();
      grid.innerHTML = '';
      renderDashboard();
    });
    return;
  }

  const cards = getActiveCardsData();
  const activeIds = new Set(cards.map(c => c.id));
  const allSensors = Array.from(state.sensorMap.values());
  const isLiveMode = state.mode === 'live';

  if (state.mode === 'catalog') {
    grid.innerHTML = '';
    cardDomMap.clear();

    if (cards.length > 0) {
      const sec1 = document.createElement('div');
      sec1.className = 'catalog-section-header';
      sec1.innerHTML = `
        <h2>Bölüm 1 — Seçkin Grafik Motorları (${cards.length} Grafik)</h2>
        <span>Tüm motorlar render(container, sensorData, options) arayüzünü uygular</span>
      `;
      grid.appendChild(sec1);

      cards.forEach(cardData => {
        const el = createCardElement(cardData);
        cardDomMap.set(cardData.id, el);
        grid.appendChild(el);
      });
    }

    if (state.catalogGroup === 'ALL' || state.catalogGroup === 'UI-HELPERS') {
      const sec2 = document.createElement('div');
      sec2.className = 'catalog-section-header';
      sec2.innerHTML = `
        <h2>Bölüm 2 — Kart İskeletleri (${SKELETON_POOL.length}) &amp; Etkileşim Bileşenleri (${UI_HELPER_POOL.length} · H1–H6)</h2>
        <span>Grafik motorlarından bağımsız kabuk ve UI etkileşim katmanı</span>
      `;
      grid.appendChild(sec2);

      UI_HELPER_POOL.forEach(hItem => {
        const showcaseEl = createUiHelperShowcaseElement(hItem, () => {
          openPopover(CATALOG_CARDS[0], allSensors, false);
        });
        grid.appendChild(showcaseEl);
      });
    }
    return;
  }

  // Canlı Mod: Sadece değişen kartları yerinde güncelle
  grid.querySelectorAll('.catalog-section-header, .uiv2-card.span-12').forEach(h => h.remove());
  for (const [id, domEl] of cardDomMap.entries()) {
    if (!activeIds.has(id)) {
      domEl.remove();
      cardDomMap.delete(id);
    }
  }

  cards.forEach(cardData => {
    let el = cardDomMap.get(cardData.id);
    if (!el) {
      el = createCardElement(cardData);
      cardDomMap.set(cardData.id, el);
      grid.appendChild(el);
    } else {
      updateCardElementInPlace(el, cardData);
    }
    updateOpenPopoverIfActive(cardData, allSensors, isLiveMode);
  });
}

// --- KART YÖNETİM İŞLEMLERİ ---

function changeCardSensor(cardId, newSensorId) {
  const w = state.widgets.find(x => x.id === cardId);
  if (w) {
    w.sensorId = newSensorId;
    persistState();
    const domEl = cardDomMap.get(cardId);
    if (domEl) {
      const cardData = buildCardDataForWidget(w);
      rebuildCardDom(domEl, cardData);
    }
    renderDashboard();
    return getActiveCardsData().find(x => x.id === cardId);
  }
  return null;
}

function changeCardSecondarySensors(cardId, secondaryIds) {
  const w = state.widgets.find(x => x.id === cardId);
  if (w) {
    w.secondarySensorIds = secondaryIds;
    persistState();
    renderDashboard();
    return getActiveCardsData().find(x => x.id === cardId);
  }
  return null;
}

function changeCardChart(cardId, newChartCode) {
  const normCode = normalizeChartCode(newChartCode);
  const w = state.widgets.find(x => x.id === cardId);
  if (w) {
    w.chartCode = normCode;
    persistState();
  }
  const cat = CATALOG_CARDS.find(x => x.id === cardId);
  if (cat) {
    cat.chartCode = normCode;
  }
  renderDashboard();
  return getActiveCardsData().find(x => x.id === cardId);
}

function changeCardSkeleton(cardId, newSkeleton) {
  const w = state.widgets.find(x => x.id === cardId);
  if (w) {
    w.skeleton = newSkeleton;
    persistState();
  }
  const cat = CATALOG_CARDS.find(x => x.id === cardId);
  if (cat) {
    cat.skeleton = newSkeleton;
  }
  renderDashboard();
  return getActiveCardsData().find(x => x.id === cardId);
}

function cycleCardSpan(cardId) {
  const spans = ['span-3', 'span-4', 'span-6', 'span-12'];
  const w = state.widgets.find(x => x.id === cardId);
  if (w) {
    w.span = spans[(spans.indexOf(w.span) + 1) % spans.length];
    persistState();
  }
  const cat = CATALOG_CARDS.find(x => x.id === cardId);
  if (cat) {
    cat.span = spans[(spans.indexOf(cat.span) + 1) % spans.length];
  }
  renderDashboard();
}

function removeCard(cardId) {
  const idx = state.widgets.findIndex(w => w.id === cardId);
  if (idx >= 0) {
    state.widgets.splice(idx, 1);
    persistState();
    const domEl = cardDomMap.get(cardId);
    if (domEl) {
      domEl.remove();
      cardDomMap.delete(cardId);
    }
    renderDashboard();
    if (document.getElementById('configDrawerBackdrop')?.classList.contains('open')) {
      renderDrawerContent();
    }
  }
}

// --- HIZLI SENSÖR SEÇİCİ ARAYÜZÜ ---

function openSensorPickerForCard(cardId) {
  state.targetCardForSensorPick = cardId;
  openDrawerWithTab('add-sensor');
  const searchInput = document.getElementById('sensorSearchInput');
  if (searchInput) {
    searchInput.placeholder = 'Bu karta atamak için sensör ara...';
    searchInput.focus();
  }
}

function openDrawerWithTab(tabName) {
  state.drawerTab = tabName;
  const tabCtrl = document.getElementById('drawerTabControl');
  tabCtrl?.querySelectorAll('.seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.dtab === tabName);
  });
  renderDrawerContent();
  document.getElementById('configDrawerBackdrop')?.classList.add('open');
}

function renderDrawerContent() {
  const listEl = document.getElementById('drawerContentList');
  if (!listEl) return;

  const q = (document.getElementById('sensorSearchInput')?.value || '').trim().toLowerCase();
  const allSensors = Array.from(state.sensorMap.values());
  const isCardPickMode = Boolean(state.targetCardForSensorPick);
  const targetCard = isCardPickMode ? state.widgets.find(w => w.id === state.targetCardForSensorPick) : null;

  // SEKME 1: AKTİF KARTLARIM
  if (state.drawerTab === 'active-cards' && !isCardPickMode) {
    if (state.widgets.length === 0) {
      listEl.innerHTML = `
        <div style="padding:18px;text-align:center;color:var(--text-secondary);font-size:12px;">
          Panelde aktif kart yok. <strong>"＋ Yeni Sensör / Kart Ekle"</strong> sekmesinden ekleyebilirsiniz.
        </div>
      `;
      return;
    }

    const filteredWidgets = state.widgets.filter(w => {
      const s = state.sensorMap.get(w.sensorId);
      if (!q) return true;
      return (s?.name || '').toLowerCase().includes(q)
        || (s?.hardware || '').toLowerCase().includes(q)
        || w.chartCode.toLowerCase().includes(q);
    });

    listEl.innerHTML = filteredWidgets.map((w, idx) => {
      const s = state.sensorMap.get(w.sensorId);
      const meta = getChartMeta(w.chartCode);
      return `
        <div class="sensor-pick-item" data-widget-id="${w.id}">
          <div class="sensor-pick-top">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">
              <span class="chart-code-pill">#${idx + 1}</span>
              <button class="ctrl-btn js-drawer-pick-sensor" type="button" style="padding:4px 8px;font-size:11px;min-width:0;flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                🎯 ${s?.name || 'Sensör Seç'} ▾
              </button>
            </div>
            <button class="icon-btn-danger js-delete-active-widget" type="button" title="Kartı Kaldır" style="width:28px;height:28px;">🗑️</button>
          </div>
          <div class="sensor-pick-controls">
            <select class="js-active-chart-sel">
              ${CHART_POOL.map(c => `<option value="${c.code}" ${c.code === w.chartCode ? 'selected' : ''}>${c.name}</option>`).join('')}
            </select>
            <select class="js-active-skel-sel">
              ${SKELETON_POOL.map(sk => `<option value="${sk.code}" ${sk.code === w.skeleton ? 'selected' : ''}>${sk.code}</option>`).join('')}
            </select>
            <select class="js-active-span-sel">
              <option value="span-3" ${w.span === 'span-3' ? 'selected' : ''}>1/4 Dar</option>
              <option value="span-4" ${w.span === 'span-4' ? 'selected' : ''}>1/3 Orta</option>
              <option value="span-6" ${w.span === 'span-6' ? 'selected' : ''}>1/2 Geniş</option>
              <option value="span-12" ${w.span === 'span-12' ? 'selected' : ''}>Tam Şerit</option>
            </select>
          </div>
          <div style="font-size:10.5px;color:var(--text-muted);display:flex;justify-content:space-between;">
            <span>Donanım: ${s?.hardware || '-'}</span>
            <span class="needs-badge ${meta.needs}">${getNeedsLabel(meta.needs)}</span>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.sensor-pick-item').forEach(itemEl => {
      const widgetId = itemEl.dataset.widgetId;
      itemEl.querySelector('.js-drawer-pick-sensor')?.addEventListener('click', () => {
        openSensorPickerForCard(widgetId);
      });
      itemEl.querySelector('.js-delete-active-widget')?.addEventListener('click', () => {
        removeCard(widgetId);
      });
      itemEl.querySelector('.js-active-chart-sel')?.addEventListener('change', (e) => {
        changeCardChart(widgetId, e.target.value);
        renderDrawerContent();
      });
      itemEl.querySelector('.js-active-skel-sel')?.addEventListener('change', (e) => {
        changeCardSkeleton(widgetId, e.target.value);
      });
      itemEl.querySelector('.js-active-span-sel')?.addEventListener('change', (e) => {
        const w = state.widgets.find(x => x.id === widgetId);
        if (w) {
          w.span = e.target.value;
          persistState();
          renderDashboard();
        }
      });
    });
    return;
  }

  // SEKME 2: YENİ SENSÖR / KART EKLE VEYA SEÇİLİ KARTA ATAMA
  if (allSensors.length === 0) {
    listEl.innerHTML = `<div style="font-size:12px;color:var(--text-secondary);padding:12px;">Sensör verisi bekleniyor...</div>`;
    return;
  }

  const filteredSensors = allSensors.filter(s =>
    !q || s.name.toLowerCase().includes(q) || s.hardware.toLowerCase().includes(q) || s.type.toLowerCase().includes(q)
  ).slice(0, 90);

  const bannerHtml = isCardPickMode ? `
    <div style="background:rgba(59,130,246,0.15);border:1px solid var(--accent-blue);border-radius:8px;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;font-size:12px;">
      <span>🎯 <strong>Kart İçin Sensör Seçin</strong> (${targetCard?.chartCode || 'Kart'})</span>
      <button id="btnCancelCardPick" class="ctrl-btn" type="button" style="padding:2px 8px;font-size:10.5px;">İptal</button>
    </div>
  ` : '';

  listEl.innerHTML = bannerHtml + filteredSensors.map(s => {
    const isCurrent = targetCard?.sensorId === s.id;
    return `
      <div class="sensor-pick-item" data-sensor-id="${s.id}" style="${isCurrent ? 'border-color:var(--accent-blue);background:rgba(59,130,246,0.08);' : ''}">
        <div class="sensor-pick-top">
          <div style="min-width:0;">
            <div style="font-size:12.5px;font-weight:600;color:var(--text-primary);">${s.name}</div>
            <div class="tabular-nums" style="font-size:11px;color:var(--text-secondary);">
              ${s.hardware} · ${s.type} · <strong style="color:var(--accent-blue);">${s.formattedValue}</strong>
            </div>
          </div>
          <button class="ctrl-btn primary js-select-or-add-sensor" type="button" style="padding:5px 12px;font-size:11.5px;flex-shrink:0;">
            ${isCardPickMode ? (isCurrent ? '✓ Seçili' : '🎯 Bu Sensörü Ata') : '＋ Kart Olarak Ekle'}
          </button>
        </div>
        ${!isCardPickMode ? `
          <div class="sensor-pick-controls">
            <select class="js-new-chart">
              ${CHART_POOL.map(c => `<option value="${c.code}" ${c.code === 'B1' ? 'selected' : ''}>${c.name}</option>`).join('')}
            </select>
            <select class="js-new-skel">
              ${SKELETON_POOL.map(sk => `<option value="${sk.code}">${sk.code}</option>`).join('')}
            </select>
            <select class="js-new-span">
              <option value="span-3">1/4 Dar</option>
              <option value="span-4" selected>1/3 Orta</option>
              <option value="span-6">1/2 Geniş</option>
              <option value="span-12">Tam Şerit</option>
            </select>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  document.getElementById('btnCancelCardPick')?.addEventListener('click', () => {
    state.targetCardForSensorPick = null;
    renderDrawerContent();
  });

  listEl.querySelectorAll('.sensor-pick-item').forEach(itemEl => {
    const sensorId = itemEl.dataset.sensorId;
    const btnAction = itemEl.querySelector('.js-select-or-add-sensor');

    btnAction?.addEventListener('click', () => {
      if (state.targetCardForSensorPick) {
        // Seçili karta bu sensörü ata ve çekmeceyi kapat
        changeCardSensor(state.targetCardForSensorPick, sensorId);
        state.targetCardForSensorPick = null;
        document.getElementById('configDrawerBackdrop')?.classList.remove('open');
      } else {
        // Yeni kart ekle
        const chartSel = itemEl.querySelector('.js-new-chart');
        const skelSel = itemEl.querySelector('.js-new-skel');
        const spanSel = itemEl.querySelector('.js-new-span');
        localStorage.removeItem('thm_uiv2_user_cleared');
        state.widgets.push({
          id: 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          sensorId,
          secondarySensorIds: [],
          chartCode: normalizeChartCode(chartSel?.value || 'B1'),
          skeleton: skelSel?.value || 'S-bento',
          span: spanSel?.value || 'span-4'
        });
        persistState();
        renderDrawerContent();
        renderDashboard();
      }
    });
  });
}

// --- SUNUCU HALKA TAMPONU VE TELEMETRİ ---

async function hydrateHistoryFromServer() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`/api/v2/history?window=${state.windowSec || 60}`, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.history && typeof data.history === 'object') {
      for (const [sensorId, values] of Object.entries(data.history)) {
        if (Array.isArray(values) && values.length > 0) {
          state.historyMap.set(sensorId, values.slice(-state.windowSec));
        }
      }
    }
  } catch { /* ignore */ }
}

let serverUptimeSeconds = null;
let uptimeBaseTimestamp = 0;
const pageLoadTimestamp = Date.now();

function formatUptime(totalSec) {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return '0sn';
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = Math.floor(totalSec % 60);

  if (days > 0) {
    return `${days}g ${hours}s ${mins}d`;
  }
  if (hours > 0) {
    return `${hours}s ${mins}d ${secs}sn`;
  }
  return `${mins}d ${secs}sn`;
}

function startClockLoop() {
  const clockEl = document.getElementById('topbarClockTime');
  const uptimeEl = document.getElementById('topbarUptimeVal');

  function tick() {
    const now = new Date();
    if (clockEl) {
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      clockEl.textContent = `${h}:${m}:${s}`;
    }

    if (uptimeEl) {
      let curUptime = 0;
      if (serverUptimeSeconds !== null) {
        const elapsedSinceSync = Math.floor((Date.now() - uptimeBaseTimestamp) / 1000);
        curUptime = serverUptimeSeconds + Math.max(0, elapsedSinceSync);
      } else {
        curUptime = Math.max(1, Math.floor((Date.now() - pageLoadTimestamp) / 1000));
      }
      uptimeEl.textContent = formatUptime(curUptime);
    }
  }

  tick();
  setInterval(tick, 1000);
}

async function pollTelemetry(signal) {
  const dot = document.getElementById('liveStatusDot');
  try {
    const res = await fetch('/api/stats', { cache: 'no-store', signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const payload = await res.json();

    if (Number.isFinite(payload.uptimeSeconds)) {
      serverUptimeSeconds = payload.uptimeSeconds;
      uptimeBaseTimestamp = Date.now();
    }

    const hostEl = document.getElementById('hostNameTitle');
    if (hostEl && payload.hostName) {
      hostEl.textContent = `${payload.hostName} · UI v2`;
    }
    dot?.classList.remove('offline');

    const sensors = Array.isArray(payload.sensors) ? payload.sensors : [];
    const maxLen = state.windowSec || 60;

    sensors.forEach(s => {
      state.sensorMap.set(s.id, s);
      updateDerivedTelemetry(s);
      if (Number.isFinite(s.value)) {
        let arr = state.historyMap.get(s.id);
        if (!arr || arr.length === 0) {
          arr = [s.value, s.value];
          state.historyMap.set(s.id, arr);
        } else {
          arr.push(s.value);
          if (arr.length > maxLen) arr.splice(0, arr.length - maxLen);
        }
      }
    });

    if (state.widgets.length === 0 && sensors.length > 0 && !localStorage.getItem('thm_uiv2_user_cleared')) {
      state.widgets = buildDefaultWidgetsFromSensors(sensors);
      persistState();
    }

    animateCatalogDemoData();
    renderDashboard();
  } catch {
    dot?.classList.add('offline');
    animateCatalogDemoData();
    renderDashboard();
  }
}

let isPolling = false;
let pollTimer = null;

function startTelemetryLoop() {
  if (pollTimer) clearTimeout(pollTimer);

  async function step() {
    if (isPolling) return;
    isPolling = true;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      await pollTelemetry(controller.signal);
      clearTimeout(timeoutId);
    } catch {
      // Ağ zaman aşımı veya bağlantı kopması
    } finally {
      isPolling = false;
      pollTimer = setTimeout(step, 1000);
    }
  }

  step();
}

function animateCatalogDemoData() {
  CATALOG_CARDS.forEach((c, idx) => {
    const last = c.history[c.history.length - 1] ?? c.value;
    const step = Math.sin(Date.now() / 1400 + idx) * (c.value * 0.025);
    const nextV = Math.max(c.min || 1, Math.min(c.max || 9999, Number((last * 0.7 + (c.value + step) * 0.3).toFixed(2))));
    c.history.push(nextV);
    if (c.history.length > 18) c.history.shift();
  });
}

async function initApp() {
  // 1. Senkron: Yerel yapılandırmayı yükle ve temayı derhal uygula
  const localCfg = loadLocalConfig();
  if (localCfg) normalizeSavedConfig(localCfg);

  document.documentElement.setAttribute('data-theme', state.theme);
  updateDynamicBadges();

  // 2. Senkron: Tüm üst bar ve çekmece event listener'larını derhal bağla
  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect) {
    themeSelect.value = state.theme;
    themeSelect.addEventListener('change', (e) => {
      state.theme = e.target.value;
      document.documentElement.setAttribute('data-theme', state.theme);
      persistState();
      renderDashboard();
    });
  }

  const layoutSelect = document.getElementById('layoutSelect');
  if (layoutSelect) {
    layoutSelect.value = state.layout;
    layoutSelect.addEventListener('change', (e) => {
      state.layout = e.target.value;
      persistState();
      renderDashboard();
    });
  }

  // Mod Segment Kontrolü (Canlı Panel / Katalog)
  const modeCtrl = document.getElementById('modeSegmentControl');
  const filterBar = document.getElementById('catalogFilterBar');

  function setMode(newMode) {
    state.mode = newMode;
    modeCtrl?.querySelectorAll('.seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === newMode);
    });
    if (filterBar) {
      filterBar.style.display = newMode === 'catalog' ? 'flex' : 'none';
    }
    cardDomMap.clear();
    const grid = document.getElementById('dashboardGrid');
    if (grid) grid.innerHTML = '';
    renderDashboard();
  }

  modeCtrl?.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetMode = btn.dataset.mode;
      if (targetMode === 'catalog') {
        history.replaceState(null, '', '#catalog');
      } else {
        history.replaceState(null, '', window.location.pathname);
      }
      setMode(targetMode);
    });
  });

  if (window.location.hash === '#catalog') {
    setMode('catalog');
  }

  window.addEventListener('hashchange', () => {
    setMode(window.location.hash === '#catalog' ? 'catalog' : 'live');
  });

  // Katalog Grup Filtresi
  const groupCtrl = document.getElementById('catalogGroupFilter');
  groupCtrl?.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      groupCtrl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.catalogGroup = btn.dataset.group;
      cardDomMap.clear();
      const grid = document.getElementById('dashboardGrid');
      if (grid) grid.innerHTML = '';
      renderDashboard();
    });
  });

  // Zaman penceresi (1dk / 5dk / 15dk)
  const winCtrl = document.getElementById('windowSegmentControl');
  winCtrl?.querySelectorAll('.seg-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.window) === state.windowSec);
    btn.addEventListener('click', async () => {
      winCtrl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.windowSec = Number(btn.dataset.window) || 60;
      persistState();
      await hydrateHistoryFromServer();
      renderDashboard();
    });
  });

  // Çekmece Kontrolleri (Sensör Seçici / Kart Yönet)
  const drawerBackdrop = document.getElementById('configDrawerBackdrop');
  document.getElementById('btnOpenDrawer')?.addEventListener('click', () => {
    state.targetCardForSensorPick = null;
    openDrawerWithTab(state.widgets.length > 0 ? 'active-cards' : 'add-sensor');
  });
  document.getElementById('btnCloseDrawer')?.addEventListener('click', () => {
    state.targetCardForSensorPick = null;
    drawerBackdrop?.classList.remove('open');
  });
  drawerBackdrop?.addEventListener('click', (e) => {
    if (e.target === drawerBackdrop) {
      state.targetCardForSensorPick = null;
      drawerBackdrop.classList.remove('open');
    }
  });

  const drawerTabCtrl = document.getElementById('drawerTabControl');
  drawerTabCtrl?.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      drawerTabCtrl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.drawerTab = btn.dataset.dtab;
      renderDrawerContent();
    });
  });

  document.getElementById('sensorSearchInput')?.addEventListener('input', () => {
    renderDrawerContent();
  });

  document.getElementById('btnClearAllCards')?.addEventListener('click', () => {
    state.widgets = [];
    localStorage.setItem('thm_uiv2_user_cleared', '1');
    persistState();
    cardDomMap.clear();
    renderDrawerContent();
    renderDashboard();
  });

  document.getElementById('btnResetDefaults')?.addEventListener('click', () => {
    localStorage.removeItem('thm_uiv2_user_cleared');
    state.widgets = buildDefaultWidgetsFromSensors(Array.from(state.sensorMap.values()));
    persistState();
    cardDomMap.clear();
    const grid = document.getElementById('dashboardGrid');
    if (grid) grid.innerHTML = '';
    renderDrawerContent();
    renderDashboard();
  });

  initPopover({
    onChangeSensor: (cardId, newSensorId) => changeCardSensor(cardId, newSensorId),
    onChangeSecondarySensors: (cardId, secIds) => changeCardSecondarySensors(cardId, secIds),
    onChangeChart: (cardId, newChart) => changeCardChart(cardId, newChart),
    onChangeSkeleton: (cardId, newSkel) => changeCardSkeleton(cardId, newSkel),
    onRemoveCard: (cardId) => removeCard(cardId)
  });

  // 2.1 M1 Görünüm Değiştirme Dinleyicisi
  const grid = document.getElementById('dashboardGrid');
  grid?.addEventListener('cycle-m1-variant', (e) => {
    const cardId = e.detail?.cardId;
    const variants = ['hybrid', 'tiles', 'minimal', 'gauge'];
    const w = state.widgets.find(x => x.id === cardId);
    if (w) {
      const cur = w.m1Variant || 'hybrid';
      w.m1Variant = variants[(variants.indexOf(cur) + 1) % variants.length];
      persistState();
      renderDashboard();
    }
    const cat = CATALOG_CARDS.find(x => x.id === cardId);
    if (cat) {
      const cur = cat.m1Variant || 'hybrid';
      cat.m1Variant = variants[(variants.indexOf(cur) + 1) % variants.length];
      renderDashboard();
    }
  });

  // 2.2 Masa Modu (Desk Mode) & Dijital Saat / Uptime
  startClockLoop();
  const btnDeskMode = document.getElementById('btnToggleDeskMode');
  btnDeskMode?.addEventListener('click', () => {
    document.body.classList.toggle('desk-mode-active');
    const isActive = document.body.classList.contains('desk-mode-active');
    btnDeskMode.title = isActive ? 'Normal Mode Dön (ESC)' : 'Masa Modu (Zen / Odaklanmış Ekran)';
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('desk-mode-active')) {
      document.body.classList.remove('desk-mode-active');
    }
  });

  // 3. Senkron: İlk sahnelemeyi derhal yap (boş/donuk ekran beklemesini önler)
  renderDashboard();

  // 4. Asenkron: Sunucu yapılandırmasını ve telemetriyi arka planda başlat
  fetchServerConfig().then(serverCfg => {
    if (serverCfg) {
      normalizeSavedConfig(serverCfg);
      renderDashboard();
    }
  }).catch(() => {});

  hydrateHistoryFromServer().finally(() => {
    startTelemetryLoop();
  });
}

initApp();
