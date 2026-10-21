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

  const meta = getChartMeta(data.chartCode);
  if (hintEl) {
    hintEl.textContent = `${data.hardware || 'Donanım'} · ${data.type || 'Telemetri'} · ${getNeedsLabel(meta.needs)}`;
  }
  if (titleEl) {
    // Madde 8: Seçili sensörün adı ve anlık değeri
    titleEl.textContent = `${data.name} — ${data.formattedValue || '-'}`;
  }
  if (deleteBtn) {
    deleteBtn.style.display = isLiveMode ? 'inline-flex' : 'none';
  }

  if (configBox && rebuildSelectors) {
    const showMulti = meta.needs === 'multi' && isLiveMode && allSensors.length > 1;
    const secondaryIds = Array.isArray(data.secondarySensorIds) ? data.secondarySensorIds : [];

    configBox.innerHTML = `
      ${isLiveMode && allSensors.length > 0 ? `
        <div>
          <label style="font-weight:600;display:block;margin-bottom:3px;">Birincil Sensör:</label>
          <select id="popSensorSelect">
            ${allSensors.map(s => `<option value="${s.id}" ${s.id === data.sensorId ? 'selected' : ''}>${s.name} (${s.hardware} · ${s.formattedValue})</option>`).join('')}
          </select>
        </div>
      ` : ''}
      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:6px;">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:3px;">Grafik Motoru:</label>
          <select id="popChartSelect">
            ${CHART_POOL.map(c => `<option value="${c.code}" ${c.code === data.chartCode ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:3px;">Kart İskeleti:</label>
          <select id="popSkeletonSelect">
            ${SKELETON_POOL.map(s => `<option value="${s.code}" ${s.code === data.skeleton ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
      </div>
      ${showMulti ? `
        <div>
          <label style="font-weight:600;display:block;margin-bottom:3px;color:#6366F1;">Karşılaştırılacak Ek Sensörler (Çoklu Grafik):</label>
          <select id="popMultiSensorSelect" multiple size="3" style="height:64px;">
            ${allSensors.filter(s => s.id !== data.sensorId).map(s => `
              <option value="${s.id}" ${secondaryIds.includes(s.id) ? 'selected' : ''}>${s.name} (${s.formattedValue})</option>
            `).join('')}
          </select>
          <div style="font-size:10px;opacity:0.75;margin-top:2px;">Ctrl/Cmd ile birden fazla sensör seçebilirsiniz. Seçilmezse aynı donanımdaki kardeş sensörler kullanılır.</div>
        </div>
      ` : ''}
    `;

    configBox.querySelector('#popSensorSelect')?.addEventListener('change', (e) => {
      if (callbacks.onChangeSensor) {
        const updated = callbacks.onChangeSensor(data.id, e.target.value);
        if (updated) renderPopoverContent(updated, allSensors, isLiveMode, true);
      }
    });

    configBox.querySelector('#popChartSelect')?.addEventListener('change', (e) => {
      if (callbacks.onChangeChart) {
        const updated = callbacks.onChangeChart(data.id, e.target.value);
        if (updated) renderPopoverContent(updated, allSensors, isLiveMode, true);
      }
    });

    configBox.querySelector('#popSkeletonSelect')?.addEventListener('change', (e) => {
      if (callbacks.onChangeSkeleton) {
        const updated = callbacks.onChangeSkeleton(data.id, e.target.value);
        if (updated) renderPopoverContent(updated, allSensors, isLiveMode, true);
      }
    });

    configBox.querySelector('#popMultiSensorSelect')?.addEventListener('change', (e) => {
      const selected = Array.from(e.target.selectedOptions).map(o => o.value).slice(0, 4);
      if (callbacks.onChangeSecondarySensors) {
        const updated = callbacks.onChangeSecondarySensors(data.id, selected);
        if (updated) renderPopoverContent(updated, allSensors, isLiveMode, false);
      }
    });
  }

  if (listEl) {
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
