// Reúne todo lo que necesita el motor para un mes, leyéndolo de OneDrive y del correo.
import { CONFIG } from './config.js';
import { carpetasDelMes, dosCifras, palabras } from './motor.js';
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

  avisar(`Leyendo ${c.nominas}…`);
  const raiz = await graph.listar(base, c.nominas);
  if (!raiz) return { ok: false, motivo: `No existe la carpeta ${c.nominas}` };

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
    ok: true, mes, anio, tabla, tablaTrab, nominas, rnt, rlc, enviadosOutlook,
    avisos: [
      ...(rntBruto ? [] : [`No existe la carpeta ${c.rnt}`]),
      ...(rlcBruto ? [] : [`No existe la carpeta ${c.rlc}`]),
      ...(ilegibles.length ? [`No se han podido abrir ${ilegibles.length} PDF de nóminas para contar los trabajadores ` +
        `(se cuentan como una nómina, lo que afecta al texto del correo): ${ilegibles.join(', ')}`] : []),
    ],
  };
}
