// División de un PDF de nóminas (una página por trabajador) en nóminas individuales,
// renombradas con el nombre del trabajador y el mes: "NOMBRE APELLIDOS nom MM.pdf".
//
// La parte que decide (leer cada página y planificar la división) es pura y se prueba sin PDF.
// La parte que toca PDF usa pdf.js (leer texto) y pdf-lib (cortar), que funcionan en el navegador.
//
// Regla de seguridad: si una sola página no se puede leer con certeza, no se divide nada.

import { dosCifras, palabras } from './motor.js?v=mwujllld';

const RE_DNI = /^(\d{8}[A-Z]|[XYZ]\d{7}[A-Z])$/;
const RE_CIF = /^[A-HJNP-SUVW]\d{7}[0-9A-J]$/;

/** Agrupa los trozos de texto de una página en líneas (misma altura), de arriba abajo. */
export function lineas(items) {
  const filas = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    let fila = filas.find((f) => Math.abs(f.y - it.y) <= 2);
    if (!fila) { fila = { y: it.y, items: [] }; filas.push(fila); }
    fila.items.push(it);
  }
  filas.sort((a, b) => b.y - a.y); // en PDF la y crece hacia arriba
  for (const f of filas) f.items.sort((a, b) => a.x - b.x);
  return filas;
}

const texto = (its) => its.map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim();

/**
 * Lee de una página de nómina: empresa, CIF, trabajador, DNI y periodo.
 * @param {Array} items  Trozos de texto con posición: { str, x, y }
 * @returns {{ ok: boolean, error?: string, empresa?, cif?, trabajador?, dni?, mes?, anio? }}
 */
export function analizarPagina(items) {
  const ls = lineas(items);
  const idx = (re) => ls.findIndex((l) => re.test(texto(l.items)));

  const iTrab = idx(/^TRABAJADOR\b/i);
  if (iTrab < 0 || iTrab + 1 >= ls.length) return { ok: false, error: 'No encuentro el recuadro TRABAJADOR' };
  // El nombre es todo lo que queda a la izquierda del DNI en la línea de debajo del rótulo.
  const filaTrab = ls[iTrab + 1].items;
  const itDni = filaTrab.find((i) => RE_DNI.test(i.str.trim().toUpperCase()));
  if (!itDni) return { ok: false, error: `No encuentro el DNI en "${texto(filaTrab)}"` };
  const dni = itDni.str.trim().toUpperCase();
  const trabajador = texto(filaTrab.filter((i) => i.x < itDni.x));
  if (!trabajador) return { ok: false, error: 'Página sin nombre de trabajador' };

  const iEmp = idx(/^EMPRESA\b/i);
  let empresa = '', cif = '';
  if (iEmp >= 0 && iEmp + 1 < ls.length) {
    const filaEmp = ls[iEmp + 1].items;
    const esCif = (i) => { const t = i.str.trim().toUpperCase(); return RE_CIF.test(t) || RE_DNI.test(t); };
    const itCif = filaEmp.find(esCif);
    if (itCif) {
      cif = itCif.str.trim().toUpperCase();
      empresa = texto(filaEmp.filter((i) => i.x < itCif.x));
    }
  }
  if (!cif) return { ok: false, error: `No encuentro el CIF de la empresa en la nómina de "${trabajador}"` };

  const lPer = ls.map((l) => texto(l.items)).find((t) => /^PERIODO DEVENGADO/i.test(t));
  const m = lPer && lPer.match(/de\s+(\d{1,2})\s+al\s+\d{1,2}\s+de\s+(\d{1,2})\s+de\s+(\d{4})/i);
  if (!m) return { ok: false, error: `No encuentro el periodo en la nómina de "${trabajador}"` };

  return { ok: true, empresa, cif, trabajador, dni, mes: Number(m[2]), anio: Number(m[3]) };
}

/** "APELLIDOS, NOMBRE" → "NOMBRE APELLIDOS nom MM.pdf" (sin caracteres que Windows no admite). */
export function nombreFichero(trabajador, mes) {
  const limpio = trabajador.replace(/[\\/:*?"<>|]/g, ' ');
  const coma = limpio.indexOf(',');
  const orden = coma >= 0 ? `${limpio.slice(coma + 1)} ${limpio.slice(0, coma)}` : limpio;
  const nombre = orden.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  return `${nombre} nom ${dosCifras(mes)}.pdf`;
}

/**
 * Decide cómo cortar el PDF. No corta nada: solo devuelve el plan o los errores.
 * Páginas consecutivas del mismo DNI van al mismo fichero (nóminas de dos hojas).
 *
 * @param {Array} paginas  Resultado de analizarPagina() de cada página, en orden
 * @returns {{ ok, errores: string[], empresa, cif, ficheros: [{ nombre, trabajador, dni, paginas: number[] }] }}
 */
export function planDivision(paginas, mes, anio) {
  const errores = [];
  if (paginas.length === 0) errores.push('El PDF no tiene páginas');
  paginas.forEach((p, i) => {
    if (!p.ok) errores.push(`Página ${i + 1}: ${p.error}`);
    else if (p.mes !== mes || p.anio !== anio) {
      errores.push(`Página ${i + 1} (${p.trabajador}): es de ${dosCifras(p.mes)}/${p.anio}, no de ${dosCifras(mes)}/${anio}`);
    }
  });
  const buenas = paginas.filter((p) => p.ok);
  const cifs = [...new Set(buenas.map((p) => p.cif))];
  if (cifs.length > 1) errores.push(`El PDF mezcla nóminas de varias empresas: ${cifs.join(', ')}`);
  if (errores.length) return { ok: false, errores, ficheros: [] };

  const ficheros = [];
  paginas.forEach((p, i) => {
    const ultimo = ficheros[ficheros.length - 1];
    if (ultimo && ultimo.dni === p.dni) ultimo.paginas.push(i);
    else ficheros.push({ nombre: nombreFichero(p.trabajador, mes), trabajador: p.trabajador, dni: p.dni, paginas: [i] });
  });

  const porDni = new Map();
  const porNombre = new Map();
  for (const f of ficheros) {
    if (porDni.has(f.dni)) errores.push(`El trabajador ${f.trabajador} (${f.dni}) aparece en páginas no consecutivas`);
    porDni.set(f.dni, f);
    const k = palabras(f.nombre).join(' ');
    if (porNombre.has(k)) errores.push(`Dos trabajadores distintos darían el mismo fichero: ${f.nombre}`);
    porNombre.set(k, f);
  }
  if (errores.length) return { ok: false, errores, ficheros: [] };
  return { ok: true, errores, empresa: paginas[0].empresa, cif: paginas[0].cif, ficheros };
}

/** Texto con posiciones de cada página, usando pdf.js. */
export async function leerPaginas(bytes, pdfjs) {
  const tarea = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const doc = await tarea.promise;
  const paginas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const contenido = await pagina.getTextContent();
    paginas.push(contenido.items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0 })));
  }
  await tarea.destroy();
  return paginas;
}

/**
 * Divide el PDF. Devuelve el plan y, si es correcto, los PDF individuales.
 * Comprueba además que la suma de páginas de salida es igual a la de entrada.
 *
 * @param {Uint8Array} bytes   PDF conjunto
 * @param {object} libs        { pdfjs, PDFDocument } — pdf.js y la clase PDFDocument de pdf-lib
 */
export async function dividirPdf(bytes, mes, anio, { pdfjs, PDFDocument }) {
  const items = await leerPaginas(bytes.slice(), pdfjs);
  const plan = planDivision(items.map(analizarPagina), mes, anio);
  if (!plan.ok) return { ...plan, salidas: [] };

  const origen = await PDFDocument.load(bytes);
  const salidas = [];
  let total = 0;
  for (const f of plan.ficheros) {
    const nuevo = await PDFDocument.create();
    const copiadas = await nuevo.copyPages(origen, f.paginas);
    copiadas.forEach((p) => nuevo.addPage(p));
    total += copiadas.length;
    salidas.push({ nombre: f.nombre, trabajador: f.trabajador, dni: f.dni, bytes: await nuevo.save() });
  }
  if (total !== origen.getPageCount()) {
    return { ok: false, errores: ['El número de páginas de salida no coincide con el original'], ficheros: [], salidas: [] };
  }
  return { ...plan, salidas };
}
