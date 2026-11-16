/* app.js — wires the page: diagram, explorer, where-we-are, milestones, forecasts, method tables.
   DATA is injected by build.mjs; Motor, Graficos and Diagrama are inlined before this file. */
(() => {
  'use strict';
  const { num, fecha, pct, esc } = Graficos;
  const $ = id => document.getElementById(id);
  const SC_IDS = Object.keys(DATA.esc);
  const color = id => `var(--s${SC_IDS.indexOf(id) + 1})`;
  const scName = id => DATA.esc[id].nombre;
  const dot = id => `<i class="sw" style="background:${color(id)}"></i>`;
  const grid = DATA.mc.grilla;
  const band = (id, q) => DATA.mc.bandas[id].map(r => r[q]);

  /* ------------------------------------------------------------ theme */
  const root = document.documentElement;
  let stored = null;
  try { stored = localStorage.getItem('tema'); } catch (e) { /* storage may be blocked */ }
  root.dataset.theme = stored || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  $('tema').addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('tema', root.dataset.theme); } catch (e) { /* ignore */ }
  });

  /* ------------------------------------------------------------ diagram */
  const LOOP_TEXT = {
    R1: 'Más eficiencia de software sube la capacidad, la capacidad automatiza más I+D y la I+D mejora el software. Es el lazo de AI 2027 y de AI Futures; su ganancia decide si la aceleración se sostiene sola.',
    R2: 'La capacidad se despliega en la economía, los ingresos financian inversión y la inversión compra cómputo. Sostiene el crecimiento del cómputo aunque el lazo de software no cierre.',
    R3: 'Cuanto más rápido avanza el líder y menos ventaja conserva, más presión de carrera y menos esfuerzo en seguridad. Es la dinámica del final de carrera de AI 2027.',
    B1: 'Cada mejora de software cuesta más que la anterior. Con β alto, el progreso se frena salvo que crezcan el cómputo y el plantel. Es el freno central del modelo simple de METR.',
    B2: 'La I+D necesita experimentos, y los experimentos necesitan cómputo. Si cómputo y trabajo son complementos, automatizar el trabajo rinde cada vez menos.',
    B3: 'El cómputo instalado no puede superar lo que entregan las fábricas ni lo que admite la potencia en operación, y la obra eléctrica demora unos dos años.',
    B4: 'La brecha entre capacidad y seguridad produce incidentes, los incidentes preocupación y la preocupación regulación, que exige seguridad y frena obras. Es la palanca que Plan A adelanta con un acuerdo.',
  };
  const dg = Diagrama.build($('diagrama'), $('diagrama-info'));
  $('lazos').innerHTML = Motor.LOOPS.map(l => `<button type="button" data-id="${l.id}" aria-pressed="false"><b>${l.id}</b> ${esc(l.name)}</button>`).join('');
  $('lazos').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    $('lazos').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', on);
    const loop = Motor.LOOPS.find(l => l.id === b.dataset.id);
    dg.loop(on ? loop : null);
    $('diagrama-info').innerHTML = on ? `<strong>${loop.id} · ${esc(loop.name)}</strong> · lazo ${loop.kind === 'R' ? 'de refuerzo' : 'de balance'}<br>${LOOP_TEXT[loop.id]}` : 'Cada caja es un stock y cada píldora una variable auxiliar. Tocar una muestra su ecuación.';
  });

  /* ------------------------------------------------------------ explorer */
  const CHARTS = [
    { id: 'mult', title: 'Multiplicador de progreso de la I+D', unit: 'veces · escala logarítmica', log: true, yMin: 1, yMax: 1e6 },
    { id: 'gain', title: 'Ganancia del lazo de automejora', unit: 'adimensional', yMin: 0, yMax: 3, ref: { y: 1, label: 'autosostenido' } },
    { id: 'f', title: 'I+D de IA automatizada', unit: 'fracción', yMin: 0, yMax: 1 },
    { id: 'C', title: 'Cómputo instalado', unit: 'millones de H100e · logarítmica', log: true, yMin: 10 },
    { id: 'Pw', title: 'Potencia en operación', unit: 'GW · logarítmica', log: true, yMin: 10 },
    { id: 'Y', title: 'Ingresos de los laboratorios', unit: 'miles de millones de USD por año · logarítmica', log: true, yMin: 10 },
    { id: 'D3', title: 'Trabajo cognitivo desplegado en IA', unit: 'fracción', yMin: 0, yMax: 1 },
    { id: 'gap', title: 'Brecha entre capacidad y seguridad', unit: 'órdenes de magnitud' },
    { id: 'Gr', title: 'Regulación vigente', unit: 'fracción', yMin: 0, yMax: 1 },
  ];
  // id: [min, max, step]
  const SLIDERS = { f0: [0.2, 0.97, 0.01], width: [0.2, 1.8, 0.05], rhoTasks: [-8, -0.3, 0.1], laborShare: [0.1, 0.7, 0.01], sigma: [0.3, 2.6, 0.05], beta: [0.3, 1.2, 0.01], taste: [1, 8, 0.1], tauDif: [1, 25, 0.5] };
  const DEALS = { '': 'Sin acuerdo', 2027.5: 'Acuerdo a mediados de 2027', 2029.2: 'Acuerdo en marzo de 2029', 2031: 'Acuerdo en 2031' };
  const PRESETS = Object.assign({ central: { nombre: 'Central ponderado', tesis: 'Mediana de cada parámetro después de ponderar las corridas por lo observado en 2026.', params: DATA.mc.central } }, DATA.esc);
  const state = { preset: 'central', params: {} };

  $('presets').innerHTML = Object.entries(PRESETS).map(([id, s]) => `<button type="button" data-id="${id}" aria-pressed="false">${id === 'central' ? '' : dot(id)}${esc(s.nombre)}</button>`).join('');
  $('perillas').innerHTML = Object.entries(SLIDERS).map(([id, [lo, hi, step]]) => `<label><span>${esc(Motor.PARAMS[id][3])}</span><output id="o-${id}"></output><input type="range" id="s-${id}" min="${lo}" max="${hi}" step="${step}"></label>`).join('') +
    `<label><span>${esc(Motor.PARAMS.dealT[3])}</span><select id="s-deal">${Object.entries(DEALS).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>`;

  function setPreset(id) {
    state.preset = id;
    state.params = Object.assign(Motor.defaults(), PRESETS[id].params);
    $('presets').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id));
    for (const k in SLIDERS) $('s-' + k).value = Math.min(SLIDERS[k][1], Math.max(SLIDERS[k][0], state.params[k]));
    const d = state.params.dealT;
    $('s-deal').value = d === null ? '' : Object.keys(DEALS).reduce((a, b) => (b && Math.abs(b - d) < Math.abs((a || 9999) - d) ? b : a), '');
    $('tesis').textContent = PRESETS[id].tesis;
    draw();
  }
  let pending = false;
  function draw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      for (const k in SLIDERS) $('o-' + k).textContent = num(state.params[k], 3);
      const r = Motor.run(state.params, { tEnd: 2040 });
      const lineColor = state.preset === 'central' ? 'var(--pd-primary)' : color(state.preset);
      for (const c of CHARTS) {
        Graficos.lineas($('c-' + c.id), Object.assign({}, c, {
          x: grid, bands: [{ lo: band(c.id, 0), hi: band(c.id, 4) }],
          lines: [{ name: 'Mediana ponderada', values: band(c.id, 2), color: 'var(--pd-text-faint)', dash: '4 4', width: 1.5 }, { name: 'Esta corrida', values: grid.map(t => Motor.at(r, c.id, t)), color: lineColor, width: 2.5 }],
        }));
      }
      $('hitos-corrida').innerHTML = Motor.MILESTONES.map(([id, label]) => `<li><span>${esc(label)}</span><b>${id in r.hitos ? fecha(r.hitos[id]) : 'no llega antes de 2040'}</b></li>`).join('');
      $('exo').hidden = !state.params.computeExo;
    });
  }
  $('presets').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) setPreset(b.dataset.id); });
  $('perillas').addEventListener('input', ev => {
    if (ev.target.id === 's-deal') state.params.dealT = ev.target.value === '' ? null : +ev.target.value;
    else state.params[ev.target.id.slice(2)] = +ev.target.value;
    draw();
  });
  $('graficos').innerHTML = CHARTS.map(c => `<div class="chart" id="c-${c.id}"></div>`).join('');

  /* ------------------------------------------------------------ where we are */
  const obsOf = key => { const [v, f] = key.split('@'); return DATA.obs.find(o => o.variable === v && o.fecha === f); };
  const FIT = {
    'slopeRatio@2026-10-15': ['Pendiente de capacidades desde octubre de 2025 sobre la de 2024–2025', '×'],
    'accel@2026-10-15': ['Aceleración atribuible a la IA, octubre de 2026', '×'],
    'eciRate@2025-09-01': ['Ritmo del ECI de frontera, 2024–2025', 'puntos/año'],
    'Y@2026-04-01': ['Ingresos de OpenAI y Anthropic, abril de 2026', 'mil M USD/año'],
    'Y@2026-08-20': ['Ingresos de OpenAI y Anthropic, agosto de 2026', 'mil M USD/año'],
    'horizon@2026-02-05': ['Horizonte temporal de Claude Opus 4.6', 'min'],
    'horizon@2026-04-07': ['Horizonte temporal de Claude Mythos Preview', 'min'],
  };
  const fitTable = (fits, keys) => `<table><thead><tr><th>Observable</th><th>Medido</th><th>Modelo, 10–90%</th><th></th></tr></thead><tbody>${keys.map(k => {
    const o = obsOf(k), [lo, mid, hi] = fits[k], inside = o.valor >= lo && o.valor <= hi;
    return `<tr><td>${esc(FIT[k][0])}</td><td class="n">${num(o.valor, 3)} ${FIT[k][1]}</td><td class="n">${num(lo, 3)} – ${num(hi, 3)}</td><td>${inside ? 'dentro' : o.valor > hi ? '<b>medido por encima</b>' : '<b>medido por debajo</b>'}</td></tr>`;
  }).join('')}</tbody></table>`;
  $('ajuste').innerHTML = fitTable(DATA.mc.ajuste, Object.keys(FIT));
  $('retro').innerHTML = fitTable(DATA.retro.ajuste, Object.keys(FIT).filter(k => k !== 'eciRate@2025-09-01'));

  const hg = DATA.mc.historia.grilla.concat(grid.filter(t => t > 2026 && t <= 2028.5));
  const hband = q => DATA.mc.historia.horizon.map(r => r[q]).concat(grid.map((t, i) => [t, DATA.mc.bandas.horizon[i][q]]).filter(([t]) => t > 2026 && t <= 2028.5).map(x => x[1]));
  const drawHorizon = () => Graficos.lineas($('c-horizonte'), {
    title: 'Horizonte temporal al 50%, modelos de frontera', unit: 'minutos de trabajo experto · logarítmica', log: true, yMin: 1, yMax: 1e6, height: 280, x: hg,
    bands: [{ lo: hband(0), hi: hband(4) }], lines: [{ name: 'Mediana ponderada', values: hband(2), color: 'var(--pd-primary)' }],
    marks: DATA.obs.filter(o => o.variable === 'horizon' && o.t >= 2023).map(o => ({ x: o.t, y: o.valor, lo: o.bajo, hi: o.alto, name: o.nota })),
  });

  $('escenarios').innerHTML = `<table><thead><tr><th>Escenario</th><th>Aceleración atribuible a la IA, oct-2026</th><th>Ritmo del ECI en 2026</th><th>Ganancia del lazo hoy</th><th>Peso relativo</th></tr></thead><tbody>
    <tr class="obs"><td>Medido</td><td class="n">1.7 (1.2–2.6)</td><td class="n">20–27</td><td class="n">sin medición</td><td></td></tr>${SC_IDS.map(id => {
    const e = DATA.mc.escenarios[id];
    return `<tr><td>${dot(id)}${esc(scName(id))}</td><td class="n">${num(e.ajuste['accel@2026-10-15'], 2)}</td><td class="n">${num(e.ajuste['eciRate@2026-06-01'], 2)}</td><td class="n">${num(e.ganancia, 2)}</td><td class="n">${pct(e.peso)}</td></tr>`;
  }).join('')}</tbody></table>`;

  /* ------------------------------------------------------------ milestones */
  const drawHitos = () => Graficos.intervalos($('c-hitos'), {
    title: 'Fecha de cada hito: corridas ponderadas y escenarios', x0: 2026, x1: 2040,
    rows: Motor.MILESTONES.map(([id, label]) => { const [lo, , mid, , hi] = DATA.mc.hitos[id].cuantiles; return { label, lo, mid, hi, dots: SC_IDS.map(s => ({ x: DATA.mc.escenarios[s].hitos[id], color: color(s), name: scName(s) })) }; }),
  });
  $('leyenda-hitos').innerHTML = '<span><i class="g-key-interval"></i>Corridas ponderadas, 10–90%, y mediana</span>' + SC_IDS.map(id => `<span>${dot(id)}${esc(scName(id))}</span>`).join('');
  $('tabla-hitos').innerHTML = `<table><thead><tr><th>Hito</th><th>Mediana</th><th>Antes de fin de 2027</th><th>Antes de fin de 2030</th>${SC_IDS.map(id => `<th>${esc(scName(id))}</th>`).join('')}</tr></thead><tbody>${Motor.MILESTONES.map(([id, label]) => {
    const h = DATA.mc.hitos[id];
    return `<tr><td>${esc(label)}</td><td>${fecha(h.cuantiles[2])}</td><td class="n">${pct(h.antesDeFinDe[2027])}</td><td class="n">${pct(h.antesDeFinDe[2030])}</td>${SC_IDS.map(s => { const x = DATA.mc.escenarios[s].hitos[id]; return `<td>${x === undefined ? 'no llega' : fecha(x)}</td>`; }).join('')}</tr>`;
  }).join('')}</tbody></table>`;

  /* ------------------------------------------------------------ forecasts */
  const MES = { '02': 'febrero', '05': 'mayo', '11': 'noviembre' };
  const cuando = f => `${MES[f.slice(5)]} de ${f.slice(0, 4)}`;
  const score = DATA.puntaje[DATA.pred.emision];
  const resolved = id => (score && score.filas.find(r => r.id === id)) || null;
  const range = f => { const xs = Object.entries(f.escenarios).sort((a, b) => a[1] - b[1]); return [xs[0], xs[xs.length - 1]]; };
  $('pred-tabla').innerHTML = `<table><thead><tr><th>Variable</th><th>Se resuelve en</th><th>Mediana</th><th>Intervalo 80%</th><th>Entre escenarios</th><th>Resultado</th></tr></thead><tbody>${DATA.pred.filas.map(f => {
    const r = resolved(f.id), res = r ? `${num(r.observado, 3)}${'dentro' in r ? (r.dentro ? ' · dentro' : ' · fuera') : ''}` : 'sin resolver';
    if ('prob' in f) return `<tr><td>${esc(f.nombre)}<small><a href="${f.url}">${esc(f.resuelve)}</a></small></td><td class="w">${cuando(f.fecha)}</td><td class="n">${pct(f.prob)}</td><td class="n">probabilidad</td><td></td><td class="w">${res}</td></tr>`;
    const [a, b] = range(f);
    return `<tr><td>${esc(f.nombre)}<small>${esc(f.unidad)} · <a href="${f.url}">${esc(f.resuelve)}</a></small></td><td class="w">${cuando(f.fecha)}</td><td class="n">${num(f.p50)}</td><td class="n">${num(f.p10)} – ${num(f.p90)}</td><td class="n">${num(a[1])} – ${num(b[1])}</td><td class="w">${res}</td></tr>`;
  }).join('')}</tbody></table>`;
  const last = DATA.pred.filas.filter(f => f.fecha === '2027-11' && !('prob' in f)).map(f => ({ f, r: range(f) })).sort((x, y) => y.r[1][1] / y.r[0][1] - x.r[1][1] / x.r[0][1]);
  $('mirar').innerHTML = `<table><thead><tr><th>Variable, a noviembre de 2027</th><th>Escenario más bajo</th><th>Escenario más alto</th><th>Cociente</th></tr></thead><tbody>${last.map(({ f, r }) => `<tr><td>${esc(f.nombre)}</td><td>${dot(r[0][0])}${esc(scName(r[0][0]))}: ${num(r[0][1])}</td><td>${dot(r[1][0])}${esc(scName(r[1][0]))}: ${num(r[1][1])}</td><td class="n">${num(r[1][1] / r[0][1])}×</td></tr>`).join('')}</tbody></table>`;

  /* ------------------------------------------------------------ method */
  const SECTOR = { nucleo: 'Núcleo técnico', fisico: 'Cuellos físicos', economia: 'Economía y empleo', gobernanza: 'Seguridad y gobernanza', observables: 'Observables' };
  const eq = fn => esc(fn.toString().replace(/^v\s*=>\s*/, '').replace(/\bv\./g, '').replace(/\s+/g, ' '));
  $('ecuaciones').innerHTML = `<table class="eq"><thead><tr><th>Variable</th><th>Unidad</th><th>Ecuación</th></tr></thead><tbody>${Motor.STOCKS.map(s => `<tr><td>${esc(s[3])} <small>stock · ${SECTOR[s[2]]}</small></td><td>${esc(s[1])}</td><td><code>d/dt = ${eq(s[5])}</code></td></tr>`).join('')}${Motor.AUX.map(a => `<tr><td>${esc(a[3])} <small>${SECTOR[a[2]]}</small></td><td>${esc(a[1])}</td><td><code>${eq(a[4])}</code></td></tr>`).join('')}</tbody></table>`;
  const show = x => (Array.isArray(x) ? 'tabla' : x === null ? 'ninguno' : num(x, 3));
  $('parametros').innerHTML = `<table><thead><tr><th>Parámetro</th><th>Valor base</th><th>Rango previo, 10–90%</th><th>Ponderado, 10–90%</th><th>Fuente</th></tr></thead><tbody>${Object.entries(Motor.PARAMS).map(([id, p]) => {
    const q = DATA.mc.parametros[id];
    return `<tr><td>${esc(p[3])} <small>${esc(p[1])} · ${SECTOR[p[2]]}</small></td><td class="n">${show(p[0])}</td><td class="n">${q ? `${num(q.previo[0])} – ${num(q.previo[2])}` : 'fijo'}</td><td class="n">${q ? `${num(q.ponderado[0])} – ${num(q.ponderado[2])}` : ''}</td><td>${p[4].split(',').map(k => `<a href="#f-${k}">${k}</a>`).join(', ')}</td></tr>`;
  }).join('')}</tbody></table>`;
  const HITO = Object.fromEntries(Motor.MILESTONES.map(m => [m[0], m[1]]));
  const BLANCO = { mult: 'Multiplicador de I+D', gain: 'Ganancia del lazo', accel: 'Aceleración atribuible a la IA', Y: 'Ingresos de los laboratorios' };
  const blanco = b => { const [v, t] = b.split(' en '); return `${BLANCO[v]}, ${fecha(+t)}`; };
  $('reproduccion').innerHTML = `<table><thead><tr><th>Escenario</th><th>Blanco</th><th>Fuente</th><th>Modelo</th><th>Desvío</th></tr></thead><tbody>${Object.entries(DATA.repro).flatMap(([id, rows]) => rows.map(r => {
    const isDate = r.blanco in HITO;
    return `<tr><td>${dot(id)}${esc(scName(id))}${r.variante ? ' <small>' + r.variante + '</small>' : ''}</td><td>${esc(isDate ? HITO[r.blanco] : blanco(r.blanco))}</td><td class="n">${isDate ? fecha(r.fuente) : num(r.fuente, 3)}</td><td class="n">${isDate ? (r.modelo === null ? 'no llega' : fecha(r.modelo)) : num(r.modelo, 3)}</td><td class="n">${isDate ? (r.desvio === null ? '' : num(r.desvio, 2) + ' años') : num(r.desvio, 3) + '×'}</td></tr>`;
  })).join('')}</tbody></table>`;
  const COTEJO = { original: 'leída del original', secundario: 'por resumen o cita, sin cotejar', propio: 'juicio propio' };
  $('fuentes').innerHTML = DATA.fuentes.map(f => `<li id="f-${f.clave}"><b>${f.clave}</b> · ${f.url ? `<a href="${f.url}">${esc(f.fuente)}</a>` : esc(f.fuente)}. ${esc(f.tomado)}. <small>${COTEJO[f.cotejo]}</small></li>`).join('');

  /* ------------------------------------------------------------ first paint and resize */
  setPreset('central');
  drawHorizon(); drawHitos();
  let wide = innerWidth;
  addEventListener('resize', () => { if (Math.abs(innerWidth - wide) > 20) { wide = innerWidth; draw(); drawHorizon(); drawHitos(); } });
})();
