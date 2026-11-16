// Every arrow and node drawn in the diagram exists in the engine: an arrow a → b is accepted only
// if b depends on a in the equations, directly or through at most three variables that are not drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const M = createRequire(import.meta.url)('../modelo/motor.js');
const src = readFileSync(new URL('../pagina/diagrama.js', import.meta.url), 'utf8');
const D = new Function('Motor', 'Graficos', src + '; return Diagrama;')(M, {});

test('diagram nodes are model variables', () => {
  const ids = new Set([...M.STOCKS, ...M.AUX].map(x => x[0]));
  for (const id of Object.keys(D.NODES)) assert.ok(ids.has(id), id);
});

test('diagram arrows are dependencies found in the equations', () => {
  const deps = M.dependencies({ dealT: 2029 });
  const reach = (from, to, depth) => depth >= 0 && (deps[to] || []).some(d => d === from || (!D.NODES[d] && reach(from, d, depth - 1)));
  for (const [a, b] of D.EDGES) assert.ok(reach(a, b, 3), `${a} → ${b}`);
});
