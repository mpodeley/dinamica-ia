// Score every forecast issue against what was later observed.
//
//     node predicciones/puntuar.mjs
//
// Reads predicciones/observado.csv (emision-independent: variable, fecha AAAA-MM, valor, fuente) and each
// issue file. For interval forecasts: whether the value fell inside the 80% interval, and the log score
// under a log-normal fitted to the three quantiles. For probabilities: the Brier score. For scenarios:
// the relative likelihood of each one given the resolved values. Writes predicciones/puntaje.json.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
const here = new URL('.', import.meta.url);
const obsPath = new URL('observado.csv', here);
const obs = existsSync(obsPath) ? readFileSync(obsPath, 'utf8').trim().split('\n').slice(1).filter(Boolean).map(l => { const [variable, fecha, valor, fuente] = l.split(','); return { variable, fecha, valor: +valor, fuente }; }) : [];
const Z90 = 1.2816;
const puntaje = {};
for (const file of readdirSync(here).filter(f => /^\d{4}-\d{2}\.json$/.test(f))) {
  const issue = JSON.parse(readFileSync(new URL(file, here)));
  const rows = [], ll = {};
  for (const f of issue.filas) {
    const o = obs.find(x => x.variable === f.variable && x.fecha === f.fecha);
    if (!o) continue;
    if ('prob' in f) { rows.push({ id: f.id, observado: o.valor, prob: f.prob, brier: +((f.prob - o.valor) ** 2).toFixed(4) }); continue; }
    const sigma = Math.log(f.p90 / f.p10) / (2 * Z90), z = Math.log(o.valor / f.p50) / sigma;
    rows.push({ id: f.id, observado: o.valor, p10: f.p10, p50: f.p50, p90: f.p90, dentro: o.valor >= f.p10 && o.valor <= f.p90, z: +z.toFixed(2), puntajeLog: +(-0.5 * z * z - Math.log(sigma * o.valor * Math.sqrt(2 * Math.PI))).toFixed(3) });
    for (const [k, x] of Object.entries(f.escenarios)) ll[k] = (ll[k] || 0) - 0.5 * (Math.log(x / o.valor) / sigma) ** 2;
  }
  const top = Math.max(...Object.values(ll), -Infinity), tot = Object.values(ll).reduce((s, x) => s + Math.exp(x - top), 0);
  const inside = rows.filter(r => 'dentro' in r);
  puntaje[issue.emision] = { resueltas: rows.length, de: issue.filas.length, cobertura80: inside.length ? +(inside.filter(r => r.dentro).length / inside.length).toFixed(2) : null, filas: rows, escenarios: Object.fromEntries(Object.entries(ll).map(([k, x]) => [k, +(Math.exp(x - top) / tot).toFixed(3)])) };
  console.log(issue.emision, `· resueltas ${rows.length} de ${issue.filas.length}`, inside.length ? `· cobertura del intervalo 80%: ${puntaje[issue.emision].cobertura80}` : '');
}
writeFileSync(new URL('puntaje.json', here), JSON.stringify(puntaje, null, 1) + '\n');
