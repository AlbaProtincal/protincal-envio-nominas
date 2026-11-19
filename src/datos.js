// Reúne todo lo que necesita el motor para un mes, leyéndolo de OneDrive y del correo.
import { CONFIG } from './config.js';
import { carpetasDelMes, dosCifras, palabras, pareceConjuntoSS, periodoSeguros } from './motor.js';
import { analizarPaginaSS, planSS, cortarSS } from './seguros.js';
import { analizarPagina, leerPaginas } from './dividir.js';
import * as graph from './graph.js';
import { leerXlsx } from './xlsx.js';

let pdfjs = null;
async function cargarPdfjs() {
  if (!pdfjs) {
    pdfjs = await import('../vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

const nominasPorPdf = new Map(); // id + fecha de modificación → nº de nóminas dentro

/** Cuántas nóminas (trabajadores distintos) hay dentro de un PDF. null si no se ha podido leer. */
async function contarNominas(f) {
  const clave = `${f.id}:${f.modificado}`;
  if (nominasPorPdf.has(clave)) return nominasPorPdf.get(clave);
  let n = null;
  try {
    const paginas = (await leerPaginas(await graph.descargar(f), await cargarPdfjs())).map(analizarPagina);
    n = paginas.every((p) => p.ok) ? new Set(paginas.map((p) => p.dni)).size : Math.max(paginas.length, 1);
  } catch { /* se avisa más abajo */ }
  if (n !== null) nominasPorPdf.set(clave, n);
  return n;
}

async function enTandas(lista, tamano, tarea) {
  for (let i = 0; i < lista.length; i += tamano) await Promise.all(lista.slice(i, i + tamano).map(tarea));
}

const aFichero = (f, carpeta = '') => ({
  ruta: carpeta ? `${carpeta}/${f.nombre}` : f.nombre,
  bytes: f.bytes, modificado: f.modificado, id: f.id, descarga: f.descarga, nombre: f.nombre,
});

/**
 * Lee de Microsoft 365 todo lo de un mes.
 * @param {(texto: string) => void} avisar  Para ir mostrando qué se está leyendo
 * @returns {{ ok: true, ... } | { ok: false, motivo: string }}
 */
export async function cargarMes(mes, anio, avisar = () => {}) {
  const c = carpetasDelMes(mes, anio);
  avisar('Buscando la carpeta de PROTINCAL LABORAL…');
  const base = await graph.carpetaBase();

  const carpetaSS = c.rnt.replace(/\/RNT$/, '');
  avisar(`Leyendo ${c.nominas}…`);
  const [raizNominas, raizSS] = await Promise.all([graph.listar(base, c.nominas), graph.listar(base, carpetaSS)]);
  // Sin nóminas pero con seguros sociales: se abre igual, para poder dividir los seguros sociales.
  if (!raizNominas && !raizSS) return { ok: false, motivo: `No existe la carpeta ${c.nominas}` };
  const raiz = raizNominas ?? [];

  const nominas = raiz.filter((f) => !f.esCarpeta).map((f) => aFichero(f));
  for (const carpeta of raiz.filter((f) => f.esCarpeta)) {
    if (palabras(carpeta.nombre).includes('importar')) continue; // ficheros para Quantum
    const dentro = (await graph.listar(base, `${c.nominas}/${carpeta.nombre}`)) ?? [];
    nominas.push(...dentro.filter((f) => !f.esCarpeta).map((f) => aFichero(f, carpeta.nombre)));
  }

  avisar('Leyendo seguros sociales…');
  const [rntBruto, rlcBruto] = await Promise.all([graph.listar(base, c.rnt), graph.listar(base, c.rlc)]);
  const rnt = (rntBruto ?? []).filter((f) => !f.esCarpeta).map((f) => aFichero(f));
  const rlc = (rlcBruto ?? []).filter((f) => !f.esCarpeta).map((f) => aFichero(f));
  // PDF conjuntos sin dividir: pueden estar en la carpeta del mes o dentro de RLC/RNT.
  const conjuntosSS = [
    ...(raizSS ?? []).filter((f) => !f.esCarpeta && pareceConjuntoSS(f.nombre)).map((f) => ({ carpeta: carpetaSS.split('/').pop(), ruta: f.nombre })),
    ...rlc.filter((f) => pareceConjuntoSS(f.nombre)).map((f) => ({ carpeta: 'RLC', ruta: f.nombre })),
    ...rnt.filter((f) => pareceConjuntoSS(f.nombre)).map((f) => ({ carpeta: 'RNT', ruta: f.nombre })),
  ];

  avisar('Leyendo el maestro…');
  // Se descarga el Excel y se lee aquí: no depende del servicio de Excel en línea.
  const partes = CONFIG.maestro.split('/');
  const nombreMaestro = partes.pop();
  const carpetaMaestro = (await graph.listar(base, partes.join('/'))) ?? [];
  const ficheroMaestro = carpetaMaestro.find((f) => f.nombre === nombreMaestro);
  if (!ficheroMaestro) return { ok: false, motivo: `No encuentro el maestro: ${CONFIG.maestro}` };
  const hojas = await leerXlsx(await graph.descargar(ficheroMaestro));
  const tabla = hojas.Maestro ?? [];
  const tablaTrab = hojas.Trabajadores ?? [];
  if (tabla.length < 2) return { ok: false, motivo: 'El Excel maestro no tiene la hoja Maestro o está vacía' };

  // Solo se abren los PDF conjuntos de nómina (los de la raíz): los individuales llevan una cada uno.
  const conjuntas = nominas.filter((f) => !f.ruta.includes('/') && /\.pdf$/i.test(f.nombre) &&
    !palabras(f.nombre).includes('costes'));
  let hechas = 0;
  const ilegibles = [];
  await enTandas(conjuntas, 4, async (f) => {
    const n = await contarNominas(f);
    f.nominas = n ?? 1;
    if (n === null) ilegibles.push(f.nombre);
    hechas += 1;
    avisar(`Contando nóminas dentro de cada PDF (${hechas} de ${conjuntas.length})…`);
  });

  avisar('Comprobando los correos ya enviados…');
  const enviadosOutlook = await graph.enviadosDesde(`${anio}-${dosCifras(mes)}-01T00:00:00Z`);

  return {
    ok: true, mes, anio, tabla, tablaTrab, nominas, rnt, rlc, enviadosOutlook, conjuntosSS,
    avisos: [
      ...(raizNominas ? [] : [`Todavía no existe la carpeta ${c.nominas}: de momento solo se pueden dividir los seguros sociales.`]),
      ...(rntBruto || conjuntosSS.length ? [] : [`No existe la carpeta ${c.rnt}`]),
      ...(rlcBruto || conjuntosSS.length ? [] : [`No existe la carpeta ${c.rlc}`]),
      ...(ilegibles.length ? [`No se han podido abrir ${ilegibles.length} PDF de nóminas para contar los trabajadores ` +
        `(se cuentan como una nómina, lo que afecta al texto del correo): ${ilegibles.join(', ')}`] : []),
    ],
  };
}

/**
 * Prepara la división de los RLC/RNT conjuntos del mes: descarga, lee cada página y planifica.
 * No escribe nada. Marca qué ficheros de salida ya existen en la carpeta.
 */
export async function prepararSS(mes, anio, avisar = () => {}) {
  const c = carpetasDelMes(mes, anio);
  const base = await graph.carpetaBase();
  const carpetaSS = c.rnt.replace(/\/RNT$/, '');
  const destino = { RLC: c.rlc, RNT: c.rnt };
  const conjuntos = [];
  const existentes = { RLC: new Set(), RNT: new Set() };
  // Conjuntos sueltos en la carpeta del mes (el tipo se sabe al leerlos).
  for (const f of ((await graph.listar(base, carpetaSS)) ?? []).filter((x) => !x.esCarpeta && pareceConjuntoSS(x.nombre))) {
    conjuntos.push({ ...f, carpeta: carpetaSS, tipoCarpeta: null, clave: `${carpetaSS.split('/').pop()}/${f.nombre}` });
  }
  for (const [tipo, carpeta] of Object.entries(destino)) {
    const lista = (await graph.listar(base, carpeta)) ?? [];
    for (const f of lista.filter((x) => !x.esCarpeta)) {
      if (pareceConjuntoSS(f.nombre)) conjuntos.push({ ...f, carpeta, tipoCarpeta: tipo, clave: `${tipo}/${f.nombre}` });
      else existentes[tipo].add(f.nombre.toLowerCase());
    }
  }
  if (!conjuntos.length) return { ok: false, motivo: 'No hay seguros sociales sin dividir en las carpetas RLC y RNT' };

  const pdfjsLib = await cargarPdfjs();
  const porFichero = {}; const bytes = {};
  for (const [i, f] of conjuntos.entries()) {
    avisar(`Leyendo ${f.clave} (${i + 1} de ${conjuntos.length})…`);
    bytes[f.clave] = await graph.descargar(f);
    porFichero[f.clave] = (await leerPaginas(bytes[f.clave].slice(), pdfjsLib)).map(analizarPaginaSS);
  }
  const plan = planSS(porFichero, periodoSeguros(mes, anio));
  for (const fx of plan.ficheros) {
    const origen = conjuntos.find((x) => x.clave === fx.origen);
    fx.carpeta = destino[fx.tipo];
    if (origen.tipoCarpeta && fx.tipo !== origen.tipoCarpeta) {
      plan.ok = false;
      plan.errores.push(`${fx.origen} contiene ${fx.tipo} pero está en la carpeta ${origen.tipoCarpeta}`);
    }
    fx.existe = existentes[fx.tipo].has(fx.nombre.toLowerCase());
  }
  const nuevos = plan.ficheros.filter((f) => !f.existe).length;
  const yaDivididos = plan.ok && plan.ficheros.length > 0 && nuevos === 0;
  if (plan.ok && nuevos && nuevos !== plan.ficheros.length) {
    plan.ok = false;
    plan.errores.push('Algunos ficheros ya existen en la carpeta y otros no. Revisa la carpeta antes de dividir: ' +
      plan.ficheros.filter((f) => f.existe).map((f) => `${f.tipo}/${f.nombre}`).join(' · '));
  }
  return { ok: true, mes, anio, base, carpetaSS, conjuntos, bytes, plan, yaDivididos };
}

/** Divide y guarda: sube un PDF por liquidación y mueve los conjuntos a la subcarpeta "Originales". */
export async function ejecutarSS(prep, avisar = () => {}) {
  const { base, plan, conjuntos, bytes, yaDivididos, carpetaSS } = prep;
  if (!plan.ok) throw new Error('El plan tiene errores: no se divide nada');
  const subidos = [];
  if (!yaDivididos) {
    // Las subcarpetas RLC y RNT pueden no existir todavía.
    for (const tipo of new Set(plan.ficheros.map((f) => f.tipo))) await graph.asegurarCarpeta(base, carpetaSS, tipo);
    const { PDFDocument } = await import('../vendor/pdf-lib.esm.min.js');
    const salidas = await cortarSS(plan, bytes, { PDFDocument });
    for (const [i, f] of salidas.entries()) {
      avisar(`Guardando ${f.tipo}/${f.nombre} (${i + 1} de ${salidas.length})…`);
      await graph.subir(base, f.carpeta, f.nombre, f.bytes);
      subidos.push(`${f.tipo}/${f.nombre}`);
    }
  }
  const movidos = [];
  for (const c of conjuntos) {
    avisar(`Apartando ${c.clave} en Originales…`);
    const idCarpeta = await graph.asegurarCarpeta(base, c.carpeta, 'Originales');
    await graph.mover(base, c.id, idCarpeta);
    movidos.push(c.clave);
  }
  return { subidos, movidos };
}
