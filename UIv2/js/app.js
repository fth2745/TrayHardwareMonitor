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
  mode: 'live',              // 'live'
  theme: 'T-bento',          // 'T-bento' | 'T-neon' | 'T-minimal' | 'T-light' | 'T-violet'
  layout: 'cols-2',          // 'cols-1' | 'cols-2' | 'cols-3' | 'cols-4'
  windowSec: 300,            // Sabit 5 dakika
  catalogGroup: 'ALL',
  drawerTab: 'active-cards',
  targetCardForSensorPick: null,
  widgets: buildDefaultWidgetsFromSensors([]), // 6 Sabit Kart varsayılan olarak daima yüklüdür
  sensorMap: new Map(),
  historyMap: new Map()
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
  if (cfg.layout) {
    state.layout = (cfg.layout === 'cols-3') ? 'cols-3' : 'cols-2';
  }
  state.windowSec = 300; // Sabit 5 dakika arka plan penceresi

  // 6 Sabit Kartı temel al, kayıtlı varyant ve aktiflik tercihlerini birleştir
  const defaults = buildDefaultWidgetsFromSensors(Array.from(state.sensorMap.values()));
  if (Array.isArray(cfg.widgets) && cfg.widgets.length > 0) {
    state.widgets = defaults.map(def => {
      const saved = cfg.widgets.find(w => w.id === def.id || w.cardType === def.cardType);
      return {
        ...def,
        m1Variant: saved?.m1Variant || def.m1Variant,
        enabled: saved?.enabled !== false
      };
    });
  } else {
    state.widgets = defaults;
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
  const btnDrawerActive = document.getElementById('btnDrawerActiveTab');
  if (btnDrawerActive) {
    const activeCount = state.widgets.filter(w => w.enabled !== false).length;
    btnDrawerActive.textContent = `Sabit Paneller (${activeCount} / ${state.widgets.length})`;
  }
}

function parseUnit(formatted) {
  if (!formatted) return '';
  const parts = String(formatted).trim().split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function buildLiveMatrixRows(cardType, primarySensor, allSensors) {
  // 1. CPU (DRAM BİLGİLERİ TAMAMEN KALDIRILDI)
  if (cardType === 'cpu') {
    const tempSens = (primarySensor && primarySensor.type === 'Sıcaklık')
      ? primarySensor
      : allSensors.find(x => (x.hardware.includes('Ryzen') || x.hardware.includes('CPU')) && x.type === 'Sıcaklık' && x.name.includes('Core'));
    const tVal = tempSens?.value ?? 48;

    const clockSens = allSensors.find(x => (x.hardware.includes('Ryzen') || x.hardware.includes('CPU')) && (x.type === 'Saat' || x.type === 'Frekans') && (x.name.includes('Core #1') || x.name.includes('Average') || x.name.includes('Max')))
      || allSensors.find(x => (x.hardware.includes('Ryzen') || x.hardware.includes('CPU')) && (x.type === 'Saat' || x.type === 'Frekans'));
    const cMhz = clockSens?.value ?? 4850;
    const cGhz = (cMhz / 1000).toFixed(2);

    const powerSens = allSensors.find(x => (x.hardware.includes('Ryzen') || x.hardware.includes('CPU')) && x.type === 'Güç' && (x.name.includes('Package') || x.name.includes('Total') || x.name.includes('Power')));
    const pVal = powerSens?.value ?? 95;

    const voltSens = allSensors.find(x => (x.type === 'Voltaj' || x.type === 'Voltage') && (x.name === 'Vcore' || x.name.includes('VID') || x.name.includes('Core')));
    const vVal = voltSens?.value ?? 1.38;

    const loadSens = allSensors.find(x => (x.hardware.includes('Ryzen') || x.hardware.includes('CPU')) && x.type === 'Yük' && (x.name.includes('Total') || x.name.includes('Package') || x.name.includes('Core')));
    const lVal = loadSens?.value ?? 18;

    return [
      {
        icon: '🌡️',
        label: 'İşlemci Sıcaklığı',
        value: tVal,
        formattedValue: `${tVal.toFixed(1)} °C`,
        pct: Math.min(100, Math.max(10, ((tVal - 25) / 65) * 100)),
        color: tVal > 80 ? 'var(--accent-red)' : tVal > 68 ? 'var(--accent-amber)' : 'linear-gradient(90deg, #3B82F6, #6366F1)',
        valColor: tVal > 80 ? 'var(--accent-red)' : 'var(--text-primary)',
        minFormatted: tempSens?.formattedMin || `${(tVal - 3).toFixed(1)} °C`,
        avgFormatted: tempSens?.formattedAvg || '-',
        maxFormatted: tempSens?.formattedMax || '-'
      },
      {
        icon: '⚡',
        label: 'İşlemci Hızı',
        value: cMhz,
        formattedValue: `${cGhz} GHz`,
        pct: Math.min(100, Math.max(15, (cMhz / 5700) * 100)),
        color: 'linear-gradient(90deg, #8B5CF6, #A855F7)',
        badge: cMhz > 5000 ? 'Boost' : '',
        badgeCls: 'up',
        minFormatted: clockSens?.formattedMin || `${(cMhz * 0.7 / 1000).toFixed(2)} GHz`,
        avgFormatted: clockSens?.formattedAvg || '-',
        maxFormatted: clockSens?.formattedMax || '-'
      },
      {
        icon: '🔌',
        label: 'Package Gücü',
        value: pVal,
        formattedValue: `${pVal.toFixed(1)} W`,
        pct: Math.min(100, Math.max(10, (pVal / 230) * 100)),
        color: 'linear-gradient(90deg, #F59E0B, #EF4444)',
        minFormatted: powerSens?.formattedMin || `${(pVal * 0.5).toFixed(1)} W`,
        avgFormatted: powerSens?.formattedAvg || '-',
        maxFormatted: powerSens?.formattedMax || '-'
      },
      {
        icon: '🔋',
        label: 'Çekirdek Voltajı (Vcore)',
        value: vVal,
        formattedValue: `${vVal.toFixed(3)} V`,
        pct: Math.min(100, Math.max(15, (vVal / 1.5) * 100)),
        color: 'linear-gradient(90deg, #06B6D4, #3B82F6)',
        minFormatted: voltSens?.formattedMin || `${(vVal * 0.85).toFixed(3)} V`,
        avgFormatted: voltSens?.formattedAvg || '-',
        maxFormatted: voltSens?.formattedMax || '-'
      },
      {
        icon: '📊',
        label: 'Toplam İşlemci Yükü',
        value: lVal,
        formattedValue: `%${lVal.toFixed(1)}`,
        pct: Math.min(100, Math.max(4, lVal)),
        color: 'linear-gradient(90deg, #10B981, #06B6D4)',
        minFormatted: loadSens?.formattedMin || `%${(Math.max(0, lVal - 10)).toFixed(1)}`,
        avgFormatted: loadSens?.formattedAvg || '-',
        maxFormatted: loadSens?.formattedMax || '-'
      }
    ];
  }

  // 2. GPU
  if (cardType === 'gpu') {
    const gpuTempSens = allSensors.find(x => (x.hardware.includes('GeForce') || x.hardware.includes('NVIDIA') || x.hardware.includes('GPU')) && x.type === 'Sıcaklık' && x.name.includes('Core'));
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
        minFormatted: gpuTempSens?.formattedMin || `${(gtVal - 2).toFixed(1)} °C`,
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
        minFormatted: gpuLoadSens?.formattedMin || `%${(Math.max(0, glVal - 8)).toFixed(1)}`,
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
        minFormatted: gpuPowerSens?.formattedMin || `${(gpVal * 0.4).toFixed(1)} W`,
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
        minFormatted: gpuClockSens?.formattedMin || `${Math.round(gcVal * 0.5)} MHz`,
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
        minFormatted: gpuVoltSens?.formattedMin || `${(gvVal * 0.9).toFixed(3)} V`,
        avgFormatted: gpuVoltSens?.formattedAvg || '-',
        maxFormatted: gpuVoltSens?.formattedMax || '-'
      }
    ];
  }

  // 3. RAM (Bellek - Yeni Bağımsız Kart)
  if (cardType === 'ram') {
    const memLoadSens = allSensors.find(x => x.hardware.includes('Total Memory') && x.type === 'Yük');
    const mlVal = memLoadSens?.value ?? 38;

    const memUsedSens = allSensors.find(x => x.hardware.includes('Total Memory') && (x.name.includes('Used') || x.name.includes('Kullanılan')));
    const muVal = memUsedSens?.value ?? 12.2;

    const memAvailSens = allSensors.find(x => x.hardware.includes('Total Memory') && (x.name.includes('Available') || x.name.includes('Boş') || x.name.includes('Kalan')));
    const maVal = memAvailSens?.value ?? 19.8;

    // Yalnızca gerçek "DIMM #1", "DIMM #3" sıcaklık sensörlerini al (Resolution / Limit gibi yan sensörleri dışla)
    const isDimmTemp = (x) => (x.type === 'Sıcaklık' || x.type === 'Temperature') && /^DIMM #\d+$/i.test(String(x.name || '').trim());
    const dimmSensors = allSensors.filter(isDimmTemp);
    const dimm1 = dimmSensors[0] || allSensors.find(x => x.name?.includes('DIMM #1') && (x.type === 'Sıcaklık' || x.type === 'Temperature'));
    const dimm2 = dimmSensors.find(x => x.id !== dimm1?.id) || allSensors.find(x => (x.name?.includes('DIMM #3') || x.name?.includes('DIMM #2')) && x.id !== dimm1?.id && (x.type === 'Sıcaklık' || x.type === 'Temperature'));

    const d1Val = dimm1?.value ?? 33.5;
    const d2Val = dimm2?.value ?? 32.8;

    return [
      {
        icon: '🧠',
        label: 'Bellek Kullanım Oranı',
        value: mlVal,
        formattedValue: `%${mlVal.toFixed(1)}`,
        pct: Math.min(100, Math.max(5, mlVal)),
        color: 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
        minFormatted: memLoadSens?.formattedMin || `%${(Math.max(5, mlVal - 5)).toFixed(1)}`,
        avgFormatted: memLoadSens?.formattedAvg || '-',
        maxFormatted: memLoadSens?.formattedMax || '-'
      },
      {
        icon: '📦',
        label: 'Kullanılan Bellek',
        value: muVal,
        formattedValue: memUsedSens?.formattedValue || `${muVal.toFixed(1)} GB`,
        pct: Math.min(100, Math.max(10, (muVal / 32) * 100)),
        color: 'linear-gradient(90deg, #6366F1, #A855F7)',
        minFormatted: memUsedSens?.formattedMin || `${(muVal * 0.8).toFixed(1)} GB`,
        avgFormatted: memUsedSens?.formattedAvg || '-',
        maxFormatted: memUsedSens?.formattedMax || '-'
      },
      {
        icon: '🍃',
        label: 'Kullanılabilir (Boş) Bellek',
        value: maVal,
        formattedValue: memAvailSens?.formattedValue || `${maVal.toFixed(1)} GB`,
        pct: Math.min(100, Math.max(10, (maVal / 32) * 100)),
        color: 'linear-gradient(90deg, #10B981, #06B6D4)',
        minFormatted: memAvailSens?.formattedMin || `${(maVal * 0.9).toFixed(1)} GB`,
        avgFormatted: memAvailSens?.formattedAvg || '-',
        maxFormatted: memAvailSens?.formattedMax || '-'
      },
      {
        icon: '🌡️',
        label: 'DIMM 1 Sıcaklığı (Slot #1)',
        value: d1Val,
        formattedValue: `${d1Val.toFixed(1)} °C`,
        pct: Math.min(100, Math.max(10, ((d1Val - 20) / 45) * 100)),
        color: d1Val > 55 ? 'var(--accent-red)' : 'linear-gradient(90deg, #10B981, #06B6D4)',
        minFormatted: dimm1?.formattedMin || `${(d1Val - 1.5).toFixed(1)} °C`,
        avgFormatted: dimm1?.formattedAvg || '-',
        maxFormatted: dimm1?.formattedMax || '-'
      },
      {
        icon: '🌡️',
        label: 'DIMM 2 Sıcaklığı (Slot #3)',
        value: d2Val,
        formattedValue: `${d2Val.toFixed(1)} °C`,
        pct: Math.min(100, Math.max(10, ((d2Val - 20) / 45) * 100)),
        color: d2Val > 55 ? 'var(--accent-red)' : 'linear-gradient(90deg, #10B981, #06B6D4)',
        minFormatted: dimm2?.formattedMin || `${(d2Val - 1.5).toFixed(1)} °C`,
        avgFormatted: dimm2?.formattedAvg || '-',
        maxFormatted: dimm2?.formattedMax || '-'
      }
    ];
  }

  // 4. Anakart (Motherboard)
  if (cardType === 'board') {
    const t1 = allSensors.find(x => x.hardware.includes('NCT') && x.name === 'Temperature #1');
    const t2 = allSensors.find(x => x.hardware.includes('NCT') && x.name === 'Temperature #2');
    const v33 = allSensors.find(x => x.hardware.includes('NCT') && x.name === '+3.3V');
    const vavcc = allSensors.find(x => x.hardware.includes('NCT') && x.name === 'AVCC');
    const vstandby = allSensors.find(x => x.hardware.includes('NCT') && x.name === '+3V Standby');

    const v1Val = t1?.value ?? 32.5;
    const v2Val = t2?.value ?? 28.0;
    const v33Val = v33?.value ?? 3.312;
    const avccVal = vavcc?.value ?? 3.392;
    const stbVal = vstandby?.value ?? 3.392;

    return [
      {
        icon: '🌡️',
        label: 'Sistem Sıcaklığı (VRM)',
        value: v1Val,
        formattedValue: `${v1Val.toFixed(1)} °C`,
        pct: Math.min(100, Math.max(10, (v1Val / 85) * 100)),
        color: 'linear-gradient(90deg, #10B981, #3B82F6)',
        minFormatted: t1?.formattedMin || `${(v1Val - 2).toFixed(1)} °C`,
        avgFormatted: t1?.formattedAvg || '-',
        maxFormatted: t1?.formattedMax || '-'
      },
      {
        icon: '🌡️',
        label: 'Yonga Seti Sıcaklığı',
        value: v2Val,
        formattedValue: `${v2Val.toFixed(1)} °C`,
        pct: Math.min(100, Math.max(10, (v2Val / 85) * 100)),
        color: 'linear-gradient(90deg, #06B6D4, #6366F1)',
        minFormatted: t2?.formattedMin || `${(v2Val - 1.5).toFixed(1)} °C`,
        avgFormatted: t2?.formattedAvg || '-',
        maxFormatted: t2?.formattedMax || '-'
      },
      {
        icon: '⚡',
        label: '+3.3V Voltaj Hattı',
        value: v33Val,
        formattedValue: `${v33Val.toFixed(3)} V`,
        pct: Math.min(100, Math.max(20, (v33Val / 3.6) * 100)),
        color: 'linear-gradient(90deg, #8B5CF6, #A855F7)',
        minFormatted: v33?.formattedMin || `${(v33Val * 0.98).toFixed(3)} V`,
        avgFormatted: v33?.formattedAvg || '-',
        maxFormatted: v33?.formattedMax || '-'
      },
      {
        icon: '🔋',
        label: 'AVCC Giriş Voltajı',
        value: avccVal,
        formattedValue: `${avccVal.toFixed(3)} V`,
        pct: Math.min(100, Math.max(20, (avccVal / 3.6) * 100)),
        color: 'linear-gradient(90deg, #3B82F6, #06B6D4)',
        minFormatted: vavcc?.formattedMin || `${(avccVal * 0.98).toFixed(3)} V`,
        avgFormatted: vavcc?.formattedAvg || '-',
        maxFormatted: vavcc?.formattedMax || '-'
      },
      {
        icon: '🛡️',
        label: '+3V Standby Rayı',
        value: stbVal,
        formattedValue: `${stbVal.toFixed(3)} V`,
        pct: Math.min(100, Math.max(20, (stbVal / 3.6) * 100)),
        color: 'linear-gradient(90deg, #10B981, #8B5CF6)',
        minFormatted: vstandby?.formattedMin || `${(stbVal * 0.98).toFixed(3)} V`,
        avgFormatted: vstandby?.formattedAvg || '-',
        maxFormatted: vstandby?.formattedMax || '-'
      }
    ];
  }

  // 5. PSU (Güç Kaynağı - Tahmini Sistem Gücü)
  if (cardType === 'psu') {
    const cpuP = allSensors.find(x => (x.hardware.includes('Ryzen') || x.hardware.includes('CPU')) && x.type === 'Güç');
    const gpuP = allSensors.find(x => (x.hardware.includes('GeForce') || x.hardware.includes('NVIDIA') || x.hardware.includes('GPU')) && x.type === 'Güç');
    const v33 = allSensors.find(x => x.hardware.includes('NCT') && x.name === '+3.3V');
    const term = allSensors.find(x => x.hardware.includes('NCT') && x.name.includes('Termination'));

    const cpVal = cpuP?.value ?? 65;
    const gpVal = gpuP?.value ?? 45;
    const totalEstWatt = cpVal + gpVal;
    const cpMin = cpuP?.min ?? (cpVal * 0.4);
    const gpMin = gpuP?.min ?? (gpVal * 0.3);
    const cpAvg = cpuP?.avg ?? cpVal;
    const gpAvg = gpuP?.avg ?? gpVal;
    const cpMax = cpuP?.max ?? (cpVal * 1.4);
    const gpMax = gpuP?.max ?? (gpVal * 2.2);

    const v33Val = v33?.value ?? 3.312;
    const termVal = term?.value ?? 1.656;

    return [
      {
        icon: '⚡',
        label: 'Tahmini Sistem Gücü',
        value: totalEstWatt,
        formattedValue: `~${totalEstWatt.toFixed(1)} W`,
        pct: Math.min(100, Math.max(10, (totalEstWatt / 650) * 100)),
        color: 'linear-gradient(90deg, #F59E0B, #EF4444)',
        badge: 'Tahmini',
        badgeCls: 'warn',
        minFormatted: `~${(cpMin + gpMin).toFixed(0)} W`,
        avgFormatted: `~${(cpAvg + gpAvg).toFixed(0)} W`,
        maxFormatted: `~${(cpMax + gpMax).toFixed(0)} W`
      },
      {
        icon: '🖥️',
        label: 'İşlemci Güç Çekimi',
        value: cpVal,
        formattedValue: `${cpVal.toFixed(1)} W`,
        pct: Math.min(100, Math.max(8, (cpVal / 230) * 100)),
        color: 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
        minFormatted: cpuP?.formattedMin || `${(cpVal * 0.4).toFixed(1)} W`,
        avgFormatted: cpuP?.formattedAvg || '-',
        maxFormatted: cpuP?.formattedMax || '-'
      },
      {
        icon: '🎮',
        label: 'Ekran Kartı Güç Çekimi',
        value: gpVal,
        formattedValue: `${gpVal.toFixed(1)} W`,
        pct: Math.min(100, Math.max(8, (gpVal / 380) * 100)),
        color: 'linear-gradient(90deg, #8B5CF6, #EC4899)',
        minFormatted: gpuP?.formattedMin || `${(gpVal * 0.3).toFixed(1)} W`,
        avgFormatted: gpuP?.formattedAvg || '-',
        maxFormatted: gpuP?.formattedMax || '-'
      },
      {
        icon: '🔋',
        label: '+3.3V Ray Gerilimi',
        value: v33Val,
        formattedValue: `${v33Val.toFixed(3)} V`,
        pct: Math.min(100, Math.max(20, (v33Val / 3.6) * 100)),
        color: 'linear-gradient(90deg, #10B981, #06B6D4)',
        minFormatted: v33?.formattedMin || `${(v33Val * 0.98).toFixed(3)} V`,
        avgFormatted: v33?.formattedAvg || '-',
        maxFormatted: v33?.formattedMax || '-'
      },
      {
        icon: '🛡️',
        label: 'CPU Termination Rayı',
        value: termVal,
        formattedValue: `${termVal.toFixed(3)} V`,
        pct: Math.min(100, Math.max(15, (termVal / 2.0) * 100)),
        color: 'linear-gradient(90deg, #06B6D4, #3B82F6)',
        minFormatted: term?.formattedMin || `${(termVal * 0.98).toFixed(3)} V`,
        avgFormatted: term?.formattedAvg || '-',
        maxFormatted: term?.formattedMax || '-'
      }
    ];
  }

  // 6. Fanlar (Soğutma - 9 Adet Fan)
  if (cardType === 'fans') {
    const nctFans = allSensors.filter(x => x.hardware.includes('NCT') && x.type === 'Fan').slice(0, 7);
    const gpuFans = allSensors.filter(x => (x.hardware.includes('GeForce') || x.hardware.includes('GPU')) && x.type === 'Fan').slice(0, 2);
    const combined = [...nctFans, ...gpuFans];

    return combined.map((f, i) => {
      const val = f.value ?? 0;
      const isGpu = f.hardware.includes('GeForce') || f.hardware.includes('GPU');
      const maxRpm = isGpu ? 3200 : 2800;
      return {
        icon: '🌀',
        label: isGpu ? `GPU Fan ${i - nctFans.length + 1}` : `Kasa Fan #${i + 1}`,
        value: val,
        formattedValue: val > 0 ? `${Math.round(val)} RPM` : '0 RPM (Pasif)',
        pct: Math.min(100, Math.max(0, (val / maxRpm) * 100)),
        color: val > 2000 ? 'var(--accent-red)' : val > 1200 ? 'var(--accent-amber)' : 'var(--accent-green)',
        valColor: val > 0 ? 'var(--text-primary)' : 'var(--text-muted)'
      };
    });
  }

  return [];
}

function buildDefaultWidgetsFromSensors(sensors) {
  return [
    {
      id: 'w_cpu',
      cardType: 'cpu',
      chartCode: 'M1',
      skeleton: 'S-bento',
      span: 'span-6',
      customTitle: 'İşlemci (CPU) Özeti',
      m1Variant: 'hybrid',
      enabled: true
    },
    {
      id: 'w_gpu',
      cardType: 'gpu',
      chartCode: 'M1',
      skeleton: 'S-bento',
      span: 'span-6',
      customTitle: 'Ekran Kartı (GPU) Özeti',
      m1Variant: 'hybrid',
      enabled: true
    },
    {
      id: 'w_ram',
      cardType: 'ram',
      chartCode: 'M1',
      skeleton: 'S-bento',
      span: 'span-6',
      customTitle: 'Bellek (RAM) & DIMM Özeti',
      m1Variant: 'hybrid',
      enabled: true
    },
    {
      id: 'w_board',
      cardType: 'board',
      chartCode: 'M1',
      skeleton: 'S-bento',
      span: 'span-6',
      customTitle: 'Anakart (Motherboard) Özeti',
      m1Variant: 'hybrid',
      enabled: true
    },
    {
      id: 'w_psu',
      cardType: 'psu',
      chartCode: 'M1',
      skeleton: 'S-bento',
      span: 'span-6',
      customTitle: 'Güç Tüketimi (PSU) Özeti',
      m1Variant: 'hybrid',
      enabled: true
    },
    {
      id: 'w_fans',
      cardType: 'fans',
      chartCode: 'M1',
      skeleton: 'S-bento',
      span: 'span-6',
      customTitle: 'Soğutma & Fanlar (Halka HUD)',
      m1Variant: 'hybrid',
      enabled: true
    }
  ];
}

function buildCardDataForWidget(w) {
  const allSensors = Array.from(state.sensorMap.values());
  let primarySensor = null;

  if (w.cardType === 'cpu') {
    primarySensor = allSensors.find(x => (x.hardware.includes('Ryzen') || x.hardware.includes('CPU')) && x.type === 'Sıcaklık' && x.name.includes('Core'))
      || allSensors.find(x => (x.hardware.includes('Ryzen') || x.hardware.includes('CPU')) && x.type === 'Sıcaklık') || allSensors[0];
  } else if (w.cardType === 'gpu') {
    primarySensor = allSensors.find(x => (x.hardware.includes('GeForce') || x.hardware.includes('GPU')) && x.type === 'Sıcaklık' && x.name.includes('Core'))
      || allSensors.find(x => (x.hardware.includes('GeForce') || x.hardware.includes('GPU')) && x.type === 'Sıcaklık') || allSensors[0];
  } else if (w.cardType === 'ram') {
    primarySensor = allSensors.find(x => x.hardware.includes('Total Memory') && x.type === 'Yük')
      || allSensors.find(x => x.hardware.includes('Memory') && !x.hardware.includes('Virtual') && x.type === 'Yük') || allSensors[0];
  } else if (w.cardType === 'board') {
    primarySensor = allSensors.find(x => x.hardware.includes('NCT') && x.name === 'Temperature #1') || allSensors[0];
  } else if (w.cardType === 'psu') {
    primarySensor = allSensors.find(x => (x.hardware.includes('Ryzen') || x.hardware.includes('CPU')) && x.type === 'Güç')
      || allSensors.find(x => x.type === 'Güç') || allSensors[0];
  } else if (w.cardType === 'fans') {
    primarySensor = allSensors.find(x => x.type === 'Fan' && (x.value || 0) > 0) || allSensors.find(x => x.type === 'Fan') || allSensors[0];
  } else {
    primarySensor = state.sensorMap.get(w.sensorId) || allSensors[0];
  }

  const s = primarySensor || { id: w.id, name: w.customTitle, value: 50, formattedValue: '50' };
  let hist = state.historyMap.get(s.id) || [s.value || 0, s.value || 0];
  const matrixRows = buildLiveMatrixRows(w.cardType || 'cpu', s, allSensors);

  // PSU için toplam güç (CPU W + GPU W) geçmişini eleman bazında birleştir
  if (w.cardType === 'psu') {
    const cpuP = allSensors.find(x => (x.hardware.includes('Ryzen') || x.hardware.includes('CPU')) && x.type === 'Güç');
    const gpuP = allSensors.find(x => (x.hardware.includes('GeForce') || x.hardware.includes('NVIDIA') || x.hardware.includes('GPU')) && x.type === 'Güç');
    const cpuHist = (cpuP && state.historyMap.get(cpuP.id)) || [];
    const gpuHist = (gpuP && state.historyMap.get(gpuP.id)) || [];
    const maxLen = Math.max(cpuHist.length, gpuHist.length);
    if (maxLen > 0) {
      hist = Array.from({ length: maxLen }, (_, i) => {
        const c = cpuHist[i] ?? (cpuP?.value || 0);
        const g = gpuHist[i] ?? (gpuP?.value || 0);
        return c + g;
      });
    }
  }

  // Kart ana metriklerini özet tablonun 1. ana satırıyla (matrixRows[0]) tam eşitle
  const heroRow = matrixRows[0] || {};
  const cardVal = (heroRow.value !== undefined) ? heroRow.value : s.value;
  const cardFormattedVal = heroRow.formattedValue || s.formattedValue;
  const cardFormattedMin = heroRow.minFormatted || s.formattedMin || '-';
  const cardFormattedAvg = heroRow.avgFormatted || s.formattedAvg || '-';
  const cardFormattedMax = heroRow.maxFormatted || s.formattedMax || '-';

  return {
    id: w.id,
    cardType: w.cardType,
    sensorId: s.id,
    chartCode: 'M1',
    m1Variant: w.m1Variant || 'hybrid',
    skeleton: w.skeleton || 'S-bento',
    span: w.span || 'span-6',
    name: w.customTitle || s.name,
    hardware: s.hardware,
    type: s.type,
    value: cardVal,
    formattedValue: cardFormattedVal,
    min: s.min,
    formattedMin: cardFormattedMin,
    max: s.max,
    formattedMax: cardFormattedMax,
    avg: s.avg,
    formattedAvg: cardFormattedAvg,
    unit: parseUnit(cardFormattedVal),
    history: hist,
    matrixRows
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

  const minEl = el.querySelector('.js-min-text');
  if (minEl) minEl.textContent = data.formattedMin || '-';

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
  return state.widgets.filter(w => w.enabled !== false).map(w => buildCardDataForWidget(w));
}

function renderDashboard() {
  const grid = document.getElementById('dashboardGrid');
  if (!grid) return;

  grid.classList.remove('layout-g1-stage', 'layout-cols-1', 'layout-cols-2', 'layout-cols-3', 'layout-cols-4');
  const activeLayout = (state.layout === 'cols-3') ? 'cols-3' : 'cols-2';
  grid.classList.add(`layout-${activeLayout}`);
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
  grid.querySelectorAll('.catalog-section-header').forEach(h => h.remove());
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
      if (!el.isConnected) {
        grid.appendChild(el);
      }
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
  const cardData = state.widgets.find(w => w.id === cardId);
  if (cardData) {
    const allSensors = Array.from(state.sensorMap.values());
    openPopover(cardData, allSensors, state.mode === 'live');
  }
}

function openDrawerWithTab(tabName) {
  renderDrawerContent();
  document.getElementById('configDrawerBackdrop')?.classList.add('open');
}

function renderDrawerContent() {
  const listEl = document.getElementById('drawerContentList');
  if (!listEl) return;

  const cardLabels = {
    w_cpu: { title: 'İşlemci (CPU) Özeti', sub: 'AMD Ryzen 9 9950X · Sıcaklık, Saat, Güç, Voltaj, Yük', icon: '⚡' },
    w_gpu: { title: 'Ekran Kartı (GPU) Özeti', sub: 'NVIDIA GeForce RTX 5080 · Sıcaklık, Yük, Saat, Güç', icon: '🎮' },
    w_ram: { title: 'Bellek (RAM) & DIMM Özeti', sub: 'A-DATA DDR5 · Kullanım, Boyut, DIMM 1/2 Sıcaklıkları', icon: '🧠' },
    w_board: { title: 'Anakart (Motherboard) Özeti', sub: 'Nuvoton NCT6701D · VRM/Sistem Sıcaklığı, +3.3V, AVCC', icon: '🛡️' },
    w_psu: { title: 'Güç Tüketimi (PSU) Özeti', sub: 'Tahmini Sistem Watt, CPU/GPU Çekimi, Voltaj Rayları', icon: '🔌' },
    w_fans: { title: 'Soğutma & Fanlar (Halka HUD)', sub: '7 Kasa Fanı + 2 GPU Fanı (iOS Dairesel Halka Tasarımı)', icon: '🌀' }
  };

  listEl.innerHTML = state.widgets.map((w) => {
    const meta = cardLabels[w.id] || { title: w.customTitle, sub: 'Sabit Donanım Matrisi', icon: '📊' };
    const isEnabled = w.enabled !== false;
    return `
      <div class="sensor-pick-item" style="padding:12px 14px;border-radius:12px;background:var(--bg-card-inner, rgba(255,255,255,0.03));border:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1;">
          <span style="font-size:20px;">${meta.icon}</span>
          <div style="min-width:0;">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${meta.title}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${meta.sub}</div>
          </div>
        </div>
        <label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;">
          <input type="checkbox" class="js-toggle-fixed-card" data-widget-id="${w.id}" ${isEnabled ? 'checked' : ''} style="opacity:0;width:0;height:0;" />
          <span style="position:absolute;inset:0;background:${isEnabled ? 'var(--accent-blue)' : 'rgba(255,255,255,0.14)'};border-radius:24px;transition:0.2s;">
            <span style="position:absolute;height:18px;width:18px;left:${isEnabled ? '23px' : '3px'};bottom:3px;background:white;border-radius:50%;transition:0.2s;"></span>
          </span>
        </label>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.js-toggle-fixed-card').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const widgetId = e.target.dataset.widgetId;
      const w = state.widgets.find(x => x.id === widgetId);
      if (w) {
        w.enabled = e.target.checked;
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

    if (state.widgets.length === 0) {
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
    layoutSelect.value = state.layout || 'cols-2';
    layoutSelect.addEventListener('change', (e) => {
      state.layout = e.target.value;
      persistState();
      document.querySelectorAll('.uiv2-card').forEach(c => delete c.dataset.lastRenderWidth);
      renderDashboard();
      requestAnimationFrame(() => {
        document.querySelectorAll('.uiv2-card').forEach(c => delete c.dataset.lastRenderWidth);
        renderDashboard();
      });
    });
  }

  // Mobil Yatay ↔ Dikey Döndürme ve Ekran Boyutu Değişimi Dinleyicisi (Live Akış Kırpılma Koruması)
  let resizeDebounceTimer = null;
  const handleWindowViewportChange = () => {
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
      document.querySelectorAll('.uiv2-card').forEach(c => delete c.dataset.lastRenderWidth);
      renderDashboard();
      requestAnimationFrame(() => {
        document.querySelectorAll('.uiv2-card').forEach(c => delete c.dataset.lastRenderWidth);
        renderDashboard();
      });
    }, 70);
  };
  window.addEventListener('resize', handleWindowViewportChange, { passive: true });
  window.addEventListener('orientationchange', handleWindowViewportChange, { passive: true });

  // Çekmece Kontrolleri (Sabit Kart Yönetimi)
  const drawerBackdrop = document.getElementById('configDrawerBackdrop');
  document.getElementById('btnOpenDrawer')?.addEventListener('click', () => {
    openDrawerWithTab('active-cards');
  });
  document.getElementById('btnCloseDrawer')?.addEventListener('click', () => {
    drawerBackdrop?.classList.remove('open');
  });
  drawerBackdrop?.addEventListener('click', (e) => {
    if (e.target === drawerBackdrop) {
      drawerBackdrop.classList.remove('open');
    }
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
