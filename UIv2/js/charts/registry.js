/* ==========================================================================
   16 SEÇKİN GRAFİK MOTORU KAYIT DEFTERİ
   A6, B1, B2, B3, B4, C1, C4, C7, D1, E1, E2, E3, F1, G1, X2, X3
   ========================================================================== */

import { renderA6 } from './a-gauges.js';
import { renderB1, renderB2, renderB3, renderB4 } from './b-lines.js';
import { renderC1, renderC4, renderC7 } from './c-bars.js';
import { renderD1 } from './d-progress.js';
import { renderE1, renderE2, renderE3 } from './e-compare.js';
import { renderF1 } from './f-heatmap.js';
import { renderG1 } from './g-lists.js';
import { renderX2, renderX3 } from './x-sensor-extra.js';
import { renderSummaryMatrix } from './m-matrix.js';

export const CHART_POOL = [
  // M. Bento Telemetri Özet Tablosu (CPU/GPU)
  { code: 'M1', refSource: 'REF-2', needs: 'multi',  name: 'M1 · Donanım Telemetri Özet Tablosu', render: renderSummaryMatrix },

  // A. Kadran (1)
  { code: 'A6', refSource: 'REF-2', needs: 'single', name: 'A6 · Saat Kadranı + Kanat Metrikler', render: renderA6 },

  // B. Çizgi ve Eğri Grafikleri (4)
  { code: 'B1', refSource: 'REF-2', needs: 'single', name: 'B1 · Tek Çizgi Sparkline + Beyaz Uç Nokta', render: renderB1 },
  { code: 'B2', refSource: 'REF-2', needs: 'single', name: 'B2 · Eşik Renk Geçişli Çizgi (Yeşil→Turuncu)', render: renderB2 },
  { code: 'B3', refSource: 'REF-3', needs: 'multi',  name: 'B3 · Modern Çift Çizgi Karşılaştırma', render: renderB3 },
  { code: 'B4', refSource: 'REF-4', needs: 'single', name: 'B4 · Satır İçi Mini Yeşil Dalga', render: renderB4 },

  // C. Çubuk ve Kapsül Grafikleri (3)
  { code: 'C1', refSource: 'REF-1', needs: 'multi',  name: 'C1 · Yatay Noktalı İz Çubukları', render: renderC1 },
  { code: 'C4', refSource: 'REF-2', needs: 'single', name: 'C4 · 2×2 Yatay Kapsül Izgarası', render: renderC4 },
  { code: 'C7', refSource: 'REF-4', needs: 'multi',  name: 'C7 · Üç Durumlu Çubuk + 3 Özet Kutu', render: renderC7 },

  // D. Hibrit İlerleme (1)
  { code: 'D1', refSource: 'REF-3', needs: 'single', name: 'D1 · Hibrit Modern İlerleme & Kapasite Barı', render: renderD1 },

  // E. Aralık, Radar ve Zaman Çizelgesi (3)
  { code: 'E1', refSource: 'REF-1', needs: 'single', name: 'E1 · İki Nokta Aralık Göstergesi (Modern)', render: renderE1 },
  { code: 'E2', refSource: 'REF-1', needs: 'multi',  name: 'E2 · Beşgen Radar Grafik (Modern)', render: renderE2 },
  { code: 'E3', refSource: 'REF-1', needs: 'single', name: 'E3 · Nokta Dizisi Zaman Çizelgesi (Modern)', render: renderE3 },

  // F. Yoğunluk / Isı Haritası (1)
  { code: 'F1', refSource: 'REF-4', needs: 'single', name: 'F1 · 9 Kademeli Keskin Termal Altıgen Petek', render: renderF1 },

  // G. Liste Grafiği (1)
  { code: 'G1', refSource: 'REF-2', needs: 'multi',  name: 'G1 · Sıralı Değişim Listesi + Delta', render: renderG1 },

  // X. Ekstra Çoklu Sensör ve Histogram (2)
  { code: 'X2', refSource: 'EXTRA', needs: 'multi',  name: 'X2 · Çoklu Sensör Bindirmeli Çizgi (Modern)', render: renderX2 },
  { code: 'X3', refSource: 'EXTRA', needs: 'single', name: 'X3 · Değer Dağılım Histogramı (Modern)', render: renderX3 }
];

const CHART_MAP = new Map(CHART_POOL.map(c => [c.code, c]));

// Eski grafik kodlarının yeni 16'lık havuza otomatik dönüşümü
const CHART_MIGRATIONS = {
  'A1': 'A6',
  'A2': 'A6',
  'A3': 'A6',
  'A4': 'A6',
  'A5': 'A6',
  'C2': 'C7',
  'C3': 'C7',
  'C5': 'C1',
  'C6': 'C1',
  'D2': 'D1',
  'D3': 'D1',
  'G2': 'G1',
  'G3': 'G1',
  'G4': 'G1',
  'X1': 'B1',
  'X4': 'E1'
};

export function normalizeChartCode(code) {
  if (CHART_MAP.has(code)) return code;
  if (CHART_MIGRATIONS[code]) return CHART_MIGRATIONS[code];
  return 'B1';
}

export function getChartRenderer(code) {
  const norm = normalizeChartCode(code);
  return CHART_MAP.get(norm)?.render || renderB1;
}

export function getChartMeta(code) {
  const norm = normalizeChartCode(code);
  return CHART_MAP.get(norm) || CHART_POOL[1]; // B1
}

export function getNeedsLabel(needs) {
  if (needs === 'multi') return 'Çoklu Sensör';
  if (needs === 'derived') return 'Türetilmiş';
  return 'Tek Sensör';
}
