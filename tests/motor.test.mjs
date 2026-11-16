// Structure and extreme-condition tests for the engine. Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('../modelo/motor.js');

const base = M.run({});
const finite = r => Object.entries(r.series).every(([, s]) => s.every(Number.isFinite));

test('every variable is declared with unit, sector and label', () => {
  for (const s of M.STOCKS) assert.ok(s[1] && s[2] && s[3], s[0]);
  for (const a of M.AUX) assert.ok(a[1] && a[2] && a[3], a[0]);
  for (const [k, p] of Object.entries(M.PARAMS)) assert.ok(p[1] && p[2] && p[3] && p[4], k);
  const ids = [...M.STOCKS, ...M.AUX].map(x => x[0]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
});

test('auxiliaries only read stocks or auxiliaries defined before them', () => {
  const deps = M.dependencies({});
  const order = new Map(M.AUX.map((a, i) => [a[0], i]));
  for (const [id, i] of order) for (const d of deps[id]) if (order.has(d)) assert.ok(order.get(d) < i, `${id} reads ${d} before it is computed`);
});

test('declared loops are real: each link is a dependency found in the equations', () => {
  const deps = M.dependencies({ dealT: 2029 });
  // a stock's flow may be routed through an auxiliary; accept a path of length <= 3 between loop nodes
  const reach = (from, to, depth) => depth >= 0 && (deps[to] || []).some(d => d === from || reach(from, d, depth - 1));
  for (const loop of M.LOOPS) for (let i = 0; i + 1 < loop.path.length; i++)
    assert.ok(reach(loop.path[i], loop.path[i + 1], 3), `${loop.id}: ${loop.path[i]} → ${loop.path[i + 1]}`);
});

test('base run is finite and stays within physical bounds', () => {
  assert.ok(finite(base));
  for (const id of ['f', 'aEco', 'D3', 'Hc', 'Gr', 'safety', 'race']) assert.ok(base.series[id].every(x => x >= 0 && x <= 1), id);
  for (const id of ['C', 'Pw', 'Pb', 'Y', 'F']) assert.ok(base.series[id].every(x => x > 0), id);
  assert.ok(base.series.lnS.every((x, i, s) => i === 0 || x >= s[i - 1] - 1e-9), 'software efficiency never falls');
});

test('normalization: 2026 values match the parameters', () => {
  const P = M.defaults();
  assert.ok(Math.abs(base.series.f[0] - P.f0) < 1e-9);
  assert.ok(Math.abs(base.series.R[0] - 1) < 1e-9);
  assert.ok(Math.abs(base.series.Y[0] - P.Y0) < 1e-9);
  assert.ok(Math.abs(base.series.horizon[0] - P.H0) < 1e-6);
});

test('with no automation and no taste the multiplier is 1 and the loop gain is 0', () => {
  const r = M.run({ fmax: 1e-9, f0: 1e-10, taste: 1 });
  assert.ok(r.series.mult.every(x => Math.abs(x - 1) < 1e-6));
  assert.ok(r.series.gain.every(x => Math.abs(x) < 1e-6));
  assert.ok(r.series.accel.every(x => Math.abs(x - 1) < 1e-6));
});

test('frozen compute and labor with beta > 0 and no automation: software growth decays', () => {
  const r = M.run({ fmax: 1e-9, f0: 1e-10, computeExo: [[2026, 1]], laborRates: [[2026, 1]], rhoRace: 0, sReg: 0 });
  assert.ok(M.at(r, 'gS', 2040) < 0.5 * M.at(r, 'gS', 2026));
});

test('loop gain above 1 means software growth accelerates with inputs frozen', () => {
  const fast = { rhoTasks: -0.5, taste: 4, laborShare: 0.5, beta: 0.4, computeExo: [[2026, 1]], laborRates: [[2026, 1]], rhoRace: 0, sReg: 0, kInc: 0, ceiling: 40 };
  const r = M.run(fast, { tEnd: 2032 });
  let checked = 0;
  for (let i = 1; i + 1 < r.t.length; i++) {
    const g = r.series.gain[i], d = r.series.gS[i + 1] - r.series.gS[i - 1];
    if (Math.abs(g - 1) > 0.05 && r.series.room[i] > 0.2) { assert.equal(g > 1, d > 0, `t=${r.t[i]} gain=${g} dgS=${d}`); checked++; }
  }
  assert.ok(checked > 20);
});

test('a binding software ceiling stops growth', () => {
  const r = M.run({ ceiling: 2, taste: 4, rhoTasks: -0.5 });
  assert.ok(Math.max(...r.series.lnS) / Math.LN10 <= 2 + 1e-6);
});

test('no chips, no growth: compute cannot rise without investment', () => {
  const r = M.run({ I0: 1e-6, Imax: 1e-6 });
  assert.ok(M.at(r, 'C', 2035) < 16);
});

test('a deal pauses capability work and caps compute growth', () => {
  const r = M.run({ dealT: 2029 });
  assert.ok(M.at(r, 'gS', 2029.2) < 0.1 * M.at(r, 'gS', 2028.9));
  assert.ok(M.at(r, 'gC', 2031) <= Math.log(1.25) + 1e-9);
  assert.ok(M.at(r, 'safety', 2031) > 0.3);
});

test('extreme parameter draws stay finite', () => {
  for (const o of [{ taste: 6, rhoTasks: -0.3, sigma: 2, beta: 0.3 }, { sigma: 0.2, beta: 1.2, tauDif: 25 }, { hSuper: 0.85, taste: 5 }, { kInc: 3, hThreshold: 0.2 }])
    assert.ok(finite(M.run(o)), JSON.stringify(o));
});
