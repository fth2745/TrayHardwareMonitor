/* ==========================================================================
   B. ÇİZGİ VE EĞRİ GRAFİKLERİ (B1–B4)
   - B1: Tek Çizgi Sparkline + Beyaz Uç Nokta + 3 Seviyeli Y Ekseni
   - B2: Eşik Renk Geçişli Çizgi (Yeşil -> Turuncu -> Yeşil + Beyaz Nokta)
   - B3: Modernize Edilmiş Çift Çizgi Karşılaştırma (Kübik Bezier + Alan Gradyanı + Çift Uç Nokta)
   - B4: Satır İçi Mini Yeşil Dalga
   ========================================================================== */

const lineAnimStates = new WeakMap();

function buildSmoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const mx = (p0.x + p1.x) / 2;
    d += ` C ${mx.toFixed(2)} ${p0.y.toFixed(2)}, ${mx.toFixed(2)} ${p1.y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }
  return d;
}

export function renderSmoothLineCore(container, data, opts = {}) {
  const {
    strokeMode = 'blue',   // 'blue' | 'threshold' | 'green-mini'
    showYAxis = true,
    showArea = false,
    height = 104
  } = opts;

  const measuredW = Math.round(container.getBoundingClientRect().width || container.clientWidth || 0);
  const w = Math.max(110, measuredW || 280);
  const h = height;
  const padL = showYAxis ? 30 : 6;
  const padR = 8;
  const padT = 8;
  const padB = 10;
  const plotW = Math.max(40, w - padL - padR);
  const plotH = Math.max(20, h - padT - padB);

  const curVal = Number.isFinite(data.value) ? data.value : 55;
  let rawHist = Array.isArray(data.history) && data.history.length >= 2
    ? data.history.filter(v => Number.isFinite(v))
    : [curVal, curVal, curVal, curVal];

  if (rawHist.length < 2) {
    rawHist = [curVal, curVal];
  }

  const maxPoints = Math.min(rawHist.length, Math.max(12, Math.floor(plotW / 14)));
  const series = rawHist.slice(-maxPoints);
  const latestVal = series[series.length - 1];
  const prevVal = series.length >= 2 ? series[series.length - 2] : latestVal;

  const now = performance.now();
  let state = lineAnimStates.get(container);
  const sampleKey = `${rawHist.length}:${latestVal.toFixed(3)}`;

  // Y ekseni sınırlarını hesapla
  let targetMinV = Math.min(...series, prevVal, latestVal);
  let targetMaxV = Math.max(...series, prevVal, latestVal);
  const span = targetMaxV - targetMinV;
  if (span < 4) {
    const mid = (targetMinV + targetMaxV) / 2;
    targetMinV = mid - 2.5;
    targetMaxV = mid + 2.5;
  } else {
    targetMinV -= span * 0.12;
    targetMaxV += span * 0.12;
  }

  const uid = 'line_' + (data.id || 'cat').replace(/[^a-zA-Z0-9]/g, '') + '_' + strokeMode;
  let strokeAttr = 'var(--accent-blue)';
  let defsHtml = '';

  if (strokeMode === 'threshold') {
    strokeAttr = `url(#${uid}_thresh)`;
    defsHtml += `
      <linearGradient id="${uid}_thresh" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#22C55E" />
        <stop offset="50%" stop-color="#F97316" />
        <stop offset="100%" stop-color="#22C55E" />
      </linearGradient>
    `;
  } else if (strokeMode === 'green-mini') {
    strokeAttr = 'var(--accent-green)';
  }

  if (showArea) {
    defsHtml += `
      <linearGradient id="${uid}_area" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="var(--accent-blue)" stop-opacity="0.34" />
        <stop offset="100%" stop-color="var(--accent-blue)" stop-opacity="0.0" />
      </linearGradient>
    `;
  }

  const mapY = (v, minVal, maxVal) => padT + plotH - ((v - minVal) / Math.max(0.001, maxVal - minVal)) * plotH;

  const targetDotX = padL + plotW;
  const targetDotY = mapY(latestVal, targetMinV, targetMaxV);

  if (!state) {
    state = {
      fromVal: prevVal,
      curVal: latestVal,
      toVal: latestVal,
      dotCurX: targetDotX,
      dotCurY: targetDotY,
      dotStartX: targetDotX,
      dotStartY: targetDotY,
      targetDotX,
      targetDotY,
      curMinV: targetMinV,
      curMaxV: targetMaxV,
      sampleKey,
      startTime: now,
      duration: 980,
      rafId: null,
      renderedW: w
    };
    lineAnimStates.set(container, state);
  } else {
    const widthChanged = Math.abs((state.renderedW || w) - w) >= 4;
    if (widthChanged) {
      // Çapraz düzen geçişinde (Simetrik <-> Mozaik) genişlik değiştiğinde durumu yeni genişliğe resetle
      state.renderedW = w;
      state.dotCurX = targetDotX;
      state.dotStartX = targetDotX;
      state.targetDotX = targetDotX;
      state.dotCurY = targetDotY;
      state.dotStartY = targetDotY;
      state.targetDotY = targetDotY;
      state.fromVal = latestVal;
      state.toVal = latestVal;
      state.curVal = latestVal;
      state.curMinV = targetMinV;
      state.curMaxV = targetMaxV;
      state.sampleKey = sampleKey;
      state.startTime = now;
    } else if (state.sampleKey !== sampleKey) {
      // Yeni veri geldi: Eski koordinattan yeni hedefe doğru pürüzsüz süzülme başlat
      state.fromVal = Number.isFinite(state.curVal) ? state.curVal : prevVal;
      state.toVal = latestVal;
      state.dotStartX = Number.isFinite(state.dotCurX) ? state.dotCurX : targetDotX;
      state.dotStartY = Number.isFinite(state.dotCurY) ? state.dotCurY : targetDotY;
      state.targetDotX = targetDotX;
      state.targetDotY = targetDotY;
      state.sampleKey = sampleKey;
      state.startTime = now;
    }
  }

  if (state.rafId) cancelAnimationFrame(state.rafId);

  // Kalıcı DOM: SVG önceden varsa sıfırdan innerHTML yapma, DOM'u koru; genişlik değiştiğinde viewBox ve ızgara güncelle
  let svgEl = container.querySelector('svg.live-line-svg');
  const prevSvgW = Number(svgEl?.dataset?.w || 0);
  const isWidthDiff = !svgEl || Math.abs(prevSvgW - w) >= 4;

  if (!svgEl || isWidthDiff) {
    const gridCount = Math.max(4, Math.min(10, Math.floor(plotW / 65)));
    let gridCols = '';
    for (let i = 0; i <= gridCount; i++) {
      const gx = padL + (i / gridCount) * plotW;
      gridCols += `<line x1="${gx.toFixed(1)}" y1="${padT}" x2="${gx.toFixed(1)}" y2="${padT + plotH}" stroke="var(--grid-line)" stroke-width="1" />`;
    }

    container.innerHTML = `
      <svg class="live-line-svg" data-w="${w}" width="100%" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible;">
        <defs>${defsHtml}</defs>
        <g class="js-grid-lines">${gridCols}</g>
        <g class="js-y-axis-labels"></g>
        ${showArea ? `<path class="js-area-path" fill="url(#${uid}_area)" />` : ''}
        <path class="js-line-path" fill="none" stroke="${strokeAttr}" stroke-width="2.3" stroke-linecap="round" />
        <circle class="js-lead-halo" r="7" fill="rgba(255,255,255,0.16)" />
        <circle class="js-lead-dot" r="4.2" fill="#FFFFFF" stroke="${strokeMode === 'threshold' ? '#22C55E' : strokeMode === 'green-mini' ? 'var(--accent-green)' : 'var(--accent-blue)'}" stroke-width="2.2" />
      </svg>
    `;
    svgEl = container.querySelector('svg.live-line-svg');
  }

  const pathEl = svgEl.querySelector('.js-line-path');
  const areaEl = svgEl.querySelector('.js-area-path');
  const dotEl = svgEl.querySelector('.js-lead-dot');
  const haloEl = svgEl.querySelector('.js-lead-halo');
  const yLabelsGroup = svgEl.querySelector('.js-y-axis-labels');

  if (yLabelsGroup && showYAxis) {
    const midV = (targetMinV + targetMaxV) / 2;
    yLabelsGroup.innerHTML = `
      <text x="2" y="${padT + 5}" fill="var(--text-muted)" font-size="9.5" font-family="var(--font-mono)">${targetMaxV.toFixed(0)}</text>
      <text x="2" y="${padT + plotH / 2 + 3}" fill="var(--text-muted)" font-size="9.5" font-family="var(--font-mono)">${midV.toFixed(0)}</text>
      <text x="2" y="${padT + plotH}" fill="var(--text-muted)" font-size="9.5" font-family="var(--font-mono)">${targetMinV.toFixed(0)}</text>
    `;
  }

  const animateFrame = (ts) => {
    const elapsed = ts - state.startTime;
    const rawT = Math.min(1, Math.max(0, elapsed / state.duration));
    const easeT = 1 - Math.pow(1 - rawT, 3);

    // Değer ve dikey ölçek yumuşatması
    const interpVal = state.fromVal + (state.toVal - state.fromVal) * easeT;
    state.curVal = interpVal;
    state.curMinV += (targetMinV - state.curMinV) * 0.12;
    state.curMaxV += (targetMaxV - state.curMaxV) * 0.12;

    // Noktanın eski X, Y'sinden yeni hedef X, Y'sine pürüzsüz süzülüşü (kesinlikle snap yapmaz)
    const dotX = state.dotStartX + (state.targetDotX - state.dotStartX) * easeT;
    const dotY = state.dotStartY + (state.targetDotY - state.dotStartY) * easeT;
    state.dotCurX = dotX;
    state.dotCurY = dotY;

    const n = series.length;
    const pts = [];
    for (let idx = 0; idx < n - 1; idx++) {
      const v = series[idx];
      const xRatio = idx / Math.max(1, n - 1);
      pts.push({
        x: padL + xRatio * plotW,
        y: mapY(v, state.curMinV, state.curMaxV)
      });
    }

    // Çizginin son noktası doğrudan süzülen noktanın koordinatına bağlanır
    pts.push({ x: dotX, y: dotY });

    const dStr = buildSmoothPath(pts);

    if (pathEl) pathEl.setAttribute('d', dStr);
    if (areaEl && pts.length >= 2) {
      const baseLine = padT + plotH;
      areaEl.setAttribute('d', `${dStr} L ${dotX.toFixed(2)} ${baseLine} L ${pts[0].x.toFixed(2)} ${baseLine} Z`);
    }
    if (dotEl) {
      dotEl.setAttribute('cx', dotX.toFixed(2));
      dotEl.setAttribute('cy', dotY.toFixed(2));
    }
    if (haloEl) {
      haloEl.setAttribute('cx', dotX.toFixed(2));
      haloEl.setAttribute('cy', dotY.toFixed(2));
    }

    if (rawT < 1 && container.isConnected) {
      state.rafId = requestAnimationFrame(animateFrame);
    }
  };

  state.rafId = requestAnimationFrame(animateFrame);
}

/**
 * B1 — Tek Çizgi Sparkline + Beyaz Uç Nokta + 3 Seviyeli Y Ekseni (needs: 'single')
 */
export function renderB1(container, data) {
  renderSmoothLineCore(container, data, { strokeMode: 'blue', showYAxis: true, showArea: false });
}

/**
 * B2 — Eşik Renk Geçişli Çizgi (Yeşil -> Turuncu -> Yeşil + Beyaz Uç Nokta, needs: 'single')
 */
export function renderB2(container, data) {
  renderSmoothLineCore(container, data, { strokeMode: 'threshold', showYAxis: false, showArea: false });
}

/**
 * B3 — Modernize Edilmiş Çift Çizgi Karşılaştırma Grafiği (needs: 'multi')
 * - Her iki çizgi kübik Bezier eğrisiyle çizilir
 * - Birincil eğrinin altında yarı saydam mor gradyan dolgusu
 * - İki serinin ucunda da parlayan canlı nokta
 * - Sağ üstte iki kanal arası delta (fark) rozeti
 */
export function renderB3(container, data) {
  const w = Math.max(180, Math.round(container.clientWidth || 300));
  const h = 104;
  const padL = 10;
  const padR = 14;
  const padT = 12;
  const padB = 14;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const actual = (Array.isArray(data.history) && data.history.length >= 3)
    ? data.history.slice(-24)
    : [38, 44, 42, 52, 49, 60, 58, 64, 62, 69];

  const peer = Array.isArray(data.multiSensors) && data.multiSensors.length >= 2
    ? data.multiSensors[1]
    : null;

  const expected = peer && Array.isArray(peer.history) && peer.history.length >= 3
    ? peer.history.slice(-actual.length)
    : actual.map((v, i) => (Number.isFinite(data.avg) ? data.avg : v * 0.88) + Math.sin(i * 0.6) * 2.0);

  const all = actual.concat(expected);
  let minV = Math.min(...all);
  let maxV = Math.max(...all);
  if (maxV - minV < 4) { minV -= 2; maxV += 2; }

  const mapPt = (arr) => arr.map((v, i) => ({
    x: padL + (i / Math.max(1, arr.length - 1)) * plotW,
    y: padT + plotH - ((v - minV) / Math.max(0.001, maxV - minV)) * plotH
  }));

  const ptsActual = mapPt(actual);
  const ptsExpected = mapPt(expected);

  const dActual = buildSmoothPath(ptsActual);
  const dExpected = buildSmoothPath(ptsExpected);

  const lastActual = ptsActual[ptsActual.length - 1];
  const lastExpected = ptsExpected[ptsExpected.length - 1];

  const valActual = actual[actual.length - 1];
  const valExpected = expected[expected.length - 1];
  const diff = valActual - valExpected;
  const diffSign = diff >= 0 ? '+' : '';
  const diffText = `Δ ${diffSign}${diff.toFixed(1)}`;

  const secondLabel = peer ? peer.name : 'Ortalama Baz';
  const uid = 'b3_' + (data.id || 'cat').replace(/[^a-zA-Z0-9]/g, '');

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:5px;width:100%;">
      <div style="display:flex;gap:10px;font-size:10.5px;color:var(--text-secondary);justify-content:space-between;align-items:center;">
        <span class="delta-chip ${diff >= 0 ? 'up' : 'down'}" style="font-size:10px;padding:1px 7px;">${diffText}</span>
        <div style="display:flex;gap:10px;">
          <span><strong style="color:var(--accent-purple);">━━</strong> ${data.name || 'Anlık'}</span>
          <span><strong style="color:var(--accent-indigo);">╌╌</strong> ${secondLabel}</span>
        </div>
      </div>
      <svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible;">
        <defs>
          <linearGradient id="${uid}_area" x1="0" y1="0" x2="0" y2="100%">
            <stop offset="0%" stop-color="var(--accent-purple)" stop-opacity="0.28" />
            <stop offset="100%" stop-color="var(--accent-purple)" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        <!-- İkincil / Baz Çizgisi (Kesikli İndigo) -->
        <path d="${dExpected}" fill="none" stroke="var(--accent-indigo)" stroke-width="2" stroke-dasharray="5 4" opacity="0.82" />
        <circle cx="${lastExpected.x.toFixed(1)}" cy="${lastExpected.y.toFixed(1)}" r="3.5" fill="var(--accent-indigo)" />

        <!-- Birincil Çizgi Alanı + Eğrisi -->
        <path d="${dActual} L ${lastActual.x.toFixed(1)} ${padT + plotH} L ${ptsActual[0].x.toFixed(1)} ${padT + plotH} Z" fill="url(#${uid}_area)" />
        <path d="${dActual}" fill="none" stroke="var(--accent-purple)" stroke-width="2.5" stroke-linecap="round" />

        <!-- Canlı Parlayan Uç Nokta -->
        <circle cx="${lastActual.x.toFixed(1)}" cy="${lastActual.y.toFixed(1)}" r="7" fill="rgba(168,85,247,0.25)" />
        <circle cx="${lastActual.x.toFixed(1)}" cy="${lastActual.y.toFixed(1)}" r="4.2" fill="#FFFFFF" stroke="var(--accent-purple)" stroke-width="2.2" />
      </svg>
    </div>
  `;
}

/**
 * B4 — Satır İçi Mini Sparkline (needs: 'single')
 */
export function renderB4(container, data) {
  renderSmoothLineCore(container, data, { strokeMode: 'green-mini', showYAxis: false, showArea: false, height: 56 });
}
