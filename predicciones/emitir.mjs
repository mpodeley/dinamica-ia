// Freeze a forecast issue from the current Monte Carlo output.
//
//     node predicciones/emitir.mjs 2026-11
//
// Writes predicciones/<issue>.json: for each variable and resolution date the median, the 80% interval,
// what each scenario says, and where the figure that resolves it is published. An issue is never
// rewritten: the script refuses to overwrite one.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const here = new URL('.', import.meta.url);
const issue = process.argv[2];
if (!/^\d{4}-\d{2}$/.test(issue || '')) throw new Error('uso: node predicciones/emitir.mjs AAAA-MM');
const out = new URL(`${issue}.json`, here);
if (existsSync(out)) throw new Error(`${issue}.json ya existe: una emisión no se reescribe`);
const mc = JSON.parse(readFileSync(new URL('../analisis/mc.json', here)));

// What resolves each variable. `clase` drives the rounding on the page.
const VARS = {
  Y: { nombre: 'Ingresos anualizados de OpenAI y Anthropic', unidad: 'mil M USD/año', resuelve: 'Epoch AI, seguimiento de ingresos de laboratorios', url: 'https://epoch.ai/gradient-updates/an-update-on-ais-most-important-number' },
  eciGain: { nombre: 'Puntos ganados por la frontera del ECI desde el 16-nov-2026', unidad: 'puntos', resuelve: 'Epoch Capabilities Index, modelo de frontera', url: 'https://epoch.ai/trends' },
  slopeRatio: { nombre: 'Pendiente de capacidades desde oct-2025 sobre la de 2024–2025', unidad: '×', resuelve: 'Próxima evaluación de METR o system card con AECI', url: 'https://metr.org/blog/2026-11-05-anthropic-ai-rd-acceleration-assessment/' },
  C: { nombre: 'Cómputo mundial de IA en operación', unidad: 'M H100e', resuelve: 'Epoch AI, ventas de chips con un trimestre de rezago', url: 'https://epoch.ai/gradient-updates/frontier-labs-dont-use-most-ai-compute' },
};
const filas = [];
for (const [fecha, vars] of Object.entries(mc.pronostico)) {
  for (const [id, meta] of Object.entries(VARS)) {
    const [p10, p50, p90] = vars[id].q;
    filas.push({ id: `${id}@${fecha}`, variable: id, ...meta, fecha, p10, p50, p90, escenarios: Object.fromEntries(Object.entries(mc.escenarios).map(([k, e]) => [k, e.pronostico[fecha][id]])) });
  }
  filas.push({ id: `accel3@${fecha}`, variable: 'accel3', nombre: 'Se informa una pendiente de capacidades de 3× o más sobre la de 2024–2025', unidad: 'probabilidad', resuelve: VARS.slopeRatio.resuelve, url: VARS.slopeRatio.url, fecha, prob: vars.pAccel3 });
}
writeFileSync(out, JSON.stringify({ emision: issue, emitido: mc.emitido, corridas: mc.corridas, tamanoEfectivo: mc.tamanoEfectivo, filas }, null, 1) + '\n');
console.log(`${issue}.json: ${filas.length} predicciones`);
