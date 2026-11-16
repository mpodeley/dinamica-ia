// Fit each scenario's free parameters so the model reproduces the dates its source publishes.
//
//     node analisis/calibrar.mjs [scenario ...]
//
// Reads modelo/escenarios.json: `blancos` are the targets (a milestone date, or the value of a variable
// at a date; `con` evaluates the target on a variant run), `libres` the parameters to fit with their
// bounds. Writes the fitted values back into `params` and the residuals to analisis/reproduccion.json.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const M = createRequire(import.meta.url)('../modelo/motor.js');
const here = new URL('.', import.meta.url);
const ESC_PATH = new URL('../modelo/escenarios.json', here);
const ESC = JSON.parse(readFileSync(ESC_PATH));
const MISSING = 25;   // years charged to a milestone the run never reaches

function evaluate(sc, params) {
  const runs = new Map();
  const runFor = extra => {
    const key = JSON.stringify(extra || {});
    if (!runs.has(key)) runs.set(key, M.run({ ...params, ...(extra || {}) }, { tEnd: 2046 }));
    return runs.get(key);
  };
  return sc.blancos.map(b => {
    const r = runFor(b.con);
    if (b.hito) {
      const got = r.hitos[b.hito];
      return { ...b, modelo: got ?? null, error: got === undefined ? MISSING : got - b.t };
    }
    const got = M.at(r, b.var, b.t);
    return { ...b, modelo: got, error: 3 * Math.log(got / b.valor) };   // a factor of 1.4 weighs like one year
  });
}

function nelderMead(f, x0, iters) {
  const n = x0.length;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += x[i] > 0.5 ? -0.15 : 0.15; simplex.push(x); }
  let vals = simplex.map(f);
  for (let it = 0; it < iters; it++) {
    const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    simplex = order.map(i => simplex[i]); vals = order.map(i => vals[i]);
    const c = Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i][j] / n;
    const along = k => c.map((cj, j) => cj + k * (simplex[n][j] - cj));
    const xr = along(-1), fr = f(xr);
    if (fr < vals[0]) { const xe = along(-2), fe = f(xe); if (fe < fr) { simplex[n] = xe; vals[n] = fe; } else { simplex[n] = xr; vals[n] = fr; } }
    else if (fr < vals[n - 1]) { simplex[n] = xr; vals[n] = fr; }
    else {
      const xc = along(0.5), fc = f(xc);
      if (fc < vals[n]) { simplex[n] = xc; vals[n] = fc; }
      else for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((x, j) => simplex[0][j] + 0.5 * (x - simplex[0][j])); vals[i] = f(simplex[i]); }
    }
  }
  const best = vals.indexOf(Math.min(...vals));
  return simplex[best];
}

const only = process.argv.slice(2);
const report = {};
for (const [id, sc] of Object.entries(ESC)) {
  if (only.length && !only.includes(id)) continue;
  const free = Object.entries(sc.libres);
  if (free.length && sc.blancos.length) {
    const toParams = u => Object.fromEntries(free.map(([k, [lo, hi]], i) => [k, lo + (hi - lo) * Math.min(1, Math.max(0, u[i]))]));
    const cost = u => {
      const out = u.reduce((s, x) => s + (x < 0 ? x * x : x > 1 ? (x - 1) ** 2 : 0), 0) * 100;
      return evaluate(sc, { ...sc.params, ...toParams(u) }).reduce((s, b) => s + b.error ** 2, 0) + out;
    };
    let u = free.map(([k, [lo, hi]]) => (sc.params[k] - lo) / (hi - lo));
    for (let round = 0; round < 3; round++) u = nelderMead(cost, u, 250);
    for (const [k, x] of Object.entries(toParams(u))) sc.params[k] = +x.toPrecision(4);
  }
  const res = evaluate(sc, sc.params);
  report[id] = res.map(b => ({ blanco: b.hito ?? `${b.var} en ${b.t}`, variante: b.con ? 'sin acuerdo' : '', fuente: b.hito ? b.t : b.valor, modelo: b.modelo === null ? null : +b.modelo.toFixed(2), desvio: b.hito ? (b.modelo === null ? null : +(b.modelo - b.t).toFixed(2)) : +(b.modelo / b.valor).toFixed(2) }));
  console.log(id);
  for (const r of report[id]) console.log(`  ${String(r.blanco).padEnd(18)} ${String(r.variante).padEnd(12)} fuente ${r.fuente}  modelo ${r.modelo}  desvío ${r.desvio}`);
}
if (!only.length) writeFileSync(new URL('reproduccion.json', here), JSON.stringify(report, null, 2) + '\n');
writeFileSync(ESC_PATH, JSON.stringify(ESC, null, 2).replace(/\[\s+(-?[\d.e+]+),\s+(-?[\d.e+]+)\s+\]/g, '[$1, $2]') + '\n');
