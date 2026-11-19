// Lector mínimo de ficheros .xlsx en el navegador, sin librerías externas.
// Un .xlsx es un ZIP con XML dentro: se descomprime con DecompressionStream y se lee con DOMParser.
// Solo devuelve valores (texto, números, booleanos); ignora formatos, fórmulas y estilos.

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

/** Índice del ZIP: nombre → { metodo, tamano, desplazamiento }. */
function indiceZip(b) {
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (u32(b, i) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('El fichero no es un Excel válido (.xlsx)');
  const total = u16(b, fin + 10);
  let p = u32(b, fin + 16);
  const dec = new TextDecoder();
  const ficheros = new Map();
  for (let n = 0; n < total; n++) {
    if (u32(b, p) !== 0x02014b50) throw new Error('Excel dañado: índice ZIP incorrecto');
    const metodo = u16(b, p + 10);
    const tamano = u32(b, p + 20);
    const largoNombre = u16(b, p + 28);
    const largoExtra = u16(b, p + 30);
    const largoComentario = u16(b, p + 32);
    const desplazamiento = u32(b, p + 42);
    const nombre = dec.decode(b.subarray(p + 46, p + 46 + largoNombre));
    ficheros.set(nombre, { metodo, tamano, desplazamiento });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return ficheros;
}

async function extraer(b, ficheros, nombre) {
  const f = ficheros.get(nombre);
  if (!f) return null;
  const o = f.desplazamiento;
  if (u32(b, o) !== 0x04034b50) throw new Error(`Excel dañado: ${nombre}`);
  const inicio = o + 30 + u16(b, o + 26) + u16(b, o + 28);
  const datos = b.subarray(inicio, inicio + f.tamano);
  if (f.metodo === 0) return new TextDecoder().decode(datos);
  if (f.metodo !== 8) throw new Error(`Compresión no admitida en ${nombre}`);
  const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(flujo).text();
}

const xml = (texto) => new DOMParser().parseFromString(texto, 'application/xml');

function columna(ref) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function textoDe(nodo) {
  // Texto de una celda o cadena compartida: todos sus <t>, sin la guía fonética (<rPh>).
  return [...nodo.getElementsByTagName('t')]
    .filter((t) => t.parentNode?.nodeName !== 'rPh')
    .map((t) => t.textContent).join('');
}

/**
 * Lee todas las hojas de un .xlsx.
 * @param {Uint8Array} bytes
 * @returns {Promise<Record<string, Array<Array<string|number|boolean|null>>>>} nombre de hoja → filas
 */
export async function leerXlsx(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const ficheros = indiceZip(b);

  const libro = await extraer(b, ficheros, 'xl/workbook.xml');
  if (!libro) throw new Error('El fichero no es un Excel válido (falta el libro)');
  const rels = xml(await extraer(b, ficheros, 'xl/_rels/workbook.xml.rels') ?? '<Relationships/>');
  const destino = new Map([...rels.getElementsByTagName('Relationship')]
    .map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));

  const compartidas = [];
  const sst = await extraer(b, ficheros, 'xl/sharedStrings.xml');
  if (sst) for (const si of xml(sst).getElementsByTagName('si')) compartidas.push(textoDe(si));

  const hojas = {};
  for (const h of xml(libro).getElementsByTagName('sheet')) {
    const nombre = h.getAttribute('name');
    let ruta = destino.get(h.getAttribute('r:id')) ?? '';
    ruta = ruta.startsWith('/') ? ruta.slice(1) : `xl/${ruta}`;
    const contenido = await extraer(b, ficheros, ruta);
    if (!contenido) continue;
    const filas = [];
    for (const fila of xml(contenido).getElementsByTagName('row')) {
      const i = Number(fila.getAttribute('r')) - 1;
      const valores = [];
      for (const c of fila.getElementsByTagName('c')) {
        const tipo = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0]?.textContent;
        let valor = null;
        if (tipo === 's') valor = v != null ? compartidas[Number(v)] ?? null : null;
        else if (tipo === 'inlineStr') valor = textoDe(c);
        else if (tipo === 'str' || tipo === 'e') valor = v ?? null;
        else if (tipo === 'b') valor = v === '1';
        else if (v != null && v !== '') valor = Number(v);
        valores[columna(c.getAttribute('r'))] = valor === '' ? null : valor;
      }
      filas[i] = Array.from(valores, (x) => (x === undefined ? null : x));
    }
    const ancho = Math.max(0, ...filas.filter(Boolean).map((f) => f.length));
    hojas[nombre] = Array.from(filas, (f) => {
      const r = f ?? [];
      return [...r, ...Array(ancho - r.length).fill(null)];
    });
  }
  return hojas;
}
