// Prueba del motor contra un mes real. Los datos NO están en el repositorio:
//   node herramientas/prueba-real.mjs <maestro.json> <listado.tsv> <mes> <año> [corte_epoch] [alias_ya_enviados,...]
// listado.tsv: NOM|SS <tab> ruta <tab> bytes <tab> mtime_epoch
import { readFileSync } from 'node:fs';
import { leerMaestro, prechequeo } from '../src/motor.js';

const [, , fMaestro, fListado, mes, anio, corte, enviados] = process.argv;
const { filas, errores } = leerMaestro(JSON.parse(readFileSync(fMaestro, 'utf8')));
const lineas = readFileSync(fListado, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const hasta = corte ? Number(corte) : Infinity;
const nominas = [], rnt = [], rlc = [], posteriores = [];
for (const [tipo, ruta, bytes, mtime] of lineas) {
  if (Number(mtime) > hasta) { posteriores.push(ruta); continue; }
  const f = { ruta, bytes: Number(bytes) };
  if (tipo === 'NOM') nominas.push(f);
  else if (ruta.startsWith('RNT/')) rnt.push({ ...f, ruta: ruta.slice(4) });
  else if (ruta.startsWith('RLC/')) rlc.push({ ...f, ruta: ruta.slice(4) });
}
const r = prechequeo({
  mes: Number(mes), anio: Number(anio), maestro: filas, nominas, rnt, rlc,
  yaEnviados: enviados ? enviados.split(',') : [],
});
const fmt = (c) => `  ${c.id.padEnd(16)} ${c.email.padEnd(38)} nom ${c.cuenta.nominas} · RNT ${c.cuenta.rnt} · RLC ${c.cuenta.rlc}` +
  (c.faltan.length ? `  FALTA: ${c.faltan.join(', ')}` : '') + (c.avisos.length ? `  [${c.avisos.join(' | ')}]` : '');
console.log(`Asunto base: ${r.asuntoBase} · SS ${r.periodoSS.mes}/${r.periodoSS.anio}`);
if (errores.length) console.log('ERRORES DE MAESTRO', errores);
for (const [t, l] of [['LISTOS', r.listos], ['PENDIENTES', r.pendientes], ['YA ENVIADOS', r.yaEnviados],
  ['INCIDENCIAS', r.incidencias], ['NO SE ENVÍA', r.noSeEnvia]]) {
  console.log(`\n${t} (${l.length})`); l.forEach((c) => console.log(fmt(c)));
}
console.log(`\nHUÉRFANOS (${r.huerfanos.length})`); r.huerfanos.forEach((h) => console.log(`  ${h.carpeta}/${h.ruta} — ${h.motivo}`));
console.log(`\nAMBIGUOS (${r.ambiguos.length})`); r.ambiguos.forEach((h) => console.log(`  ${h.carpeta}/${h.ruta} — ${h.filas.join(', ')}`));
console.log(`\nIgnorados (costes, importaciones…): ${r.ignorados.length}` + (corte ? ` · posteriores al corte: ${posteriores.length}` : ''));
