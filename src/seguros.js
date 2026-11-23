// Seguros sociales: los RLC y RNT llegan en un PDF conjunto por tipo (RLC.pdf, RNT.pdf), con una
// liquidación por página o grupo de páginas. Aquí se lee cada página y se planifica cómo cortarlos
// en un PDF por liquidación, nombrado por la razón social: "RAZON SOCIAL.pdf", "RAZON SOCIAL (2).pdf"...
//
// La parte que decide es pura y se prueba sin PDF. Cortar usa pdf-lib, igual que las nóminas.
// Regla de seguridad: si una sola página no se lee con certeza, no se corta ese PDF.

import { palabras, dosCifras } from './motor.js?v=mwsvuvih';
import { lineas } from './dividir.js?v=mwsvuvih';

// Une los trozos de una línea. Algunos PDF de la Seguridad Social parten las palabras en las letras con
// tilde ("Raz" + "ó" + "n"): si un trozo empieza justo donde acaba el anterior, van pegados.
function juntar(items) {
  let s = '';
  let fin = null;
  for (const it of items) {
    const t = it.str;
    if (!t.trim()) { fin = null; s += ' '; continue; }
    const pegado = fin !== null && it.w !== undefined && Math.abs(it.x - fin) < 0.8;
    s += (s && !pegado ? ' ' : '') + t;
    fin = it.w ? it.x + it.w : null;
  }
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Lee de una página de RLC o RNT: tipo, razón social, cuenta de cotización, nº de liquidación,
 * periodo, calificador y paginación ("Página 1 de 2").
 */
export function analizarPaginaSS(items) {
  const textoLineas = lineas(items).map((l) => juntar(l.items));
  const todo = textoLineas.join('\n');
  const tipo = /RELACI[ÓO]N NOMINAL DE TRABAJADORES/i.test(todo) ? 'RNT'
    : /Recibo de Liquidaci[óo]n de Cotizaciones/i.test(todo) ? 'RLC' : null;
  if (!tipo) return { ok: false, error: 'La página no es un RLC ni un RNT' };

  const lRazon = textoLineas.find((l) => /Raz[óo]n [Ss]ocial/.test(l));
  const mRazon = lRazon && lRazon.match(
    /Raz[óo]n [Ss]ocial:?\s*(.+?)\s*(?:N[úu]mero de (?:la )?liquidaci[óo]n|C[óo]digo de [Ee]mpresario|$)/);
  const razon = mRazon ? mRazon[1].trim() : '';
  const liq = todo.match(/N[úu]mero de (?:la )?liquidaci[óo]n:?\s*(\d{10,})/i)?.[1] ?? '';
  const ccc = todo.match(/C[óo]digo (?:de )?[Cc]uenta (?:de )?[Cc]otizaci[óo]n:?\s*(\d{4}\s*\d{11})/)?.[1]?.replace(/\s+/g, ' ') ?? '';
  const per = todo.match(/Per[íi]odo de [Ll]iquidaci[óo]n:?\s*(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{4})/);
  const calificador = todo.match(/Calificador de (?:la )?[Ll]iquidaci[óo]n:?\s*(L\d{2})/i)?.[1]?.toUpperCase() ?? '';
  const pag = todo.match(/P[áa]gina\s+(\d+)\s+de\s+(\d+)/i);

  if (!razon) return { ok: false, tipo, error: 'No encuentro la razón social' };
  if (!liq) return { ok: false, tipo, error: `No encuentro el número de liquidación de ${razon}` };
  if (!per) return { ok: false, tipo, error: `No encuentro el periodo de liquidación de ${razon}` };
  if (!pag) return { ok: false, tipo, error: `No encuentro la paginación de ${razon}` };
  return {
    ok: true, tipo, razon, liquidacion: liq, ccc, calificador,
    mes: Number(per[1]), anio: Number(per[2]),
    pagina: Number(pag[1]), de: Number(pag[2]),
  };
}

/** Nombre de fichero válido en Windows a partir de la razón social. */
export function nombreSS(razon, orden = 1) {
  const limpio = razon.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${limpio}${orden > 1 ? ` (${orden})` : ''}.pdf`;
}

/**
 * Decide cómo cortar los PDF conjuntos de un mes. No corta nada.
 *
 * @param {Object<string, Array>} porFichero  Nombre del PDF conjunto → análisis de cada página (analizarPaginaSS)
 * @param {{mes:number, anio:number}} periodo  Periodo de los seguros sociales esperado
 * @returns {{ ok, errores: string[], avisos: string[], ficheros: Array<{origen, tipo, nombre, paginas, razon, liquidacion, calificador}> }}
 */
export function planSS(porFichero, periodo) {
  const errores = [];
  const avisos = [];
  const documentos = []; // un documento = una liquidación dentro de un PDF conjunto

  for (const [origen, paginas] of Object.entries(porFichero)) {
    const fallos = paginas.map((p, i) => (p.ok ? null : `${origen}, página ${i + 1}: ${p.error}`)).filter(Boolean);
    if (fallos.length) { errores.push(...fallos); continue; }
    const tipos = [...new Set(paginas.map((p) => p.tipo))];
    if (tipos.length > 1) { errores.push(`${origen} mezcla RLC y RNT`); continue; }
    let actual = null;
    let roto = false;
    paginas.forEach((p, i) => {
      if (p.mes !== periodo.mes || p.anio !== periodo.anio) {
        errores.push(`${origen}, página ${i + 1} (${p.razon}): es de ${dosCifras(p.mes)}/${p.anio}, ` +
          `no de ${dosCifras(periodo.mes)}/${periodo.anio}`);
        roto = true;
      }
      if (actual && actual.liquidacion === p.liquidacion) {
        actual.paginas.push(i);
        if (p.pagina !== actual.paginas.length) roto = true;
      } else {
        if (actual && actual.paginas.length !== actual.de) roto = true;
        if (p.pagina !== 1) roto = true;
        actual = { origen, tipo: p.tipo, razon: p.razon, liquidacion: p.liquidacion, ccc: p.ccc,
          calificador: p.calificador, de: p.de, paginas: [i] };
        documentos.push(actual);
      }
    });
    if (actual && actual.paginas.length !== actual.de) roto = true;
    if (roto && !errores.some((e) => e.startsWith(origen))) {
      errores.push(`${origen}: las páginas de alguna liquidación no están completas o no van seguidas`);
    }
  }
  if (errores.length) return { ok: false, errores, avisos, ficheros: [] };

  // Una liquidación no puede aparecer dos veces en el mismo tipo.
  const vistos = new Set();
  for (const d of documentos) {
    const k = `${d.tipo}:${d.liquidacion}`;
    if (vistos.has(k)) errores.push(`La liquidación ${d.liquidacion} (${d.razon}) aparece dos veces en los ${d.tipo}`);
    vistos.add(k);
  }
  if (errores.length) return { ok: false, errores, avisos, ficheros: [] };

  // Numeración por empresa, igual en RLC y RNT: la liquidación normal (L00) sin número,
  // las demás (vacaciones, atrasos…) con (2), (3)… por orden de número de liquidación.
  const porEmpresa = new Map();
  for (const d of documentos) {
    const k = palabras(d.razon).join(' ');
    if (!porEmpresa.has(k)) porEmpresa.set(k, new Map());
    const m = porEmpresa.get(k);
    if (!m.has(d.liquidacion)) m.set(d.liquidacion, d.calificador);
  }
  const orden = new Map();
  for (const m of porEmpresa.values()) {
    [...m.entries()]
      .sort(([la, ca], [lb, cb]) => (ca === 'L00') - (cb === 'L00') ? (cb === 'L00') - (ca === 'L00') : la.localeCompare(lb))
      .forEach(([liq], i) => orden.set(liq, i + 1));
  }

  // Cada liquidación debería tener su RLC y su RNT.
  const tiposPresentes = new Set(documentos.map((d) => d.tipo));
  if (tiposPresentes.size === 2) {
    const de = (t) => new Set(documentos.filter((d) => d.tipo === t).map((d) => d.liquidacion));
    const rlc = de('RLC'); const rnt = de('RNT');
    for (const d of documentos) {
      const otro = d.tipo === 'RLC' ? rnt : rlc;
      if (!otro.has(d.liquidacion)) {
        avisos.push(`${d.razon}: hay ${d.tipo} pero no ${d.tipo === 'RLC' ? 'RNT' : 'RLC'} de la liquidación ${d.liquidacion}`);
      }
    }
  }

  const ficheros = documentos.map((d) => ({
    origen: d.origen, tipo: d.tipo, nombre: nombreSS(d.razon, orden.get(d.liquidacion)),
    paginas: d.paginas, razon: d.razon, liquidacion: d.liquidacion, calificador: d.calificador,
  }));
  const nombres = new Set();
  for (const f of ficheros) {
    const k = `${f.tipo}:${f.nombre.toLowerCase()}`;
    if (nombres.has(k)) errores.push(`Dos liquidaciones darían el mismo fichero: ${f.tipo}/${f.nombre}`);
    nombres.add(k);
  }
  if (errores.length) return { ok: false, errores, avisos, ficheros: [] };
  return { ok: true, errores, avisos, ficheros };
}

/**
 * Corta los PDF conjuntos según el plan. Devuelve un fichero por liquidación.
 * @param {Object<string, Uint8Array>} bytesPorFichero
 */
export async function cortarSS(plan, bytesPorFichero, { PDFDocument }) {
  const origenes = new Map();
  const salidas = [];
  for (const f of plan.ficheros) {
    if (!origenes.has(f.origen)) origenes.set(f.origen, await PDFDocument.load(bytesPorFichero[f.origen]));
    const doc = origenes.get(f.origen);
    const nuevo = await PDFDocument.create();
    (await nuevo.copyPages(doc, f.paginas)).forEach((p) => nuevo.addPage(p));
    salidas.push({ ...f, bytes: await nuevo.save() });
  }
  for (const [origen, doc] of origenes) {
    const usadas = plan.ficheros.filter((f) => f.origen === origen).reduce((n, f) => n + f.paginas.length, 0);
    if (usadas !== doc.getPageCount()) throw new Error(`${origen}: el número de páginas de salida no coincide con el original`);
  }
  return salidas;
}
