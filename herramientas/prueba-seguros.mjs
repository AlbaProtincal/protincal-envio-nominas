// Prueba del corte de seguros sociales con PDF reales (fuera del repositorio):
//   node herramientas/prueba-seguros.mjs <mes> <año> <existentes.tsv|-> <pdf>...
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';
import { leerPaginas } from '../src/dividir.js';
import { analizarPaginaSS, planSS, cortarSS } from '../src/seguros.js';

const [, , mes, anio, existentes, ...pdfs] = process.argv;
const porFichero = {}; const bytes = {};
for (const ruta of pdfs) {
  const b = new Uint8Array(readFileSync(ruta));
  bytes[basename(ruta)] = b;
  porFichero[basename(ruta)] = (await leerPaginas(b.slice(), pdfjs)).map(analizarPaginaSS);
}
const plan = planSS(porFichero, { mes: Number(mes), anio: Number(anio) });
console.log('ok:', plan.ok, '| ficheros:', plan.ficheros.length);
plan.errores.forEach((e) => console.log('ERROR', e)); plan.avisos.forEach((a) => console.log('AVISO', a));
if (existentes !== '-') {
  const esperado = new Map(readFileSync(existentes, 'utf8').trim().split('\n').map((l) => l.split('\t')).map(([t, n, l]) => [`${t}:${l}`, n]));
  let iguales = 0; const distintos = [];
  for (const f of plan.ficheros) {
    const e = esperado.get(`${f.tipo}:${f.liquidacion}`);
    if (e === f.nombre) iguales += 1; else distintos.push(`${f.tipo} ${f.liquidacion}: app "${f.nombre}" · antes "${e ?? '(no existía)'}"`);
  }
  console.log(`coinciden con los ya renombrados: ${iguales} de ${plan.ficheros.length} (existían ${esperado.size})`);
  distintos.forEach((d) => console.log('  DISTINTO', d));
}
if (plan.ok) {
  const s = await cortarSS(plan, bytes, { PDFDocument });
  console.log('cortados:', s.length, '| páginas por fichero:', [...new Set(s.map((x) => x.paginas.length))].join(','));
}
