// Tablero de contabilización. Datos INVENTADOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerControl, tablero, marcar, estadoVacio, PASO, esExcelCostes, textoPaso } from '../src/contabilidad.js';

const CAB = ['Fichero origen', 'Cód. empresa', 'NIF', 'Razón social', 'Estado', 'Fichero importación', 'Trabajadores',
  'Total bruto', 'Total líquido', 'Total liquidación SS'];
const CAB_RLC = [...CAB, 'Total RLC (NIF)', 'Dif. RLC (NIF)'];
const CABI = ['Fichero', 'Nivel', 'Cód. trabajador', 'Trabajador', 'Detalle'];

const control = leerControl({
  Resumen: [CAB,
    ['luna costes 11.xlt', '1', 'B11111111', 'PANADERIA LUNA SL', 'OK', 'luna importar 11.xlsx', 2, 3000, 2500, 900],
    ['sol costes 11.xlt', '2', 'B22222222', 'TALLERES SOL SL', 'REVISAR', 'sol importar 11.xlsx', 3, 5000, 4000, 1500],
    ['mar costes 11.xlt', '3', 'B33333333', 'FERRETERIA MAR SL', 'ERROR', 'mar importar 11.xlsx', 1, 1000, 900, 300],
    ['ana costes 11.xlt', '4', '12345678Z', 'GARCIA ANA', 'ERROR', 'ana importar 11.xlsx', 1, 1200, 1100, 0],
    ['vega costes 11.xlt', '5', 'B55555555', 'GIMNASIO VEGA SL', 'OK', 'vega importar 11.xlsx', 1, 800, 700, 200],
    ['vega centro2 costes 11.xlt', '6', 'B55555555', 'GIMNASIO VEGA SL', 'OK', 'vega importar 11 (2).xlsx', 1, 900, 800, 250]],
  Incidencias: [CABI,
    ['sol costes 11.xlt', 'REVISAR', '3', 'ROCA, PABLO', 'Prestaciones IT pago delegado restadas'],
    ['mar costes 11.xlt', 'ERROR', '7', 'GIL, EVA', 'Trabajador sin ficha identificable en Quantum'],
    ['ana costes 11.xlt', 'ERROR', '', '', 'NIF 12345678Z sin trabajadores en la tabla de Quantum'],
    ['luna costes 11.xlt', 'INFO', '2', 'LUZ, MAR', 'Código nóminas 2 → código Quantum 5']],
});
control.modificado = 1000;
const costes = ['luna', 'sol', 'mar', 'ana', 'vega', 'vega centro2'].map((n) => ({ nombre: `${n} costes 11.xlt`, modificado: 500 }));
const fila = (t, nif) => t.filas.find((f) => f.nif === nif);

test('qué ficheros son Excel de costes', () => {
  assert.ok(esExcelCostes('avance costes 10.xls'));
  assert.ok(esExcelCostes('raro sin la palabra.xlsx'));
  assert.ok(!esExcelCostes('aets nom 11.pdf'));
  assert.ok(!esExcelCostes('aets importar 11.xlsx'));
  assert.ok(!esExcelCostes('~$luna costes 11.xlsx'));
});

test('sin marcas: cada empresa en su paso', () => {
  const t = tablero({ costes, control });
  assert.equal(fila(t, 'B11111111').paso, PASO.IMPORTAR);
  assert.equal(fila(t, 'B22222222').paso, PASO.IMPORTAR);
  assert.equal(fila(t, 'B22222222').generado, 'REVISAR');
  assert.equal(fila(t, 'B33333333').paso, PASO.ERROR);
  assert.match(textoPaso(fila(t, 'B33333333')), /sin ficha/);
  assert.equal(fila(t, '12345678Z').paso, PASO.FUERA);
  assert.equal(t.cuentas.importar, 3);
  assert.equal(t.cuentas.atencion, 1);
  assert.equal(t.cuentas.fuera, 1);
});

test('dos Excel con el mismo NIF son una sola empresa', () => {
  const t = tablero({ costes, control });
  const v = fila(t, 'B55555555');
  assert.equal(v.ficheros.length, 2);
  assert.deepEqual(v.salidas, ['vega importar 11.xlsx', 'vega importar 11 (2).xlsx']);
  assert.equal(v.liqSS, 450);
});

test('Excel de costes nuevo o cambiado después de generar: hay que generar', () => {
  const t = tablero({
    costes: [...costes.map((c) => (c.nombre.startsWith('luna') ? { ...c, modificado: 2000 } : c)), { nombre: 'pico costes 11.xls', modificado: 1500 }],
    control,
  });
  assert.equal(fila(t, 'B11111111').paso, PASO.GENERAR);
  const pico = t.filas.find((f) => f.nombre === 'pico');
  assert.equal(pico.paso, PASO.GENERAR);
  assert.match(textoPaso(pico), /sin procesar/);
});

test('sin CONTROL todavía: todos los Excel por generar', () => {
  const t = tablero({ costes, control: null });
  assert.equal(t.filas.length, 6);
  assert.ok(t.filas.every((f) => f.paso === PASO.GENERAR));
  assert.equal(t.hayControl, false);
});

test('marcar importado y luego cuadre y revisión', () => {
  let g = estadoVacio(11, 2026);
  g = marcar(g, 'B11111111', 'importado', true, { quien: 'alba@protincal.es', cuando: '2026-11-21T10:00:00Z' });
  let t = tablero({ costes, control, guardado: g });
  assert.equal(fila(t, 'B11111111').paso, PASO.CUADRAR);
  assert.equal(fila(t, 'B11111111').importado.quien, 'alba@protincal.es');

  const cuadre = leerControl({
    Resumen: [CAB_RLC, ['luna costes 11.xlt', '1', 'B11111111', 'PANADERIA LUNA SL', 'OK', 'x', 2, 3000, 2500, 900, 900.02, -0.02]],
    Incidencias: [CABI],
  });
  t = tablero({ costes, control, cuadre, guardado: g });
  assert.equal(fila(t, 'B11111111').cuadre.estado, 'ok');
  assert.equal(fila(t, 'B11111111').paso, PASO.REVISAR);

  g = marcar(g, 'B11111111', 'revisado', true, { quien: 'claude' });
  t = tablero({ costes, control, cuadre, guardado: g });
  assert.equal(fila(t, 'B11111111').paso, PASO.CERRADA);
});

test('descuadre con el RLC y RLC sin Excel de costes', () => {
  const g = marcar(estadoVacio(11, 2026), 'B22222222', 'importado', true, { quien: 'a' });
  const cuadre = leerControl({
    Resumen: [CAB_RLC, ['sol costes 11.xlt', '2', 'B22222222', 'TALLERES SOL SL', 'ERROR', 'x', 3, 5000, 4000, 1500, 1450, 50]],
    Incidencias: [CABI, ['(sin Excel de costes)', 'ERROR', '', 'IVEU SL', 'Hay RLC (300.00, NIF B99999999) pero no Excel de costes procesado']],
  });
  const t = tablero({ costes, control, cuadre, guardado: g });
  assert.equal(fila(t, 'B22222222').paso, PASO.DESCUADRE);
  assert.match(textoPaso(fila(t, 'B22222222')), /50,00 €/);
  assert.equal(t.rlcSinExcel.length, 1);
  assert.equal(t.cuentas.atencion, 3); // error de mar + descuadre de sol + RLC sin Excel
});

test('deshacer la importación borra también la revisión', () => {
  let g = marcar(estadoVacio(11, 2026), 'B1', 'importado', true, { quien: 'a' });
  g = marcar(g, 'B1', 'revisado', true, { quien: 'a' });
  const g2 = marcar(g, 'B1', 'importado', false, { quien: 'a' });
  assert.deepEqual(g2.empresas.B1, {});
  assert.ok(g.empresas.B1.revisado, 'el original no se modifica');
});

test('una empresa con ERROR que ya se importó sigue su curso', () => {
  const g = marcar(estadoVacio(11, 2026), 'B33333333', 'importado', true, { quien: 'a' });
  const t = tablero({ costes, control, guardado: g });
  assert.equal(fila(t, 'B33333333').paso, PASO.CUADRAR);
});

test('descuadre ya corregido en Quantum y empresa cerrada sin importar', () => {
  const g = estadoVacio(11, 2026);
  g.empresas.B22222222 = { importado: { cuando: 'x', quien: 'a' }, cuadreCorregido: { cuando: 'x', quien: 'claude', nota: 'coste SS al RLC' } };
  g.empresas.B33333333 = { descartada: { cuando: 'x', quien: 'claude', motivo: 'ya no es cliente' } };
  const cuadre = leerControl({
    Resumen: [CAB_RLC, ['sol costes 11.xlt', '2', 'B22222222', 'TALLERES SOL SL', 'ERROR', 'x', 3, 5000, 4000, 1500, 1450, 50]],
    Incidencias: [CABI],
  });
  const t = tablero({ costes, control, cuadre, guardado: g });
  assert.equal(fila(t, 'B22222222').cuadre.estado, 'corregido');
  assert.equal(fila(t, 'B22222222').paso, PASO.REVISAR);
  assert.equal(fila(t, 'B33333333').paso, PASO.CERRADA);
  assert.match(textoPaso(fila(t, 'B33333333')), /sin importar: ya no es cliente/);
});
