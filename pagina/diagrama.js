/* diagrama.js — the stock-and-flow diagram, drawn from the engine's own declaration.
   Node positions and the list of arrows are set by hand; tests/diagrama.test.mjs checks that every
   arrow is a dependency found in the equations (directly or through variables not drawn).
   Stocks are boxes, auxiliaries are pills. Loops come from Motor.LOOPS. */
const Diagrama = (() => {
  'use strict';
  // id: [x, y, short label]
  const NODES = {
    demand: [800, 62, 'Demanda de chips'], chips: [640, 62, 'Chips entregados'], install: [470, 62, 'Instalación'], lnC: [300, 62, 'Cómputo instalado'],
    lnW: [640, 128, 'Capacidad fabril'], Pb: [470, 128, 'Potencia en obra'], Pw: [300, 128, 'Potencia en operación'],
    p: [130, 232, 'Capacidad'], f: [300, 214, 'I+D automatizada'], T: [300, 276, 'Criterio de la IA'], lnL: [470, 196, 'Investigadores'],
    R: [470, 250, 'Esfuerzo de I+D'], gS: [640, 250, 'Progreso de software'], mult: [470, 322, 'Multiplicador de I+D'], lnS: [640, 322, 'Eficiencia de software'],
    aEco: [930, 388, 'Trabajo automatizable'], D3: [930, 318, 'Trabajo desplegado en IA'], Y: [930, 248, 'Ingresos'], gY: [930, 178, 'Crecimiento percibido'], lnI: [930, 100, 'Inversión'],
    gap: [130, 440, 'Brecha capacidad–seguridad'], q: [130, 520, 'Conocimiento de seguridad'], incidents: [320, 440, 'Incidentes'], Hc: [480, 440, 'Preocupación pública'],
    Gr: [640, 440, 'Regulación'], safety: [640, 520, 'Esfuerzo en seguridad'], Lam: [320, 520, 'Ventaja del líder'], race: [480, 520, 'Presión de carrera'], deal: [800, 520, 'Acuerdo internacional'],
  };
  // origin: destinations
  const ARROWS = {
    lnI: ['demand'], demand: ['chips', 'lnW'], lnW: ['chips'], chips: ['install'], Pw: ['install'], install: ['lnC'], lnC: ['Pb', 'p', 'R'], Pb: ['Pw'],
    lnS: ['p', 'gS'], p: ['f', 'T', 'aEco', 'gap'], f: ['R'], T: ['R'], lnL: ['R'], R: ['gS', 'mult'], gS: ['lnS', 'Lam'],
    aEco: ['D3'], D3: ['Y', 'gY', 'incidents'], Y: ['lnI'], gY: ['lnI'],
    q: ['gap'], gap: ['incidents'], incidents: ['Hc'], Hc: ['Gr'], Gr: ['safety', 'Pb'], race: ['safety'], deal: ['safety', 'race', 'gS'], safety: ['gS', 'q'], mult: ['q'], Lam: ['race'],
  };
  const EDGES = Object.entries(ARROWS).flatMap(([a, bs]) => bs.map(b => [a, b]));
  const BANDS = [['fisico', 'Cuellos físicos', 28, 134], ['nucleo', 'Núcleo técnico', 170, 188], ['gobernanza', 'Seguridad y gobernanza', 404, 152]];
  const W = 1040, H = 570, BH = 30;
  const width = id => Math.max(96, NODES[id][2].length * 6.1 + 22);

  function build(el, info) {
    const meta = {};
    for (const s of Motor.STOCKS) meta[s[0]] = { stock: true, unit: s[1], sector: s[2], name: s[3], eq: s[5].toString() };
    for (const a of Motor.AUX) meta[a[0]] = { stock: false, unit: a[1], sector: a[2], name: a[3], eq: a[4].toString() };
    const edges = EDGES;
    const curve = (a, b) => {
      const [x1, y1] = NODES[a], [x2, y2] = NODES[b];
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      // start and end on the box edges
      const edge = id => Math.min(Math.abs(width(id) / 2 / (ux || 1e-9)), Math.abs(BH / 2 / (uy || 1e-9)));
      const sx = x1 + ux * edge(a), sy = y1 + uy * edge(a), ex = x2 - ux * (edge(b) + 5), ey = y2 - uy * (edge(b) + 5);
      const bend = Math.min(40, len * 0.12), mx = (sx + ex) / 2 - uy * bend, my = (sy + ey) / 2 + ux * bend;
      return `M${sx.toFixed(1)},${sy.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
    };
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Diagrama de stocks y flujos del modelo"><defs><marker id="dg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" class="dg-head"/></marker></defs>`;
    for (const [id, label, y, h] of BANDS) s += `<rect class="dg-band" x="8" y="${y}" width="${id === 'gobernanza' ? 852 : 852}" height="${h}" rx="10"/><text class="dg-bandlabel" x="20" y="${y + 17}">${label}</text>`;
    s += `<rect class="dg-band" x="868" y="28" width="164" height="394" rx="10"/><text class="dg-bandlabel" x="880" y="45">Economía y empleo</text>`;
    edges.forEach(([a, b], i) => { s += `<path class="dg-edge" data-a="${a}" data-b="${b}" d="${curve(a, b)}" marker-end="url(#dg-arrow)"/>`; });
    for (const [id, [x, y, label]] of Object.entries(NODES)) {
      const st = meta[id].stock, BW = width(id);
      s += `<g class="dg-node${st ? ' dg-stock' : ''}" data-id="${id}" tabindex="0" role="button" aria-label="${label}"><rect x="${x - BW / 2}" y="${y - BH / 2}" width="${BW}" height="${BH}" rx="${st ? 3 : 15}"/><text x="${x}" y="${y + 4}" text-anchor="middle">${label}</text></g>`;
    }
    el.innerHTML = s + '</svg>';
    const svg = el.querySelector('svg');
    const clear = () => svg.querySelectorAll('.is-on,.is-dim').forEach(n => n.classList.remove('is-on', 'is-dim'));
    const light = (nodes, pairs) => {
      clear();
      svg.querySelectorAll('.dg-node').forEach(n => n.classList.add(nodes.has(n.dataset.id) ? 'is-on' : 'is-dim'));
      svg.querySelectorAll('.dg-edge').forEach(e => e.classList.add(pairs.has(e.dataset.a + '>' + e.dataset.b) ? 'is-on' : 'is-dim'));
    };
    const showNode = id => {
      const ins = edges.filter(e => e[1] === id).map(e => e[0]), outs = edges.filter(e => e[0] === id).map(e => e[1]);
      light(new Set([id, ...ins, ...outs]), new Set([...ins.map(a => a + '>' + id), ...outs.map(b => id + '>' + b)]));
      const mt = meta[id], body = mt.eq.replace(/^v\s*=>\s*/, '').replace(/\bv\./g, '').replace(/\s+/g, ' ');
      info.innerHTML = `<strong>${NODES[id][2]}</strong> · ${mt.stock ? 'stock' : 'variable auxiliar'} · ${Graficos.esc(mt.unit)}<br><span class="dg-eq">${mt.stock ? 'flujo neto = ' : ''}${Graficos.esc(body)}</span><br>Depende de: ${ins.map(a => NODES[a][2].toLowerCase()).join(', ') || 'parámetros'}.`;
    };
    svg.querySelectorAll('.dg-node').forEach(n => {
      n.addEventListener('click', () => showNode(n.dataset.id));
      n.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); showNode(n.dataset.id); } });
    });
    return {
      loop(loop) {
        if (!loop) { clear(); return; }
        const drawn = loop.path.filter(id => NODES[id]), nodes = new Set(drawn), pairs = new Set();
        for (let i = 0; i + 1 < drawn.length; i++) pairs.add(drawn[i] + '>' + drawn[i + 1]);
        light(nodes, pairs);
      },
    };
  }
  return { build, EDGES, NODES };
})();
