// Monte Carlo over the priors, with each run weighted by how well it matches what has been observed.
//
//     node analisis/montecarlo.mjs [--n 4000] [--hasta 2026.0] [--semilla 7]
//
// Writes analisis/mc.json: weighted bands per variable, milestone dates, the loop gain today, prior and
// weighted parameter ranges, scenario weights and the forecast table. With --hasta only observations
// before that date weigh in, and the output goes to analisis/retro.json (the back-test).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const M = createRequire(import.meta.url)('../modelo/motor.js');
const here = new URL('.', import.meta.url);
const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i < 0 ? dflt : +process.argv[i + 1]; };
const N = arg('n', 4000), UNTIL = arg('hasta', Infinity), SEED = arg('semilla', 7);
const T_END = 2040, TODAY = 2026.875;
const PRIORS = JSON.parse(readFileSync(new URL('../modelo/priors.json', here)));
const ESC = JSON.parse(readFileSync(new URL('../modelo/escenarios.json', here)));
const OBS = readFileSync(new URL('../datos/observaciones.csv', here), 'utf8').trim().split('\n').slice(1).map(l => {
  const c = l.match(/("([^"]*)"|[^,]*)(,|$)/g).map(x => x.replace(/,$/, '').replace(/^"|"$/g, ''));
  return { variable: c[0], fecha: c[1], t: +c[2], valor: +c[3], bajo: +c[4], alto: +c[5], fuente: c[6], nota: c[7], usa: +c[8] };
});

// Spread (in log units) granted to each observable: its published interval, widened for model error.
const SIGMA = { eciRate: 0.2, slopeRatio: 0.25, accel: 0.3, Y: 0.15 };
// A scenario is scored only on what it says about 2026 itself: its past is not part of what it claims.
const SCENARIO_OBS = o => (o.variable === 'accel' || o.variable === 'eciRate') && o.t >= 2026;
const BREAK = 2025.77, BASE = 2024.2;   // METR's trend break (7 Oct 2025) and the start of its baseline
const HORIZON_WEIGHT = 4;      // the 14 horizon points count as this many independent ones
const FORECAST_DATES = [['2027-02', 2027.125], ['2027-05', 2027.375], ['2027-11', 2027.875]];
const FORECAST_VARS = ['Y', 'eciGain', 'slopeRatio', 'C'];
const BAND_VARS = ['p', 'f', 'mult', 'accel', 'gain', 'dp', 'horizon', 'C', 'Pw', 'I', 'Y', 'aEco', 'D3', 'safety', 'gap', 'Hc', 'Gr', 'leadMonths'];
const HIST_GRID = Array.from({ length: 13 }, (_, i) => 2023 + i / 4);
const CRUX = ['f0', 'rhoTasks', 'laborShare', 'sigma', 'beta', 'taste', 'gS0', 'width', 'tauDif', 'ecoGap', 'ceiling', 'gPmax'];

let seed = SEED >>> 0;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let x = seed; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const DRAW = {
  unif: (a, b) => a + (b - a) * rnd(),
  logu: (a, b) => Math.exp(Math.log(a) + Math.log(b / a) * rnd()),
  tri: (a, m, b) => { const u = rnd(), c = (m - a) / (b - a); return u < c ? a + Math.sqrt(u * (b - a) * (m - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - m)); },
};
const sample = () => Object.fromEntries(Object.entries(PRIORS).map(([k, [kind, ...args]]) => [k, DRAW[kind](...args)]));

const interp = (ts, xs, t) => {
  const x = (t - ts[0]) * 12, i = Math.min(Math.max(Math.floor(x), 0), ts.length - 2);
  return xs[i] + (xs[i + 1] - xs[i]) * (x - i);
};

// One run seen through the observables: capability p(t) from 2023 on, and the fitted horizon link.
function observe(params) {
  const fwd = M.run(params, { tEnd: T_END }), hist = M.history(params, 2023);
  const pAt = t => (t < M.T_REF ? interp(hist.t, hist.p, t) : M.at(fwd, 'p', t));
  // the horizon link (level and OOM per doubling) is fitted per run: only the curvature of p(t) is tested
  const pts = OBS.filter(o => o.variable === 'horizon' && o.usa && o.t < UNTIL);
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const o of pts) { const x = pAt(o.t), y = Math.log2(o.valor); sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const n = pts.length, slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), icpt = (sy - slope * sx) / n;
  let ss = 0;
  for (const o of pts) { const z = (Math.log2(o.valor) - icpt - slope * pAt(o.t)) * Math.LN2 / Math.max(Math.log(o.alto / o.bajo) / 3.92, 0.35); ss += z * z; }
  let ll = -0.5 * HORIZON_WEIGHT * ss / n;
  const model = {
    eciRate: t => (t < M.T_REF ? interp(hist.t, hist.eciRate, t) : fwd.params.eciSlope * (M.at(fwd, 'p', 2026.8) - M.at(fwd, 'p', 2026)) / 0.8),
    // METR's measure: the slope of capability after the break over the slope before it
    slopeRatio: t => ((M.at(fwd, 'p', t) - pAt(BREAK)) / (t - BREAK)) / ((pAt(BREAK) - pAt(BASE)) / (BREAK - BASE)),
    accel: t => M.at(fwd, 'accel', t),
    Y: t => M.at(fwd, 'Y', t),
  };
  const fit = {};
  let llScenario = 0;
  for (const o of OBS) {
    if (!(o.variable in model)) continue;
    const got = model[o.variable](o.t);
    fit[o.variable + '@' + o.fecha] = got;
    const term = -0.5 * (Math.log(got / o.valor) / SIGMA[o.variable]) ** 2;
    if (SCENARIO_OBS(o)) llScenario += term;
    if (o.usa && o.t < UNTIL) ll += term;
  }
  const dH = 1 / slope, H0 = Math.pow(2, icpt);
  const hSuper = params.hSuper ?? 1;
  const horizonAt = p => { const x = 1 - p * (1 - hSuper) / dH; return Math.min(1e9, H0 * Math.pow(2, hSuper === 1 ? p / dH : x <= 0 ? Infinity : Math.log(x) / Math.log(hSuper))); };
  const horizon = fwd.series.p.map(horizonAt);
  const horizonHist = HIST_GRID.map(t => horizonAt(pAt(t)));
  for (const o of OBS) if (o.variable === 'horizon' && o.t >= M.T_REF) fit['horizon@' + o.fecha] = interp(fwd.t, horizon, o.t);
  return { fwd, hist, ll, llScenario, fit, horizon, horizonHist, H0, dH, slope, slopeRatio: model.slopeRatio };
}

const series = (o, id) => (id === 'horizon' ? o.horizon : id === 'I' ? o.fwd.series.lnI.map(Math.exp) : o.fwd.series[id]);
const value = (o, id, t) => {
  if (id === 'slopeRatio') return o.slopeRatio(t);
  if (id === 'eciGain') return (o.fwd.params.eciSlope) * (M.at(o.fwd, 'p', t) - M.at(o.fwd, 'p', TODAY));
  if (id === 'horizon' || id === 'I') return interp(o.fwd.t, series(o, id), t);
  return M.at(o.fwd, id, t);
};

function wquant(xs, ws, qs) {
  const idx = xs.map((x, i) => i).sort((a, b) => xs[a] - xs[b]);
  const tot = ws.reduce((s, w) => s + w, 0);
  const out = []; let acc = 0, j = 0;
  for (const q of qs) { while (j < idx.length - 1 && acc + ws[idx[j]] < q * tot) acc += ws[idx[j++]]; out.push(xs[idx[j]]); }
  return out;
}
const sigfig = x => (Number.isFinite(x) ? +x.toPrecision(4) : null);
const QS = [0.1, 0.25, 0.5, 0.75, 0.9];

console.time('monte carlo');
const runs = [];
for (let i = 0; i < N; i++) {
  const params = sample();
  const o = observe(params);
  if (!Number.isFinite(o.ll)) continue;
  runs.push({ params, o });
}
console.timeEnd('monte carlo');
const maxLL = Math.max(...runs.map(r => r.o.ll));
const w = runs.map(r => Math.exp(r.o.ll - maxLL));
const sumW = w.reduce((s, x) => s + x, 0), ess = sumW ** 2 / w.reduce((s, x) => s + x * x, 0);
const flat = runs.map(() => 1);
console.log(`corridas ${runs.length} · tamaño efectivo ${ess.toFixed(0)}`);

const grid = []; for (let t = M.T_REF; t <= T_END + 1e-9; t += 0.25) grid.push(+t.toFixed(2));
const bands = {};
for (const id of BAND_VARS) bands[id] = grid.map(t => wquant(runs.map(r => value(r.o, id, t)), w, QS).map(sigfig));

const hitos = {};
for (const [id, label] of M.MILESTONES) {
  const dates = runs.map(r => r.o.fwd.hitos[id] ?? Infinity);
  const byYear = {};
  for (let y = 2027; y <= 2040; y++) byYear[y] = sigfig(runs.reduce((s, r, i) => s + (dates[i] < y + 1 ? w[i] : 0), 0) / sumW);
  hitos[id] = { nombre: label, cuantiles: wquant(dates, w, QS).map(x => (Number.isFinite(x) ? +x.toFixed(2) : null)), antesDeFinDe: byYear };
}

const gainNow = runs.map(r => value(r.o, 'gain', TODAY));
// The slope ratio is forecast anchored on the last measurement: the model under-reproduces its level
// (see `ajuste`), so it contributes only the change since then, and the next measurement carries
// its own error. A back-test that stops before that measurement is not anchored.
const SLOPE_OBS = OBS.find(o => o.variable === 'slopeRatio');
const SLOPE_NOISE = Math.log(SLOPE_OBS.alto / SLOPE_OBS.bajo) / 3.92;
const ANCHORED = SLOPE_OBS.t < UNTIL;
const anchorSlope = fn => (ANCHORED ? t => SLOPE_OBS.valor * fn(t) / fn(SLOPE_OBS.t) : fn);
const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
const FORECAST_VALUE = { slopeRatio: (o, t) => anchorSlope(o.slopeRatio)(t) * (ANCHORED ? Math.exp(SLOPE_NOISE * gauss()) : 1) };
const pronostico = {};
for (const [label, t] of FORECAST_DATES) {
  pronostico[label] = {};
  const draws = {};
  for (const id of FORECAST_VARS) {
    draws[id] = runs.map(r => (FORECAST_VALUE[id] || ((o, tt) => value(o, id, tt)))(r.o, t));
    pronostico[label][id] = { q: wquant(draws[id], w, [0.1, 0.5, 0.9]).map(sigfig) };
  }
  pronostico[label].pAccel3 = sigfig(runs.reduce((s, r, i) => s + (draws.slopeRatio[i] >= 3 ? w[i] : 0), 0) / sumW);
  pronostico[label].pLazo = sigfig(runs.reduce((s, r, i) => s + ((r.o.fwd.hitos.loop ?? Infinity) <= t ? w[i] : 0), 0) / sumW);
}

const parametros = {};
for (const k of Object.keys(PRIORS)) parametros[k] = { previo: wquant(runs.map(r => r.params[k]), flat, [0.1, 0.5, 0.9]).map(sigfig), ponderado: wquant(runs.map(r => r.params[k]), w, [0.1, 0.5, 0.9]).map(sigfig) };
const central = Object.fromEntries(Object.keys(PRIORS).map(k => [k, parametros[k].ponderado[1]]));

// A scenario's slope ratio uses the measured 2024–2025 pace as its base: integrating a scenario's
// equations backward says nothing about a past its source does not describe.
const ECI_BASE = OBS.find(o => o.variable === 'eciRate' && o.t < M.T_REF).valor;
const scenarioSlope = o => t => {
  const p = x => M.at(o.fwd, 'p', x), dp0 = (p(M.T_REF + 0.05) - p(M.T_REF)) / 0.05;
  return (p(t) - p(M.T_REF) + dp0 * (M.T_REF - BREAK)) / (t - BREAK) / (ECI_BASE / o.fwd.params.eciSlope);
};
const SCENARIO_VALUE = { slopeRatio: (o, t) => anchorSlope(scenarioSlope(o))(t) };
const scenarioValue = (o, v, t) => (SCENARIO_VALUE[v] || ((oo, tt) => value(oo, v, tt)))(o, t);
const escenarios = {};
for (const [id, sc] of Object.entries(ESC)) {
  const o = observe(sc.params);
  escenarios[id] = { ll: o.llScenario, ajuste: Object.fromEntries(Object.entries(o.fit).map(([k, x]) => [k, sigfig(x)])), ganancia: sigfig(value(o, 'gain', TODAY)), hitos: Object.fromEntries(Object.entries(o.fwd.hitos).map(([k, x]) => [k, +x.toFixed(2)])), pronostico: {} };
  for (const [label, t] of FORECAST_DATES) escenarios[id].pronostico[label] = Object.fromEntries(FORECAST_VARS.map(v => [v, sigfig(scenarioValue(o, v, t))]));
}
const top = Math.max(...Object.values(escenarios).map(e => e.ll));
const tot = Object.values(escenarios).reduce((s, e) => s + Math.exp(e.ll - top), 0);
for (const e of Object.values(escenarios)) { e.peso = sigfig(Math.exp(e.ll - top) / tot); e.ll = sigfig(e.ll); }

const out = {
  emitido: '2026-11-16', corridas: runs.length, tamanoEfectivo: Math.round(ess), hasta: Number.isFinite(UNTIL) ? UNTIL : null, hoy: TODAY,
  cuantiles: QS, grilla: grid, bandas: bands, hitos,
  historia: { grilla: HIST_GRID, horizon: HIST_GRID.map((t, i) => wquant(runs.map(r => r.o.horizonHist[i]), w, QS).map(sigfig)) },
  gananciaHoy: { q: wquant(gainNow, w, QS).map(sigfig), pMayorQue1: sigfig(runs.reduce((s, r, i) => s + (gainNow[i] > 1 ? w[i] : 0), 0) / sumW), previoPMayorQue1: sigfig(gainNow.filter(g => g > 1).length / runs.length) },
  ajuste: Object.fromEntries(Object.keys(runs[0].o.fit).map(k => [k, wquant(runs.map(r => r.o.fit[k]), w, [0.1, 0.5, 0.9]).map(sigfig)])),
  horizonte: { dH: wquant(runs.map(r => r.o.dH), w, [0.1, 0.5, 0.9]).map(sigfig), H0: wquant(runs.map(r => r.o.H0), w, [0.1, 0.5, 0.9]).map(sigfig) },
  parametros, central, pronostico, escenarios,
};
const file = Number.isFinite(UNTIL) ? 'retro.json' : 'mc.json';
writeFileSync(new URL(file, here), JSON.stringify(out) + '\n');
console.log(file, '· ganancia hoy', out.gananciaHoy, '\n ajuste', out.ajuste, '\n horizonte', out.horizonte);
for (const [id, h] of Object.entries(hitos)) console.log(' ', id.padEnd(8), h.cuantiles.join('  '), ' P(<2028)', h.antesDeFinDe[2027], ' P(<2031)', h.antesDeFinDe[2030]);
console.log(' pesos', Object.fromEntries(Object.entries(escenarios).map(([k, e]) => [k, e.peso])));
console.log(' pronóstico', JSON.stringify(pronostico));
