// Envío de cada nómina al correo de su trabajador. Datos INVENTADOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerMaestro, prechequeo, claveTrabajador, ESTADO } from '../src/motor.js';

const CAB = ['ALIAS', 'RAZÓN SOCIAL', 'EMAIL', 'RECIBE', 'NOTAS', 'NÓMINAS INDIVIDUALES'];
const CABT = ['EMPRESA', 'NOMBRE EN LA NÓMINA', 'EMAIL'];
const TABLA = [CAB, ['asociacion;asoc barrio', null, null, 'NOMINA', null, 'TRABAJADOR']];
const TRAB = [CABT,
  ['asociacion', 'Mª ANA GIL SANZ', 'ana@example.com'],
  ['asociacion', 'PABLO ROCA LIMA', 'pablo@example.com']];
const M = leerMaestro(TABLA, TRAB).filas;
const f = (ruta, modificado = 200) => ({ ruta, bytes: 1000, modificado });
const DIVIDIDA = [f('asociacion nom 10.pdf', 100), f('ASOCIACION/Mª ANA GIL SANZ nom 10.pdf'), f('ASOCIACION/PABLO ROCA LIMA nom 10.pdf')];
const pre = (extra) => prechequeo({ mes: 10, anio: 2026, maestro: M, nominas: DIVIDIDA, rnt: [], rlc: [], ...extra });

test('la clave del trabajador sale del nombre del fichero', () => {
  assert.equal(claveTrabajador('Mª ANA GIL SANZ nom 10.pdf'), 'ma ana gil sanz');
});

test('maestro: modo TRABAJADOR y sus trabajadores', () => {
  assert.equal(M[0].envio, 'TRABAJADOR');
  assert.equal(M[0].trabajadores.length, 2);
});

test('sin dividir: una línea PENDIENTE para la empresa, con lo que hay que dividir', () => {
  const r = pre({ nominas: [f('asociacion nom 10.pdf')] });
  assert.equal(r.clientes.length, 1);
  assert.equal(r.clientes[0].estado, ESTADO.PENDIENTE);
  assert.deepEqual(r.clientes[0].porDividir, { origen: 'asociacion nom 10.pdf', destino: 'ASOCIACION' });
});

test('dividida: un correo por trabajador, cada uno solo con su nómina y a su correo', () => {
  const r = pre();
  assert.equal(r.listos.length, 2);
  assert.deepEqual(r.listos.map((c) => [c.email, c.adjuntos.map((a) => a.ruta)]), [
    ['ana@example.com', ['ASOCIACION/Mª ANA GIL SANZ nom 10.pdf']],
    ['pablo@example.com', ['ASOCIACION/PABLO ROCA LIMA nom 10.pdf']],
  ]);
  assert.equal(r.listos[0].asunto, 'NOMINA OCTUBRE 2026');
  assert.equal(r.huerfanos.length, 0);
});

test('trabajador nuevo: su nómina no se envía a nadie y se pide el correo', () => {
  const r = pre({ nominas: [...DIVIDIDA, f('ASOCIACION/EVA SOL MAR nom 10.pdf')] });
  assert.equal(r.listos.length, 2);
  assert.deepEqual(r.nuevas.trabajadores, [{ empresa: 'asociacion', nombre: 'EVA SOL MAR', ruta: 'ASOCIACION/EVA SOL MAR nom 10.pdf' }]);
  const eva = r.clientes.find((c) => c.id.includes('EVA'));
  assert.equal(eva.estado, ESTADO.INCIDENCIA);
  assert.equal(eva.adjuntos.length, 0);
});

test('un nombre parecido no vale: PABLO ROCA no recibe la nómina de PABLO ROCA LIMA', () => {
  const m = leerMaestro(TABLA, [CABT, ['asociacion', 'PABLO ROCA', 'otro@example.com']]).filas;
  const r = prechequeo({ mes: 10, anio: 2026, maestro: m, nominas: DIVIDIDA, rnt: [], rlc: [] });
  assert.equal(r.listos.length, 0);
  assert.equal(r.nuevas.trabajadores.length, 2);
});

test('ya enviado a una trabajadora: la otra sigue lista', () => {
  const r = pre({ enviadosOutlook: [{ para: 'ana@example.com', asunto: 'Nómina octubre 2026' }] });
  assert.equal(r.yaEnviados.length, 1);
  assert.deepEqual(r.listos.map((c) => c.email), ['pablo@example.com']);
});

test('trabajador sin nómina este mes: queda pendiente', () => {
  const r = pre({ nominas: DIVIDIDA.slice(0, 2) });
  assert.equal(r.listos.length, 1);
  assert.equal(r.pendientes.length, 1);
  assert.match(r.pendientes[0].id, /PABLO/);
});

test('la conjunta se guardó después de dividir: no sale nada hasta dividir otra vez', () => {
  const r = pre({ nominas: [f('asociacion nom 10.pdf', 300), ...DIVIDIDA.slice(1)] });
  assert.equal(r.listos.length, 0);
  assert.match(r.clientes[0].faltan[0], /volver a dividir/);
});

test('maestro incoherente: envío a trabajadores con seguros sociales es un error', () => {
  const { filas, errores } = leerMaestro([CAB, ['x', 'X SL', null, 'AMBAS', null, 'TRABAJADOR']], [CABT]);
  assert.equal(errores.length, 1);
  const r = prechequeo({ mes: 10, anio: 2026, maestro: filas, nominas: [f('x nom 10.pdf')], rnt: [], rlc: [] });
  assert.equal(r.listos.length, 0);
});

test('trabajador apuntado a una empresa que no existe: error de maestro', () => {
  const { errores } = leerMaestro(TABLA, [CABT, ['otra', 'ANA', 'a@example.com']]);
  assert.match(errores[0].detalle, /no es un alias/);
});
