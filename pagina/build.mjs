/* build.mjs — assemble the page as one self-contained HTML file.

   Takes pagina.src.html and inlines the kit fonts (base64) and tokens, the engine, the chart code and
   the data. Every figure in the prose is a {{placeholder}} filled here from the results, so text and
   model cannot drift: the build fails on a placeholder it cannot resolve.

   Usage: node pagina/build.mjs */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const M = createRequire(import.meta.url)(join(ROOT, 'modelo', 'motor.js'));
const text = p => readFile(join(ROOT, p), 'utf8');
const json = async p => JSON.parse(await text(p));

const FACES = [['Space Grotesk', '400 700', 'space-grotesk-500.woff2'], ['IBM Plex Sans', '400 600', 'ibm-plex-sans-400.woff2'], ['IBM Plex Mono', 400, 'ibm-plex-mono-400.woff2'], ['IBM Plex Mono', 500, 'ibm-plex-mono-500.woff2']];
const fonts = (await Promise.all(FACES.map(async ([family, weight, file]) => {
  const b64 = (await readFile(join(HERE, 'kit', 'fonts', file))).toString('base64');
  return `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${b64}) format("woff2");font-weight:${weight};font-style:normal;font-display:swap}`;
}))).join('\n');
const tokens = (await text('pagina/kit/tokens.css')).replace(/@font-face\s*\{[^}]*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const [mc, retro, repro, esc, pred, puntaje, priors] = await Promise.all(['analisis/mc.json', 'analisis/retro.json', 'analisis/reproduccion.json', 'modelo/escenarios.json', 'predicciones/2026-11.json', 'predicciones/puntaje.json', 'modelo/priors.json'].map(json));
const obs = (await text('datos/observaciones.csv')).trim().split('\n').slice(1).map(l => {
  const c = l.match(/("([^"]*)"|[^,]*)(,|$)/g).map(x => x.replace(/,$/, '').replace(/^"|"$/g, ''));
  return { variable: c[0], fecha: c[1], t: +c[2], valor: +c[3], bajo: +c[4], alto: +c[5], fuente: c[6], nota: c[7], usa: +c[8] };
});
const fuentes = (await text('fuentes.md')).split('\n').filter(l => /^\| [a-z0-9-]+ \|/.test(l)).map(l => {
  const [clave, fuente, url, tomado, cotejo] = l.split('|').slice(1, -1).map(x => x.trim());
  return { clave, fuente, url, tomado, cotejo };
});
for (const [id, p] of Object.entries(M.PARAMS)) for (const k of p[4].split(',')) if (!fuentes.some(f => f.clave === k)) throw new Error(`parámetro ${id}: la fuente "${k}" no está en fuentes.md`);

/* ---- figures for the prose: one formatter, rounding by class ---- */
const n2 = x => Number(x.toPrecision(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
const entero = x => Math.round(x).toLocaleString('en-US');
const PARTS = ['principios', 'mediados', 'fines'];
const fecha = t => (t === null || t === undefined || !Number.isFinite(t) ? 'después de 2040' : `${PARTS[Math.min(2, Math.floor((t - Math.floor(t)) * 3))]} de ${Math.floor(t)}`);
const cap = s => s[0].toUpperCase() + s.slice(1);
const pct = p => (p < 0.01 ? 'menos de 1%' : p > 0.99 ? 'más de 99%' : Math.round(p * 100) + '%');

const central = M.run(mc.central, { tEnd: 2045 });
// counterfactual: compute and research staff stop growing in 2027 (a cap on compute growth, no other deal terms)
const frozen = M.run({ ...mc.central, dealT: 2027, dealCompute: 1, dealPause: 0, dealBrake: 1, dealSafety: 0, laborRates: [[2026, 2], [2026.99, 2], [2027, 1]] }, { tEnd: 2045 });
const reach = (r, id) => (id in r.hitos ? `llega a ${fecha(r.hitos[id])}` : 'no llega antes de 2045');
const retroKeys = Object.keys(retro.ajuste).filter(k => /2026/.test(k) && !k.startsWith('Y@2026-01') && !k.startsWith('eciRate'));
const retroRows = retroKeys.map(k => { const [v, f] = k.split('@'); const o = obs.find(x => x.variable === v && x.fecha === f), [lo, , hi] = retro.ajuste[k]; return { k, in: o.valor >= lo && o.valor <= hi, above: o.valor > hi }; });
const dateDevs = Object.values(repro).flat().filter(r => typeof r.fuente === 'number' && r.fuente > 2000 && r.modelo !== null).map(r => Math.abs(r.desvio));
const kwa = M.run(esc['kwa-2032'].params, { tEnd: 2050 }).hitos.auto99;
const slope = mc.ajuste['slopeRatio@2026-10-15'];

const cifras = {
  corridas: entero(mc.corridas), ess: entero(mc.tamanoEfectivo), emision: pred.emision, n_pred: pred.filas.length,
  g_med: n2(mc.gananciaHoy.q[2]), g_lo: n2(mc.gananciaHoy.q[0]), g_hi: n2(mc.gananciaHoy.q[4]), g_p1: pct(mc.gananciaHoy.pMayorQue1),
  m25_med: cap(fecha(mc.hitos.m25.cuantiles[2])), m25_p2027: pct(mc.hitos.m25.antesDeFinDe[2027]),
  m2000_med: cap(fecha(mc.hitos.m2000.cuantiles[2])), m2000_p2030: pct(mc.hitos.m2000.antesDeFinDe[2030]),
  eco_med: cap(fecha(mc.hitos.eco99.cuantiles[2])), eco_p2030: pct(mc.hitos.eco99.antesDeFinDe[2030]),
  loop_p2027: pct(mc.hitos.loop.antesDeFinDe[2027]), loop_p2030: pct(mc.hitos.loop.antesDeFinDe[2030]),
  m25_central: fecha(central.hitos.m25), m25_congelado: reach(frozen, 'm25'), m2000_congelado: reach(frozen, 'm2000'),
  retro_dentro: retroRows.filter(r => r.in).length, retro_total: retroRows.length, retro_arriba: retroRows.filter(r => r.above).length,
  slope_lo: n2(slope[0]), slope_hi: n2(slope[2]),
  n_stocks: M.STOCKS.length, n_aux: M.AUX.length, n_params: Object.keys(M.PARAMS).length, n_priors: Object.keys(priors).length,
  n_propios: Object.values(M.PARAMS).filter(p => p[4] === 'propio').length,
  n_fuentes: fuentes.filter(f => f.cotejo !== 'propio').length, n_secundarias: fuentes.filter(f => f.cotejo === 'secundario').length,
  kwa_ref: kwa.toFixed(1), repro_max: n2(Math.max(...dateDevs)),
};
if (retroRows.some(r => !r.in && !r.above)) throw new Error('la retroprueba tiene desvíos por debajo: revisar la prosa del tercer hallazgo');

const DATA = { mc, retro: { ajuste: retro.ajuste }, repro, esc, obs, pred, puntaje, fuentes };
let html = await text('pagina/pagina.src.html');
html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => { if (!(k in cifras)) throw new Error(`cifra sin resolver: ${k}`); return cifras[k]; });
const inline = { '/*FONTS*/': fonts, '/*TOKENS*/': tokens, '/*DATA*/': JSON.stringify(DATA).replace(/</g, '\\u003c'), '/*MOTOR*/': await text('modelo/motor.js'), '/*GRAFICOS*/': await text('pagina/graficos.js'), '/*DIAGRAMA*/': await text('pagina/diagrama.js'), '/*APP*/': await text('pagina/app.js') };
for (const [mark, body] of Object.entries(inline)) { if (!html.includes(mark)) throw new Error(`falta el marcador ${mark}`); html = html.replace(mark, () => body); }
await mkdir(join(ROOT, 'out'), { recursive: true });
await writeFile(join(ROOT, 'out', 'dinamica-ia.html'), html);
console.log(`out/dinamica-ia.html · ${(html.length / 1024).toFixed(0)} KB`);
console.log(cifras);
