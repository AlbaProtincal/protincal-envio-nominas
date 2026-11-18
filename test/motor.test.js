// Pruebas del motor con datos INVENTADOS (ningún cliente real).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerMaestro, prechequeo, periodoSeguros, carpetasDelMes, palabras, textoCorreo, ESTADO } from '../src/motor.js';

const CABECERA = ['CLIENTE / ALIAS NÓMINA', 'RAZÓN SOCIAL en RNT/RLC', 'EMAIL', 'RECIBE', 'NOTAS'];
const maestro = (...filas) => leerMaestro([CABECERA, ...filas]).filas;
const f = (ruta, bytes = 1000) => ({ ruta, bytes });
const cliente = (r, id) => r.clientes.find((c) => c.id === id);

const BASE = maestro(
  ['panaderia', 'PANADERIA LUNA, S.L.', 'luna@example.com', 'AMBAS', null],
  ['taller;taler', 'TALLERES SOL SL', 'sol@example.com', 'AMBAS', null],
  ['ferreteria', null, 'ferre@example.com', 'NOMINA', null],
  ['gestoria', 'GESTORIA RIO SL', null, 'NADA', null],
);

test('periodo de seguros sociales: mes anterior, y enero va a diciembre del año anterior', () => {
  assert.deepEqual(periodoSeguros(5, 2026), { mes: 4, anio: 2026 });
  assert.deepEqual(periodoSeguros(1, 2026), { mes: 12, anio: 2025 });
  assert.deepEqual(carpetasDelMes(1, 2026), {
    nominas: 'Nóminas/012026',
    rnt: 'Seguros Sociales/2025/12.2025/RNT',
    rlc: 'Seguros Sociales/2025/12.2025/RLC',
  });
});

test('normalización: acentos, mayúsculas y puntuación no cuentan', () => {
  assert.deepEqual(palabras('PANADERÍA Luna, S.L.'), ['panaderia', 'luna', 's', 'l']);
});

test('cliente completo queda LISTO con sus tres documentos y los costes nunca se adjuntan', () => {
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: BASE,
    nominas: [f('panaderia nom 10.pdf'), f('panaderia costes 10.xls'), f('IMPORTAR QUANTUM/panaderia importar 10.xlsx')],
    rnt: [f('PANADERIA LUNA, S.L..pdf')],
    rlc: [f('PANADERIA LUNA, S.L..pdf')],
  });
  const c = cliente(r, 'panaderia');
  assert.equal(c.estado, ESTADO.LISTO);
  assert.equal(c.asunto, 'NOMINAS OCTUBRE 2026');
  assert.deepEqual(c.adjuntos.map((a) => `${a.carpeta}/${a.ruta}`), [
    'Nóminas/panaderia nom 10.pdf', 'RNT/PANADERIA LUNA, S.L..pdf', 'RLC/PANADERIA LUNA, S.L..pdf',
  ]);
  assert.equal(r.huerfanos.length, 0);
  assert.equal(r.ignorados.length, 2);
});

test('nunca se envía a medias: si falta la nómina queda PENDIENTE y sin adjuntos', () => {
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: BASE,
    nominas: [], rnt: [f('TALLERES SOL SL.pdf')], rlc: [f('TALLERES SOL SL.pdf')],
  });
  const c = cliente(r, 'taller');
  assert.equal(c.estado, ESTADO.PENDIENTE);
  assert.deepEqual(c.faltan, ['nómina']);
  assert.deepEqual(c.adjuntos, []);
});

test('varias cuentas de cotización: se adjuntan todas, "(2)" incluido', () => {
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: BASE,
    nominas: [f('nom taler 10.pdf')],
    rnt: [f('TALLERES SOL SL.pdf'), f('TALLERES SOL SL (2).pdf')],
    rlc: [f('TALLERES SOL SL.pdf'), f('TALLERES SOL SL (2).pdf')],
  });
  const c = cliente(r, 'taller');
  assert.equal(c.estado, ESTADO.LISTO);
  assert.deepEqual(c.cuenta, { nominas: 1, rnt: 2, rlc: 2 });
});

test('una razón social parecida NO casa: va a huérfanos y no se adjunta a nadie', () => {
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: BASE,
    nominas: [f('taller nom 10.pdf')],
    rnt: [f('TALLERES SOL Y LUNA SL.pdf')], rlc: [f('TALLERES SOL SL.pdf')],
  });
  assert.equal(cliente(r, 'taller').estado, ESTADO.PENDIENTE);
  assert.deepEqual(r.huerfanos.map((h) => h.ruta), ['TALLERES SOL Y LUNA SL.pdf']);
});

test('el alias casa por palabras completas, no por trozos de palabra', () => {
  const m = maestro(['sol', null, 'sol@example.com', 'NOMINA', null]);
  const r = prechequeo({ mes: 10, anio: 2026, maestro: m, nominas: [f('solera nom 10.pdf')], rnt: [], rlc: [] });
  assert.equal(cliente(r, 'sol').estado, ESTADO.PENDIENTE);
  assert.equal(r.huerfanos.length, 1);
});

test('nómina que casa con dos filas: incidencia en las dos, no se envía a ninguna', () => {
  const m = maestro(
    ['jose', null, 'a@example.com', 'NOMINA', null],
    ['jose garcia', null, 'b@example.com', 'NOMINA', null],
  );
  const r = prechequeo({ mes: 10, anio: 2026, maestro: m, nominas: [f('jose garcia nom 10.pdf')], rnt: [], rlc: [] });
  assert.equal(r.ambiguos.length, 1);
  assert.equal(cliente(r, 'jose').estado, ESTADO.INCIDENCIA);
  assert.equal(cliente(r, 'jose garcia').estado, ESTADO.INCIDENCIA);
  assert.equal(r.listos.length, 0);
});

test('dos PDF de nómina para el mismo cliente: incidencia, no se adivina', () => {
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: BASE,
    nominas: [f('ferreteria nom 10.pdf'), f('ferreteria nomina 10.pdf')], rnt: [], rlc: [],
  });
  assert.equal(cliente(r, 'ferreteria').estado, ESTADO.INCIDENCIA);
});

test('nómina de otro mes en la carpeta: huérfana', () => {
  const r = prechequeo({ mes: 10, anio: 2026, maestro: BASE, nominas: [f('ferreteria nom 09.pdf')], rnt: [], rlc: [] });
  assert.equal(cliente(r, 'ferreteria').estado, ESTADO.PENDIENTE);
  assert.match(r.huerfanos[0].motivo, /no termina/);
});

test('subcarpeta con el nombre del alias: se envían las nóminas individuales y no la conjunta', () => {
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: BASE,
    nominas: [f('panaderia nom 10.pdf'), f('PANADERIA/ANA nom 10.pdf'), f('PANADERIA/LUIS nom 10.pdf')],
    rnt: [f('PANADERIA LUNA, S.L..pdf')], rlc: [f('PANADERIA LUNA, S.L..pdf')],
  });
  const c = cliente(r, 'panaderia');
  assert.equal(c.estado, ESTADO.LISTO);
  assert.deepEqual(c.adjuntos.filter((a) => a.tipo === 'nomina').map((a) => a.ruta),
    ['PANADERIA/ANA nom 10.pdf', 'PANADERIA/LUIS nom 10.pdf']);
});

test('RECIBE = NADA: no se envía aunque tenga documentos, pero se avisa', () => {
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: BASE,
    nominas: [f('gestoria nom 10.pdf')], rnt: [f('GESTORIA RIO SL.pdf')], rlc: [],
  });
  const c = cliente(r, 'gestoria');
  assert.equal(c.estado, ESTADO.NO_SE_ENVIA);
  assert.equal(c.adjuntos.length, 0);
  assert.equal(r.huerfanos.length, 0);
  assert.equal(c.avisos.length, 1);
});

test('solo NOMINA: los seguros sociales no se adjuntan aunque existan', () => {
  const m = maestro(['ferreteria', 'FERRETERIA MAR SL', 'ferre@example.com', 'NOMINA', null]);
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: m,
    nominas: [f('ferreteria nom 10.pdf')], rnt: [f('FERRETERIA MAR SL.pdf')], rlc: [f('FERRETERIA MAR SL.pdf')],
  });
  const c = cliente(r, 'ferreteria');
  assert.equal(c.estado, ESTADO.LISTO);
  assert.deepEqual(c.adjuntos.map((a) => a.tipo), ['nomina']);
});

test('sin correo o con correo mal escrito: incidencia', () => {
  const m = maestro(
    ['uno', null, null, 'NOMINA', null],
    ['dos', null, 'dos@example', 'NOMINA', null],
  );
  const r = prechequeo({ mes: 10, anio: 2026, maestro: m, nominas: [f('uno nom 10.pdf'), f('dos nom 10.pdf')], rnt: [], rlc: [] });
  assert.equal(cliente(r, 'uno').estado, ESTADO.INCIDENCIA);
  assert.equal(cliente(r, 'dos').estado, ESTADO.INCIDENCIA);
});

test('ya enviado según el registro: no se reenvía (vale cualquier alias de la fila)', () => {
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: BASE, yaEnviados: ['Taler'],
    nominas: [f('taller nom 10.pdf')], rnt: [f('TALLERES SOL SL.pdf')], rlc: [f('TALLERES SOL SL.pdf')],
  });
  assert.equal(cliente(r, 'taller').estado, ESTADO.YA_ENVIADO);
  assert.equal(r.listos.length, 0);
});

test('ya enviado según Outlook: mismo destinatario y mismo asunto', () => {
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: BASE,
    enviadosOutlook: [{ para: 'FERRE@example.com', asunto: 'Nóminas octubre 2026' }],
    nominas: [f('ferreteria nom 10.pdf')], rnt: [], rlc: [],
  });
  assert.equal(cliente(r, 'ferreteria').estado, ESTADO.YA_ENVIADO);
});

test('dos clientes con el mismo correo: asuntos distintos, y enviar a uno no marca al otro', () => {
  const m = maestro(
    ['alfa', 'ALFA SL', 'grupo@example.com', 'AMBAS', null],
    ['beta', 'BETA SL', 'grupo@example.com', 'AMBAS', null],
  );
  const docs = {
    nominas: [f('alfa nom 10.pdf'), f('beta nom 10.pdf')],
    rnt: [f('ALFA SL.pdf'), f('BETA SL.pdf')], rlc: [f('ALFA SL.pdf'), f('BETA SL.pdf')],
  };
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: m, ...docs,
    enviadosOutlook: [{ para: 'grupo@example.com', asunto: 'NOMINAS OCTUBRE 2026 - ALFA SL' }],
  });
  assert.equal(cliente(r, 'alfa').estado, ESTADO.YA_ENVIADO);
  assert.equal(cliente(r, 'beta').estado, ESTADO.LISTO);
  assert.equal(cliente(r, 'beta').asunto, 'NOMINAS OCTUBRE 2026 - BETA SL');
});

test('RNT y RLC en número distinto: se avisa pero no bloquea', () => {
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: BASE,
    nominas: [f('taller nom 10.pdf')],
    rnt: [f('TALLERES SOL SL.pdf'), f('TALLERES SOL SL (2).pdf')], rlc: [f('TALLERES SOL SL.pdf')],
  });
  const c = cliente(r, 'taller');
  assert.equal(c.estado, ESTADO.LISTO);
  assert.ok(c.avisos.some((a) => a.includes('distinto')));
});

test('ningún fichero aparece en dos correos', () => {
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: BASE,
    nominas: [f('panaderia nom 10.pdf'), f('taller nom 10.pdf'), f('ferreteria nom 10.pdf')],
    rnt: [f('PANADERIA LUNA, S.L..pdf'), f('TALLERES SOL SL.pdf')],
    rlc: [f('PANADERIA LUNA, S.L..pdf'), f('TALLERES SOL SL.pdf')],
  });
  const todos = r.clientes.flatMap((c) => c.adjuntos.map((a) => `${a.carpeta}/${a.ruta}`));
  assert.equal(new Set(todos).size, todos.length);
  assert.equal(r.listos.length, 3);
});

test('maestro: RECIBE desconocido se detecta y esa fila no se envía', () => {
  const { filas, errores } = leerMaestro([CABECERA, ['x', null, 'x@example.com', 'TODO', null]]);
  assert.equal(errores.length, 1);
  const r = prechequeo({ mes: 10, anio: 2026, maestro: filas, nominas: [f('x nom 10.pdf')], rnt: [], rlc: [] });
  assert.equal(cliente(r, 'x').estado, ESTADO.INCIDENCIA);
});

test('empresa nueva: nómina y seguros sociales sin fila en el maestro se proponen como candidatos', () => {
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: BASE,
    nominas: [f('floristeria nom 10.pdf'), f('ferreteria nom 09.pdf')],
    rnt: [f('FLORES DEL VALLE SL.pdf'), f('FLORES DEL VALLE SL (2).pdf'), f('RNT.pdf')],
    rlc: [f('FLORES DEL VALLE SL.pdf'), f('RLC.pdf')],
  });
  assert.deepEqual(r.nuevas.nominas, [{ alias: 'floristeria', ruta: 'floristeria nom 10.pdf' }]);
  assert.deepEqual(r.nuevas.seguros, [{
    razon: 'FLORES DEL VALLE SL',
    rnt: ['FLORES DEL VALLE SL.pdf', 'FLORES DEL VALLE SL (2).pdf'], rlc: ['FLORES DEL VALLE SL.pdf'],
  }]);
  assert.equal(r.nuevas.sinRenombrar.length, 2);
  assert.equal(r.nuevas.otros.length, 1); // la nómina de otro mes no es una empresa nueva
});

test('empresa nueva: al añadirla al maestro con su correo pasa a LISTO', () => {
  const m = leerMaestro([CABECERA, ['floristeria', 'FLORES DEL VALLE SL', 'flores@example.com', 'AMBAS', null]]).filas;
  const r = prechequeo({
    mes: 10, anio: 2026, maestro: m,
    nominas: [f('floristeria nom 10.pdf')], rnt: [f('FLORES DEL VALLE SL.pdf')], rlc: [f('FLORES DEL VALLE SL.pdf')],
  });
  assert.equal(cliente(r, 'floristeria').estado, ESTADO.LISTO);
  assert.equal(r.huerfanos.length, 0);
});

test('texto del correo según lo que se adjunta', () => {
  const t = (nNominas, tieneSS, aTrabajador) => textoCorreo({ nNominas, tieneSS, aTrabajador }).replace(/\n+/g, ' ');
  assert.equal(t(1, false), 'Buenos días, Adjunto la nómina del mes en curso.');
  assert.equal(t(3, false), 'Buenos días, Adjunto las nóminas del mes en curso.');
  assert.equal(t(3, true), 'Buenos días, Adjunto las nóminas y seguros sociales del mes en curso.');
  assert.equal(t(1, true), 'Buenos días, Adjunto la nómina y seguros sociales del mes en curso.');
  assert.equal(t(0, true), 'Buenos días, Adjunto los seguros sociales del mes en curso.');
  assert.equal(t(1, false, true), 'Buenos días, se adjunta la nómina del mes en curso.');
});

test('un PDF conjunto con varias nóminas dentro cuenta como varias nóminas', () => {
  const m = maestro(['ferreteria', null, 'ferre@example.com', 'NOMINA', null]);
  const una = prechequeo({ mes: 10, anio: 2026, maestro: m, nominas: [{ ruta: 'ferreteria nom 10.pdf', nominas: 1 }], rnt: [], rlc: [] });
  const varias = prechequeo({ mes: 10, anio: 2026, maestro: m, nominas: [{ ruta: 'ferreteria nom 10.pdf', nominas: 5 }], rnt: [], rlc: [] });
  assert.match(una.listos[0].texto, /Adjunto la nómina del/);
  assert.match(varias.listos[0].texto, /Adjunto las nóminas del/);
});

test('cuerpo del correo: texto, firma, logo incrustado y aviso legal; el texto se escapa', async () => {
  const { cuerpoHtml, CID_LOGO } = await import('../src/correo.js');
  const html = cuerpoHtml('Buenos días,\n\nAdjunto la nómina <del mes>.');
  assert.match(html, /<p[^>]*>Buenos días,<\/p><p[^>]*>Adjunto la nómina &lt;del mes&gt;\.<\/p>/);
  assert.ok(html.includes('Muchas gracias, un saludo.<br>Alba Jurado - Protincal Asesores.'));
  assert.ok(html.includes(`src="cid:${CID_LOGO}"`));
  assert.ok(html.includes('gestion@protincal.es'));
  assert.equal((html.match(/Muchas gracias/g) ?? []).length, 1);
});
