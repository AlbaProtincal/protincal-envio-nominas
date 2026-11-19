// Seguros sociales: división de los RLC/RNT conjuntos. Datos INVENTADOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarPaginaSS, planSS, nombreSS } from '../src/seguros.js';
import { pareceConjuntoSS } from '../src/motor.js';

const P = { mes: 9, anio: 2026 };
let n = 0;
const pag = (o) => ({ ok: true, tipo: 'RLC', razon: 'EMPRESA UNO SL', liquidacion: String(1000 + (n++)), ccc: '0111 28000000001',
  calificador: 'L00', mes: 9, anio: 2026, pagina: 1, de: 1, ...o });

test('lee una página de RLC con las palabras partidas en las tildes', () => {
  const items = [
    ['Recibo de Liquidaci', 300, 767, 90], ['ó', 390, 767, 5], ['n de Cotizaciones', 395, 767, 80],
    ['Raz', 25, 689, 15], ['ó', 40, 689, 5], ['n Social:', 45, 689, 35], ['GARCÍA', 90, 689, 30], ['LÓPEZ', 130, 689, 28],
    ['N', 330, 689, 6], ['ú', 336, 689, 5], ['mero de liquidaci', 341, 689, 70], ['ó', 411, 689, 5], ['n:', 416, 689, 8], ['28202600000000001', 430, 689, 80],
    ['Código de Cuenta de Cotización:', 25, 676, 120], ['0111 28000000001', 150, 676, 70],
    ['Período de Liquidación:', 25, 663, 90], ['09/2026 - 09/2026', 120, 663, 60],
    ['Calificador de Liquidación:', 25, 650, 100], ['L00 NORMAL', 130, 650, 40],
    ['Página 1 de 1', 500, 400, 50],
  ].map(([str, x, y, w]) => ({ str, x, y, w }));
  assert.deepEqual(analizarPaginaSS(items), {
    ok: true, tipo: 'RLC', razon: 'GARCÍA LÓPEZ', liquidacion: '28202600000000001', ccc: '0111 28000000001',
    calificador: 'L00', mes: 9, anio: 2026, pagina: 1, de: 1,
  });
});

test('nombre de fichero: razón social tal cual, sin caracteres que Windows no admite', () => {
  assert.equal(nombreSS('COUNTERFOG S.L.'), 'COUNTERFOG S.L..pdf');
  assert.equal(nombreSS('A/B: C', 2), 'A B C (2).pdf');
});

test('reconoce los PDF conjuntos por el nombre', () => {
  for (const x of ['RLC.pdf', 'rnt.pdf', 'RLC (1).pdf', 'rlc-1.pdf', 'RNT 2.pdf']) assert.ok(pareceConjuntoSS(x), x);
  for (const x of ['RLC EMPRESA SL.pdf', 'COUNTERFOG S.L..pdf', 'RLC.xlsx']) assert.ok(!pareceConjuntoSS(x), x);
});

test('una liquidación por página: un fichero por empresa y la normal sin número, las demás con (2)', () => {
  const rlc = [pag({ razon: 'UNO SL', liquidacion: '20', calificador: 'L13' }), pag({ razon: 'DOS SL', liquidacion: '30' }),
    pag({ razon: 'UNO SL', liquidacion: '10' })];
  const rnt = rlc.map((p) => ({ ...p, tipo: 'RNT' }));
  const plan = planSS({ 'RLC/RLC.pdf': rlc, 'RNT/RNT.pdf': rnt }, P);
  assert.equal(plan.ok, true, plan.errores.join(' | '));
  const de = (t) => plan.ficheros.filter((f) => f.tipo === t).map((f) => [f.liquidacion, f.nombre]);
  assert.deepEqual(de('RLC'), [['20', 'UNO SL (2).pdf'], ['30', 'DOS SL.pdf'], ['10', 'UNO SL.pdf']]);
  assert.deepEqual(de('RNT'), de('RLC'));
  assert.equal(plan.avisos.length, 0);
});

test('una liquidación de varias páginas va entera a un fichero', () => {
  const plan = planSS({ 'RNT/RNT.pdf': [
    pag({ tipo: 'RNT', liquidacion: '1', pagina: 1, de: 2 }), pag({ tipo: 'RNT', liquidacion: '1', pagina: 2, de: 2 }),
    pag({ tipo: 'RNT', razon: 'OTRA SL', liquidacion: '2' }),
  ] }, P);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ficheros.map((f) => f.paginas), [[0, 1], [2]]);
});

test('falta una página de una liquidación: no se divide nada', () => {
  const plan = planSS({ 'RNT/RNT.pdf': [pag({ tipo: 'RNT', liquidacion: '1', pagina: 1, de: 2 }), pag({ tipo: 'RNT', liquidacion: '2' })] }, P);
  assert.equal(plan.ok, false);
  assert.equal(plan.ficheros.length, 0);
});

test('una página ilegible bloquea ese PDF entero', () => {
  const plan = planSS({ 'RLC/RLC.pdf': [pag({}), { ok: false, tipo: 'RLC', error: 'No encuentro la razón social' }] }, P);
  assert.equal(plan.ok, false);
  assert.match(plan.errores[0], /página 2/);
});

test('seguros sociales de otro mes: no se divide', () => {
  const plan = planSS({ 'RLC/RLC.pdf': [pag({ mes: 8 })] }, P);
  assert.equal(plan.ok, false);
  assert.match(plan.errores[0], /08\/2026/);
});

test('liquidación con RLC pero sin RNT: se avisa', () => {
  const plan = planSS({ 'RLC/RLC.pdf': [pag({ liquidacion: '1' }), pag({ razon: 'DOS SL', liquidacion: '2' })],
    'RNT/RNT.pdf': [pag({ tipo: 'RNT', liquidacion: '1' })] }, P);
  assert.equal(plan.ok, true);
  assert.equal(plan.avisos.length, 1);
  assert.match(plan.avisos[0], /DOS SL/);
});

test('la misma liquidación dos veces en los RLC: no se divide', () => {
  const plan = planSS({ 'RLC/RLC.pdf': [pag({ liquidacion: '1' }), pag({ razon: 'OTRA', liquidacion: '9' }), pag({ liquidacion: '1' })] }, P);
  assert.equal(plan.ok, false);
});
