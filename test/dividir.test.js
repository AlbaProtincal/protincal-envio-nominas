// Pruebas de la división de nóminas con datos INVENTADOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { analizarPagina, nombreFichero, planDivision, dividirPdf, leerPaginas } from '../src/dividir.js';
import { leerMaestro, prechequeo, ESTADO } from '../src/motor.js';

// Una página de nómina inventada, con la misma disposición que las reales.
function pagina({ empresa = 'EMPRESA INVENTADA S.L.', cif = 'B12345674', trabajador, dni, mes = 10, anio = 2026 }) {
  const mm = String(mes).padStart(2, '0');
  return [
    { str: 'EMPRESA (razón social)', x: 25, y: 824 }, { str: 'C.I.F.', x: 336, y: 824 },
    { str: empresa, x: 25, y: 813 }, { str: cif, x: 316, y: 813 }, { str: '28', x: 389, y: 813 },
    { str: 'TRABAJADOR (nombre)', x: 25, y: 779 }, { str: 'D.N.I.', x: 332, y: 779 },
    ...(trabajador ? [{ str: trabajador, x: 25, y: 768 }] : []),
    ...(dni ? [{ str: dni, x: 316, y: 768 }] : []),
    { str: '1400000000', x: 412, y: 768 },
    { str: `PERIODO DEVENGADO Del 01 de ${mm} al 31 de ${mm} de ${anio}`, x: 25, y: 745 },
    { str: 'SALARIO BASE', x: 120, y: 700 }, { str: '1.000,00', x: 400, y: 700 },
  ];
}
const ana = { trabajador: 'GARCIA LOPEZ, ANA', dni: '00000001R' };
const luis = { trabajador: 'RUIZ DEL RIO, LUIS M', dni: '00000002W' };

test('lee trabajador, DNI, empresa, CIF y periodo de una página', () => {
  assert.deepEqual(analizarPagina(pagina(ana)), {
    ok: true, empresa: 'EMPRESA INVENTADA S.L.', cif: 'B12345674',
    trabajador: 'GARCIA LOPEZ, ANA', dni: '00000001R', mes: 10, anio: 2026,
  });
});

test('nombre del fichero: NOMBRE APELLIDOS nom MM', () => {
  assert.equal(nombreFichero('GARCIA LOPEZ, ANA', 10), 'ANA GARCIA LOPEZ nom 10.pdf');
  assert.equal(nombreFichero('Ruiz del Río, Luis M.', 3), 'LUIS M RUIZ DEL RÍO nom 03.pdf');
  assert.equal(nombreFichero('SIN/COMA: RARO', 1), 'SIN COMA RARO nom 01.pdf');
});

test('una página por trabajador: un fichero por página', () => {
  const plan = planDivision([pagina(ana), pagina(luis)].map(analizarPagina), 10, 2026);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ficheros.map((f) => [f.nombre, f.paginas]), [
    ['ANA GARCIA LOPEZ nom 10.pdf', [0]], ['LUIS M RUIZ DEL RIO nom 10.pdf', [1]],
  ]);
});

test('nómina de dos hojas: las dos páginas van al mismo fichero', () => {
  const plan = planDivision([pagina(ana), pagina(ana), pagina(luis)].map(analizarPagina), 10, 2026);
  assert.deepEqual(plan.ficheros.map((f) => f.paginas), [[0, 1], [2]]);
});

test('una página ilegible bloquea toda la división', () => {
  const plan = planDivision([pagina(ana), pagina({ trabajador: 'SIN DNI, PEPE' })].map(analizarPagina), 10, 2026);
  assert.equal(plan.ok, false);
  assert.equal(plan.ficheros.length, 0);
  assert.match(plan.errores[0], /Página 2/);
});

test('nóminas de otro mes: no se divide', () => {
  const plan = planDivision([pagina({ ...ana, mes: 9 })].map(analizarPagina), 10, 2026);
  assert.equal(plan.ok, false);
  assert.match(plan.errores[0], /09\/2026/);
});

test('PDF con nóminas de dos empresas: no se divide', () => {
  const plan = planDivision([pagina(ana), pagina({ ...luis, cif: 'B76543214' })].map(analizarPagina), 10, 2026);
  assert.equal(plan.ok, false);
  assert.match(plan.errores[0], /varias empresas/);
});

test('dos trabajadores distintos con el mismo nombre: no se divide', () => {
  const plan = planDivision([pagina(ana), pagina({ ...ana, dni: '00000003A' })].map(analizarPagina), 10, 2026);
  assert.equal(plan.ok, false);
  assert.match(plan.errores[0], /mismo fichero/);
});

test('de punta a punta: un PDF de dos nóminas sale como dos PDF, cada uno con su trabajador', async () => {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  for (const t of [ana, luis]) {
    const hoja = doc.addPage([595, 842]);
    for (const it of pagina(t)) hoja.drawText(it.str.replace('ó', 'o'), { x: it.x, y: it.y, size: 8, font: fuente });
  }
  const r = await dividirPdf(await doc.save(), 10, 2026, { pdfjs, PDFDocument });
  assert.equal(r.ok, true, r.errores.join(' | '));
  assert.deepEqual(r.salidas.map((s) => s.nombre), ['ANA GARCIA LOPEZ nom 10.pdf', 'LUIS M RUIZ DEL RIO nom 10.pdf']);
  for (const [i, t] of [ana, luis].entries()) {
    const paginas = await leerPaginas(r.salidas[i].bytes, pdfjs);
    assert.equal(paginas.length, 1);
    assert.equal(analizarPagina(paginas[0]).dni, t.dni);
  }
});

// ---- Cómo lo usa el motor ---------------------------------------------------------
const CAB = ['ALIAS', 'RAZÓN SOCIAL', 'EMAIL', 'RECIBE', 'NOTAS', 'NÓMINAS INDIVIDUALES'];
const M = leerMaestro([CAB, ['inventada', 'EMPRESA INVENTADA SL', 'inv@example.com', 'AMBAS', null, 'SI']]).filas;
const ss = { rnt: [{ ruta: 'EMPRESA INVENTADA SL.pdf' }], rlc: [{ ruta: 'EMPRESA INVENTADA SL.pdf' }] };

test('cliente de nóminas individuales sin dividir: PENDIENTE, y la conjunta nunca se adjunta', () => {
  const r = prechequeo({ mes: 10, anio: 2026, maestro: M, nominas: [{ ruta: 'inventada nom 10.pdf' }], ...ss });
  const c = r.clientes[0];
  assert.equal(c.estado, ESTADO.PENDIENTE);
  assert.deepEqual(c.faltan, ['dividir la nómina en individuales']);
  assert.deepEqual(c.porDividir, { origen: 'inventada nom 10.pdf', destino: 'INVENTADA' });
  assert.equal(c.adjuntos.length, 0);
});

test('ya dividida: LISTO con las individuales', () => {
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: M, ...ss,
    nominas: [{ ruta: 'inventada nom 10.pdf', modificado: 100 },
      { ruta: 'INVENTADA/ANA GARCIA LOPEZ nom 10.pdf', modificado: 200 },
      { ruta: 'INVENTADA/LUIS M RUIZ DEL RIO nom 10.pdf', modificado: 200 }],
  });
  const c = r.clientes[0];
  assert.equal(c.estado, ESTADO.LISTO);
  assert.equal(c.cuenta.nominas, 2);
  assert.equal(c.porDividir, null);
});

test('la conjunta se volvió a guardar después de dividir: hay que dividir otra vez', () => {
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: M, ...ss,
    nominas: [{ ruta: 'inventada nom 10.pdf', modificado: 300 },
      { ruta: 'INVENTADA/ANA GARCIA LOPEZ nom 10.pdf', modificado: 200 }],
  });
  const c = r.clientes[0];
  assert.equal(c.estado, ESTADO.PENDIENTE);
  assert.match(c.faltan[0], /volver a dividir/);
  assert.equal(c.adjuntos.length, 0);
});
