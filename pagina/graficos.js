/* graficos.js — small SVG charts with no dependencies: a line chart with bands and a dot-interval chart.
   Colors come from CSS custom properties, so both themes work. One y-axis per chart. */
const Graficos = (() => {
  'use strict';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // English numeric convention in both languages; two or three significant figures.
  function num(x, sig) {
    if (x === null || x === undefined || !Number.isFinite(x)) return 's/d';
    sig = sig || 2;
    const a = Math.abs(x);
    if (a >= 1e9) return num(x / 1e9, sig) + ' mil M';
    if (a >= 1e6) return num(x / 1e6, sig) + ' M';
    if (a === 0) return '0';
    const mag = Math.floor(Math.log10(a)), dec = Math.max(0, sig - 1 - mag);
    const r = Number(x.toPrecision(sig));
    return r.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: Math.min(dec, 4) });
  }
  const PARTS = ['principios', 'mediados', 'fines'];
  // A decimal year as "mediados de 2028": the model does not resolve months.
  function fecha(t) {
    if (t === null || t === undefined || !Number.isFinite(t)) return 'después de 2040';
    const y = Math.floor(t);
    return `${PARTS[Math.min(2, Math.floor((t - y) * 3))]} de ${y}`;
  }
  const pct = p => (p === null || p === undefined ? 's/d' : p < 0.01 ? 'menos de 1%' : p > 0.99 ? 'más de 99%' : Math.round(p * 100) + '%');

  // Axis labels: compact above ten thousand so they fit the margin.
  const tick = v => (Math.abs(v) >= 1e9 ? num(v / 1e9) + ' mil M' : Math.abs(v) >= 1e6 ? num(v / 1e6) + ' M' : Math.abs(v) >= 1e4 ? num(v / 1e3) + ' mil' : num(v));
  function ticksLinear(lo, hi, n) {
    const step0 = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(step0))), f = step0 / mag;
    const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag, out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toPrecision(10));
    return out;
  }
  function ticksLog(lo, hi) {
    const a = Math.ceil(Math.log10(lo) - 1e-9), b = Math.floor(Math.log10(hi) + 1e-9), every = Math.max(1, Math.ceil((b - a + 1) / 5)), out = [];
    for (let k = a; k <= b; k += every) out.push(Math.pow(10, k));
    return out;
  }

  /* cfg: { title, unit, x: [years], bands: [{lo, hi}], lines: [{name, values, color, dash, width}],
            log, yMin, yMax, ref: {y, label}, marks: [{x, y, lo, hi, name}], note } */
  function lineas(el, cfg) {
    const W = Math.max(280, el.clientWidth || 320), H = cfg.height || 200, m = { l: 46, r: 12, t: 8, b: 24 };
    const x0 = cfg.x[0], x1 = cfg.x[cfg.x.length - 1];
    const all = [];
    for (const l of cfg.lines) for (const v of l.values) if (Number.isFinite(v)) all.push(v);
    for (const b of cfg.bands || []) { for (const v of b.lo) if (Number.isFinite(v)) all.push(v); for (const v of b.hi) if (Number.isFinite(v)) all.push(v); }
    for (const k of cfg.marks || []) all.push(k.lo ?? k.y, k.hi ?? k.y);
    let lo = cfg.yMin ?? Math.min(...all), hi = cfg.yMax ?? Math.max(...all);
    if (cfg.log) { lo = Math.max(lo, cfg.floor || 1e-6); hi = Math.max(hi, lo * 10); } else if (hi - lo < 1e-9) hi = lo + 1;
    const ty = v => (cfg.log ? Math.log10(Math.min(Math.max(v, lo), hi)) : Math.min(Math.max(v, lo), hi));
    const a = ty(lo), b = ty(hi);
    const X = t => m.l + (t - x0) / (x1 - x0) * (W - m.l - m.r), Y = v => H - m.b - (ty(v) - a) / (b - a) * (H - m.t - m.b);
    const path = vals => vals.map((v, i) => (Number.isFinite(v) ? `${i ? 'L' : 'M'}${X(cfg.x[i]).toFixed(1)},${Y(v).toFixed(1)}` : '')).join('');
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(cfg.title)}">`;
    for (const v of cfg.log ? ticksLog(lo, hi) : ticksLinear(lo, hi, 4)) {
      s += `<line class="g-grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="g-tick" x="${m.l - 6}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end">${tick(v)}</text>`;
    }
    const stepX = x1 - x0 > 16 ? 5 : x1 - x0 > 6 ? 2 : 1;
    for (let t = Math.ceil(x0); t <= x1; t += stepX) s += `<text class="g-tick" x="${X(t).toFixed(1)}" y="${H - 6}" text-anchor="middle">${t}</text>`;
    (cfg.bands || []).forEach((bd, i) => {
      const up = bd.hi.map((v, j) => `${X(cfg.x[j]).toFixed(1)},${Y(v).toFixed(1)}`), dn = bd.lo.map((v, j) => `${X(cfg.x[j]).toFixed(1)},${Y(v).toFixed(1)}`).reverse();
      s += `<polygon class="g-band g-band${i}" points="${up.concat(dn).join(' ')}"/>`;
    });
    if (cfg.ref) s += `<line class="g-ref" x1="${m.l}" x2="${W - m.r}" y1="${Y(cfg.ref.y).toFixed(1)}" y2="${Y(cfg.ref.y).toFixed(1)}"/><text class="g-reflabel" x="${W - m.r - 2}" y="${(Y(cfg.ref.y) - 4).toFixed(1)}" text-anchor="end">${esc(cfg.ref.label)}</text>`;
    for (const l of cfg.lines) s += `<path class="g-line" d="${path(l.values)}" style="stroke:${l.color};stroke-width:${l.width || 2}${l.dash ? ';stroke-dasharray:' + l.dash : ''}"/>`;
    for (const k of cfg.marks || []) {
      if (k.lo !== undefined) s += `<line class="g-whisker" x1="${X(k.x).toFixed(1)}" x2="${X(k.x).toFixed(1)}" y1="${Y(k.lo).toFixed(1)}" y2="${Y(k.hi).toFixed(1)}"/>`;
      s += `<circle class="g-mark" cx="${X(k.x).toFixed(1)}" cy="${Y(k.y).toFixed(1)}" r="4"><title>${esc(k.name)}: ${num(k.y, 3)}</title></circle>`;
    }
    s += `<line class="g-cross" y1="${m.t}" y2="${H - m.b}" x1="0" x2="0" visibility="hidden"/><rect class="g-hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/></svg>`;
    const legend = cfg.lines.filter(l => l.name).map(l => `<span><i style="background:${l.color}"></i>${esc(l.name)}</span>`).join('') + ((cfg.bands || []).length ? '<span><i class="g-key-band"></i>Corridas ponderadas, 10–90%</span>' : '') + ((cfg.marks || []).length ? '<span><i class="g-key-mark"></i>Medido</span>' : '');
    el.innerHTML = `<div class="g-head"><strong>${esc(cfg.title)}</strong><span>${esc(cfg.unit || '')}</span></div>${s}<div class="g-legend">${legend}</div><div class="g-tip" hidden></div>`;
    const svg = el.querySelector('svg'), cross = el.querySelector('.g-cross'), tip = el.querySelector('.g-tip');
    const move = ev => {
      const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width;
      const t = Math.min(x1, Math.max(x0, x0 + (px - m.l) / (W - m.l - m.r) * (x1 - x0)));
      const i = Math.round((t - x0) / (x1 - x0) * (cfg.x.length - 1));
      cross.setAttribute('x1', X(cfg.x[i])); cross.setAttribute('x2', X(cfg.x[i])); cross.setAttribute('visibility', 'visible');
      const rows = cfg.lines.filter(l => l.name).map(l => `<div><i style="background:${l.color}"></i>${esc(l.name)} <b>${num(l.values[i], 3)}</b></div>`);
      if ((cfg.bands || []).length) rows.push(`<div><i class="g-key-band"></i>10–90% <b>${num(cfg.bands[0].lo[i], 3)} – ${num(cfg.bands[0].hi[i], 3)}</b></div>`);
      tip.innerHTML = `<div class="g-tip-t">${fecha(cfg.x[i])}</div>${rows.join('')}`;
      tip.hidden = false;
      tip.style.left = Math.min(r.width - 170, Math.max(0, X(cfg.x[i]) * r.width / W + 10)) + 'px';
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; });
  }

  /* Dot-interval chart: one row per item, an interval (10–90%) with its median, plus colored dots per series.
     cfg: { rows: [{label, lo, mid, hi, dots: [{x, color, name}]}], x0, x1, title } */
  function intervalos(el, cfg) {
    const W = Math.max(300, el.clientWidth || 320), rowH = 34, labelW = Math.min(230, W * 0.42), m = { l: labelW, r: 16, t: 22, b: 8 };
    const H = m.t + cfg.rows.length * rowH + m.b;
    const X = t => m.l + (Math.min(Math.max(t, cfg.x0), cfg.x1) - cfg.x0) / (cfg.x1 - cfg.x0) * (W - m.l - m.r);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(cfg.title)}">`;
    const step = W - m.l < 300 ? 4 : 2;
    for (let t = Math.ceil(cfg.x0); t <= cfg.x1; t += step) s += `<line class="g-grid" x1="${X(t)}" x2="${X(t)}" y1="${m.t - 4}" y2="${H - m.b}"/><text class="g-tick" x="${X(t)}" y="12" text-anchor="middle">${t}</text>`;
    cfg.rows.forEach((r, i) => {
      const y = m.t + i * rowH + rowH / 2;
      const words = r.label.split(' '), lines = [''];
      for (const w of words) { if ((lines[lines.length - 1] + ' ' + w).length > labelW / 6.3 && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim(); }
      lines.slice(0, 2).forEach((ln, j) => { s += `<text class="g-rowlabel" x="${m.l - 12}" y="${y + 4 + (j - (Math.min(lines.length, 2) - 1) / 2) * 13}" text-anchor="end">${esc(ln)}</text>`; });
      if (r.lo !== null) {
        const hi = r.hi === null ? cfg.x1 : r.hi;
        s += `<line class="g-interval" x1="${X(r.lo)}" x2="${X(hi)}" y1="${y}" y2="${y}"><title>10–90%: ${fecha(r.lo)} a ${fecha(r.hi)}</title></line>`;
        if (r.hi === null) s += `<path class="g-median" d="M${X(hi) + 5},${y - 6} l7,6 l-7,6 z"><title>Sigue después de ${cfg.x1}</title></path>`;
        if (r.mid !== null) s += `<rect class="g-median" x="${X(r.mid) - 2}" y="${y - 9}" width="4" height="18" rx="1"><title>Mediana: ${fecha(r.mid)}</title></rect>`;
      }
      for (const d of r.dots || []) if (d.x !== undefined && d.x !== null && d.x <= cfg.x1) s += `<circle class="g-dot" cx="${X(d.x)}" cy="${y}" r="5" style="fill:${d.color}"><title>${esc(d.name)}: ${fecha(d.x)}</title></circle>`;
    });
    el.innerHTML = s + '</svg>';
  }

  return { lineas, intervalos, num, fecha, pct, esc };
})();
