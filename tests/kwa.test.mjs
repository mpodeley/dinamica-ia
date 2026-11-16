// The `kwa-2032` scenario against an independent re-implementation of Thomas Kwa's model
// (metr.org/notes/2026-02-10-simpler-ai-timelines-model, github.com/tkwa/ai-takeoff-model):
//   S' = k (L/(1-f))^alpha C^zeta S^(1-beta),  f = sigmoid(v (ln(C S) - ln E_hac))
// with his compute and labor schedules and the midpoints of his parameter ranges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const M = require('../modelo/motor.js');
const ESC = JSON.parse(readFileSync(new URL('../modelo/escenarios.json', import.meta.url)));

function kwaReference() {
  const oneOverV = 2.85, v = 1 / oneOverV, f0 = 0.375, ratio = 0.235, sum = 0.9, beta = 0.65;
  const alpha = ratio * sum, zeta = (1 - ratio) * sum;
  const C = [1]; for (let t = 1; t <= 3; t++) C[t] = C[t - 1] * 2.6;
  C[4] = C[3] * 2; for (let t = 5; t <= 32; t++) C[t] = C[t - 1] * (2 - 0.75 * (t - 5) / 28);
  for (let t = 33; t <= 60; t++) C[t] = C[t - 1] * 1.25;
  const L = [1]; for (let t = 1; t <= 3; t++) L[t] = L[t - 1] * 2; for (let t = 4; t <= 60; t++) L[t] = L[t - 1] * 1.1;
  const geo = (a, t) => { const i = Math.floor(t); return a[i] * Math.pow(a[i + 1] / a[i], t - i); };
  const logE = -Math.log(f0 / (1 - f0)) / v;
  const f = (t, S) => 1 / (1 + Math.exp(-v * (Math.log(geo(C, t) * S) - logE)));
  const k = Math.log(5) / Math.pow(1 / (1 - f0), alpha);
  const dS = (t, S) => k * Math.pow(geo(L, t) / (1 - Math.min(f(t, S), 0.999999)), alpha) * Math.pow(geo(C, t), zeta) * Math.pow(S, 1 - beta);
  let S = 1, t = 0; const h = 1 / 365;
  while (t < 40) {
    if (f(t, S) >= 0.99) return 2026 + t;
    const a = dS(t, S), b = dS(t + h / 2, S + h / 2 * a), c = dS(t + h / 2, S + h / 2 * b), d = dS(t + h, S + h * c);
    S += h / 6 * (a + 2 * b + 2 * c + d); t += h;
  }
  return Infinity;
}

test('kwa-2032 reaches 99% automation within 0.15 years of the reference implementation', () => {
  const ref = kwaReference();
  const ours = M.run(ESC['kwa-2032'].params, { tEnd: 2050 }).hitos.auto99;
  console.log(`  referencia ${ref.toFixed(2)} · motor ${ours.toFixed(2)}`);
  assert.ok(Math.abs(ref - ours) < 0.15, `${ref} vs ${ours}`);
});
