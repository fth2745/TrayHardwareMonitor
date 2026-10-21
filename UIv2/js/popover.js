/* ==========================================================================
   H4: DETAY VE KART YAPILANDIRMA PENCERESİ (POPOVER — REF-3a)
   - Başlık: Seçili sensörün adı ve anlık değeri (borsa tarihi değil!)
   - İçerik: Üstte mini sparkline, sensör değiştirici, çoklu sensör seçici (needs: 'multi' için),
     grafik ve iskelet seçici, D1 ilerleme çubuklu istatistik listesi ve Kartı Kaldır (Sil) butonu.
   ========================================================================== */

import { renderSmoothLineCore } from './charts/b-lines.js';
import { CHART_POOL, getChartMeta, getNeedsLabel } from './charts/registry.js';
import { SKELETON_POOL } from './ui/h-helpers.js';

let activePopoverCardId = null;
let callbacks = {};

export function initPopover(cbs) {
  callbacks = cbs || {};

  const backdrop = document.getElementById('detailPopoverBackdrop');
  const btnClose1 = document.getElementById('btnClosePopover');
  const btnClose2 = document.getElementById('popoverBtnClose2');
  const btnDeleteCard = document.getElementById('popoverBtnDeleteCard');

  const close = () => {
    activePopoverCardId = null;
    backdrop?.classList.remove('open');
  };

  btnClose1?.addEventListener('click', close);
  btnClose2?.addEventListener('click', close);
  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  btnDeleteCard?.addEventListener('click', () => {
    if (activePopoverCardId && callbacks.onRemoveCard) {
      callbacks.onRemoveCard(activePopoverCardId);
      close();
    }
  });
}

export function openPopover(cardData, allSensors = [], isLiveMode = true) {
  activePopoverCardId = cardData.id;
  const backdrop = document.getElementById('detailPopoverBackdrop');
  if (!backdrop) return;
  renderPopoverContent(cardData, allSensors, isLiveMode, true);
  backdrop.classList.add('open');
}

export function updateOpenPopoverIfActive(cardData, allSensors = [], isLiveMode = true) {
  if (!activePopoverCardId || activePopoverCardId !== cardData.id) return;
  renderPopoverContent(cardData, allSensors, isLiveMode, false);
}

function renderPopoverContent(data, allSensors, isLiveMode, rebuildSelectors) {
  const miniBox = document.getElementById('popoverMiniChart');
  const hintEl = document.getElementById('popoverHint');
  const titleEl = document.getElementById('popoverTitle');
  const configBox = document.getElementById('popoverConfigBox');
  const listEl = document.getElementById('popoverList');
  const deleteBtn = document.getElementById('popoverBtnDeleteCard');

  if (miniBox) {
    renderSmoothLineCore(miniBox, data, { strokeMode: 'blue', showYAxis: false, showArea: true, height: 76 });
  }

  if (hintEl) {
    hintEl.textContent = `${data.hardware || 'Donanım'} · Sabit Özet Telemetri Analizi`;
  }
  if (titleEl) {
    titleEl.textContent = `${data.name} — ${data.formattedValue || '-'}`;
  }
  if (deleteBtn) {
    deleteBtn.style.display = 'none'; // Sabit kartlar popover üzerinden silinmez
  }
  if (configBox) {
    configBox.style.display = 'none'; // Seçiciler gizli
    configBox.innerHTML = '';
  }

  if (listEl) {
    if (Array.isArray(data.matrixRows) && data.matrixRows.length > 0) {
      // M1 Sabit Özet Kartı Detayı: Tüm alt sensörlerin detay listesi
      listEl.innerHTML = data.matrixRows.map((r, idx) => `
        <div class="tabular-nums" style="margin-bottom: 8px;">
          <div class="popover-row-top">
            <span>
              <strong style="opacity:0.5;font-family:var(--font-mono);margin-right:6px;">0${idx + 1}</strong>
              <span style="margin-right:4px;">${r.icon || '💠'}</span>${r.label}
            </span>
            <span class="popover-row-pct" style="color: ${r.valColor || 'var(--text-primary)'}; font-weight:600;">${r.formattedValue}</span>
          </div>
          <div class="popover-row-bar">
            <div class="popover-row-bar-fill" style="width:${Math.min(100, Math.max(4, r.pct || 0))}%; background: ${r.color || 'var(--accent-blue)'};"></div>
          </div>
        </div>
      `).join('');
    } else {
      // Standart Metrik İstatistikleri
      const val = Number.isFinite(data.value) ? data.value : 65;
      const max = Math.max(Number.isFinite(data.max) ? data.max : 100, val, 1);
      const avg = Number.isFinite(data.avg) ? data.avg : val * 0.8;
      const min = Number.isFinite(data.min) ? data.min : val * 0.5;

      const rows = [
        { no: '01', name: 'Anlık Okuma', text: data.formattedValue || '-', pct: Math.min(100, Math.max(8, (val / max) * 100)) },
        { no: '02', name: 'Kümülatif Ortalama', text: data.formattedAvg || '-', pct: Math.min(100, Math.max(8, (avg / max) * 100)) },
        { no: '03', name: 'Tepe (Maksimum)', text: data.formattedMax || '-', pct: 100 },
        { no: '04', name: 'Taban (Minimum)', text: data.formattedMin || '-', pct: Math.min(100, Math.max(8, (min / max) * 100)) }
      ];

      listEl.innerHTML = rows.map(r => `
        <div class="tabular-nums">
          <div class="popover-row-top">
            <span><strong style="opacity:0.5;font-family:var(--font-mono);margin-right:6px;">${r.no}</strong>${r.name}</span>
            <span class="popover-row-pct">${r.text}</span>
          </div>
          <div class="popover-row-bar">
            <div class="popover-row-bar-fill" style="width:${r.pct.toFixed(0)}%;"></div>
          </div>
        </div>
      `).join('');
    }
  }
}
