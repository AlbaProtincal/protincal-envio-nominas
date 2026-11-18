// Prueba de la división contra PDF reales (fuera del repositorio):
//   node herramientas/prueba-dividir.mjs <mes> <año> <carpeta_salida> <pdf>...
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';
import { dividirPdf } from '../src/dividir.js';

const [, , mes, anio, salida, ...pdfs] = process.argv;
for (const ruta of pdfs) {
  const r = await dividirPdf(new Uint8Array(readFileSync(ruta)), Number(mes), Number(anio), { pdfjs, PDFDocument });
  console.log(`\n${basename(ruta)} → ${r.ok ? `${r.empresa} (${r.cif})` : 'NO SE DIVIDE'}`);
  r.errores.forEach((e) => console.log(`  ERROR: ${e}`));
  const dir = join(salida, basename(ruta, '.pdf'));
  if (r.ok) mkdirSync(dir, { recursive: true });
  for (const s of r.salidas) {
    writeFileSync(join(dir, s.nombre), s.bytes);
    console.log(`  ${s.nombre}  (${s.bytes.length} bytes)`);
  }
}
