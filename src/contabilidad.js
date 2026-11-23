// Tablero de contabilización de nóminas en Quantum: una línea por empresa y mes.
//
// Fuentes (todas en OneDrive, carpeta Nóminas/MMAAAA):
//   - Los Excel de costes del programa de nóminas (.xls/.xlt/.xlsx de la raíz del mes).
//   - IMPORTAR QUANTUM/CONTROL importacion MMAAAA.xlsx  → lo genera el script de Claude (fase 1, sin RLC).
//   - IMPORTAR QUANTUM/CUADRE RLC/CONTROL importacion MMAAAA.xlsx → mismo script con el RLC (fase 2, mes siguiente).
//   - IMPORTAR QUANTUM/estado contabilidad MMAAAA.json → lo que se marca a mano: importado y mayores revisados.
//
// Este módulo es puro: no lee nada, solo combina. Se prueba sin OneDrive.

import { dosCifras, palabras } from './motor.js?v=mwsvuvih';

export const RUTAS = (mes, anio) => {
  const carpeta = `Nóminas/${dosCifras(mes)}${anio}`;
  const control = `CONTROL importacion ${dosCifras(mes)}${anio}.xlsx`;
  return {
    carpeta,
    importar: `${carpeta}/IMPORTAR QUANTUM`,
    control,
    cuadre: `${carpeta}/IMPORTAR QUANTUM/CUADRE RLC`,
    estado: `estado contabilidad ${dosCifras(mes)}${anio}.json`,
  };
};

/** ¿Es un Excel de costes? Todos los Excel de la raíz del mes lo son (el script identifica la empresa por dentro). */
export function esExcelCostes(nombre) {
  return /\.(xls|xlt|xlsx)$/i.test(nombre) && !palabras(nombre).includes('importar') && !/^~\$/.test(nombre);
}

export const TOLERANCIA_RLC = 0.05;

/** Filas de la hoja Resumen del CONTROL → objetos. Tolera columnas de más o de menos. */
export function leerControl(hojas) {
  if (!hojas) return null;
  const res = hojas.Resumen ?? [];
  const inc = hojas.Incidencias ?? [];
  const cab = (res[0] ?? []).map((c) => palabras(c).join(' '));
  const col = (...nombres) => cab.findIndex((c) => nombres.some((n) => c.startsWith(n)));
  const i = {
    origen: col('fichero origen'), nif: col('nif'), razon: col('razon social'), estado: col('estado'),
    salida: col('fichero importacion'), trab: col('trabajadores'), bruto: col('total bruto'), liquido: col('total liquido'),
    liqSS: col('total liquidacion ss'), rlc: col('total rlc'), dif: col('dif rlc'),
  };
  const v = (f, k) => (i[k] >= 0 ? f[i[k]] ?? null : null);
  const num = (x) => (x === null || x === '' ? null : Number(x));
  const filas = res.slice(1).filter((f) => f.some((x) => x !== null && x !== '')).map((f) => ({
    origen: String(v(f, 'origen') ?? ''),
    nif: String(v(f, 'nif') ?? '').trim().toUpperCase(),
    razon: String(v(f, 'razon') ?? ''),
    estado: String(v(f, 'estado') ?? '').trim().toUpperCase(),
    salida: String(v(f, 'salida') ?? ''),
    trabajadores: num(v(f, 'trab')),
    bruto: num(v(f, 'bruto')), liquido: num(v(f, 'liquido')), liqSS: num(v(f, 'liqSS')),
    rlc: num(v(f, 'rlc')), dif: num(v(f, 'dif')),
  }));
  const incidencias = inc.slice(1).filter((f) => f.some((x) => x !== null && x !== '')).map((f) => ({
    fichero: String(f[0] ?? ''), nivel: String(f[1] ?? '').trim().toUpperCase(),
    codigo: f[2] ?? '', trabajador: String(f[3] ?? ''), detalle: String(f[4] ?? ''),
  }));
  return { filas, incidencias };
}

/** Estado guardado vacío. */
export const estadoVacio = (mes, anio) => ({ version: 1, mes, anio, empresas: {} });

const esFueraDeQuantum = (incs) => incs.some((x) => x.nivel === 'ERROR' && /sin trabajadores en la tabla/i.test(x.detalle));

export const PASO = {
  GENERAR: 'generar', ERROR: 'error', IMPORTAR: 'importar', CUADRAR: 'cuadrar',
  DESCUADRE: 'descuadre', REVISAR: 'revisar', CERRADA: 'cerrada', FUERA: 'fuera',
};

/**
 * Combina las fuentes en el tablero.
 * @param {object} e
 * @param {Array<{nombre, modificado}>} e.costes     Excel de costes de la raíz del mes
 * @param {{filas, incidencias, modificado}|null} e.control  CONTROL de la fase 1
 * @param {{filas, incidencias, modificado}|null} e.cuadre   CONTROL de la fase 2 (con RLC)
 * @param {object} e.guardado                        estado contabilidad MMAAAA.json
 */
export function tablero({ costes = [], control = null, cuadre = null, guardado = null }) {
  const marcas = guardado?.empresas ?? {};
  const porClave = new Map();
  const empresa = (clave) => {
    if (!porClave.has(clave)) {
      porClave.set(clave, { clave, nif: '', nombre: '', ficheros: [], salidas: [], estados: [], incidencias: [],
        trabajadores: 0, bruto: 0, liquido: 0, liqSS: 0 });
    }
    return porClave.get(clave);
  };

  // 1. Lo generado por el script.
  const enControl = new Set();
  for (const f of control?.filas ?? []) {
    enControl.add(f.origen.toLowerCase());
    const e = empresa(f.nif ? `nif:${f.nif}` : `fichero:${f.origen.toLowerCase()}`);
    e.nif = e.nif || f.nif;
    e.nombre = e.nombre || f.razon || f.origen;
    e.ficheros.push(f.origen);
    if (f.salida && f.estado !== 'NO GENERADO') e.salidas.push(f.salida);
    e.estados.push(f.estado);
    e.trabajadores += f.trabajadores ?? 0; e.bruto += f.bruto ?? 0; e.liquido += f.liquido ?? 0; e.liqSS += f.liqSS ?? 0;
    if (f.estado === 'NO GENERADO' && f.salida) e.incidencias.push({ nivel: 'ERROR', trabajador: '', detalle: f.salida });
    e.incidencias.push(...(control.incidencias ?? []).filter((x) => x.fichero.toLowerCase() === f.origen.toLowerCase()));
  }

  // 2. Excel de costes que el script todavía no ha procesado, o que han cambiado después.
  const porGenerar = [];
  for (const x of costes) {
    const nuevo = !enControl.has(x.nombre.toLowerCase());
    const cambiado = !nuevo && control?.modificado && x.modificado > control.modificado;
    if (nuevo || cambiado) porGenerar.push({ ...x, motivo: nuevo ? 'Excel sin procesar' : 'El Excel ha cambiado después de generar' });
  }
  for (const x of porGenerar) {
    const ya = [...porClave.values()].find((e) => e.ficheros.some((f) => f.toLowerCase() === x.nombre.toLowerCase()));
    const e = ya ?? empresa(`fichero:${x.nombre.toLowerCase()}`);
    if (!ya) { e.nombre = x.nombre.replace(/\s*costes.*$/i, '').replace(/\.(xls|xlt|xlsx)$/i, ''); e.ficheros.push(x.nombre); }
    e.porGenerar = x.motivo;
  }

  // 3. Cuadre con el RLC (fase 2), por NIF.
  const cuadrePorNif = new Map();
  for (const f of cuadre?.filas ?? []) if (f.nif) cuadrePorNif.set(f.nif, f);
  const rlcSinExcel = (cuadre?.incidencias ?? [])
    .filter((x) => /sin excel de costes/i.test(x.fichero) || /pero no Excel de costes/i.test(x.detalle))
    .map((x) => ({ razon: x.trabajador, detalle: x.detalle }));

  // 4. Estado y siguiente paso de cada empresa.
  const filas = [...porClave.values()].map((e) => {
    const m = (e.nif && marcas[e.nif]) || marcas[e.clave] || {};
    const fuera = esFueraDeQuantum(e.incidencias);
    const errores = e.incidencias.filter((x) => x.nivel === 'ERROR');
    const revisar = e.incidencias.filter((x) => x.nivel === 'REVISAR');
    const generado = e.porGenerar ? null
      : e.estados.includes('ERROR') || e.estados.includes('NO GENERADO') ? 'ERROR'
        : e.estados.includes('REVISAR') ? 'REVISAR' : e.estados.length ? 'OK' : null;

    let cuadreRLC = { estado: 'pendiente' };
    const c = e.nif ? cuadrePorNif.get(e.nif) : null;
    if (m.cuadreCorregido) {
      // El descuadre del Excel ya se ha corregido en Quantum para que coincida con el RLC.
      cuadreRLC = { estado: 'corregido', rlc: c?.rlc, dif: c?.dif, nota: m.cuadreCorregido.nota ?? '' };
    } else if (c) {
      if (c.rlc === null || c.rlc === undefined) cuadreRLC = (c.liqSS ?? 0) ? { estado: 'sin-rlc' } : { estado: 'no-aplica' };
      else cuadreRLC = Math.abs(c.dif ?? 0) <= TOLERANCIA_RLC
        ? { estado: 'ok', rlc: c.rlc, dif: c.dif } : { estado: 'descuadre', rlc: c.rlc, dif: c.dif };
    } else if (cuadre && !fuera && generado) {
      cuadreRLC = { estado: 'sin-fila' }; // hay cuadre del mes pero esta empresa no salió en él
    }

    let paso;
    if (m.descartada) paso = PASO.CERRADA;
    else if (fuera) paso = PASO.FUERA;
    else if (e.porGenerar) paso = PASO.GENERAR;
    else if (generado === 'ERROR' && !m.importado) paso = PASO.ERROR;
    else if (!m.importado) paso = PASO.IMPORTAR;
    else if (cuadreRLC.estado === 'descuadre' || cuadreRLC.estado === 'sin-rlc') paso = PASO.DESCUADRE;
    else if (!['ok', 'no-aplica', 'corregido'].includes(cuadreRLC.estado)) paso = PASO.CUADRAR;
    else if (!m.revisado) paso = PASO.REVISAR;
    else paso = PASO.CERRADA;

    return {
      clave: e.nif || e.clave, nif: e.nif, nombre: e.nombre, ficheros: e.ficheros, salidas: e.salidas,
      generado, porGenerar: e.porGenerar ?? null, fuera, paso,
      errores, revisar, info: e.incidencias.filter((x) => x.nivel === 'INFO'),
      trabajadores: e.trabajadores, bruto: redondea(e.bruto), liquido: redondea(e.liquido), liqSS: redondea(e.liqSS),
      importado: m.importado ?? null, revisado: m.revisado ?? null, nota: m.nota ?? '',
      descartada: m.descartada ?? null,
      cuadre: cuadreRLC,
    };
  });

  const orden = [PASO.ERROR, PASO.DESCUADRE, PASO.GENERAR, PASO.IMPORTAR, PASO.CUADRAR, PASO.REVISAR, PASO.CERRADA, PASO.FUERA];
  filas.sort((a, b) => orden.indexOf(a.paso) - orden.indexOf(b.paso) || a.nombre.localeCompare(b.nombre, 'es'));
  const cuenta = (p) => filas.filter((f) => f.paso === p).length;
  return {
    filas, rlcSinExcel,
    hayControl: Boolean(control), hayCuadre: Boolean(cuadre),
    cuentas: {
      atencion: cuenta(PASO.ERROR) + cuenta(PASO.DESCUADRE) + cuenta(PASO.GENERAR) + rlcSinExcel.length,
      importar: cuenta(PASO.IMPORTAR), cuadrar: cuenta(PASO.CUADRAR), revisar: cuenta(PASO.REVISAR),
      cerradas: cuenta(PASO.CERRADA), fuera: cuenta(PASO.FUERA),
    },
  };
}

const redondea = (n) => Math.round(n * 100) / 100;

/**
 * Aplica una marca al estado guardado y devuelve uno nuevo (no modifica el original).
 * @param {'importado'|'revisado'} que
 * @param {boolean} valor   true = marcar, false = desmarcar
 */
export function marcar(guardado, clave, que, valor, { quien, cuando = new Date().toISOString() }) {
  if (!['importado', 'revisado'].includes(que)) throw new Error(`Marca desconocida: ${que}`);
  const nuevo = structuredClone(guardado);
  const e = { ...(nuevo.empresas[clave] ?? {}) };
  if (valor) e[que] = { cuando, quien };
  else delete e[que];
  // Si se deshace la importación, la revisión deja de tener sentido.
  if (que === 'importado' && !valor) delete e.revisado;
  nuevo.empresas[clave] = e;
  return nuevo;
}

/** Texto del siguiente paso para la pantalla. */
export function textoPaso(f) {
  switch (f.paso) {
    case PASO.FUERA: return 'No se lleva en Quantum';
    case PASO.GENERAR: return `Generar el fichero de importación (${f.porGenerar.toLowerCase()})`;
    case PASO.ERROR: return f.errores[0]?.detalle ? `Resolver: ${f.errores[0].detalle}` : 'Resolver el error antes de importar';
    case PASO.IMPORTAR: return f.generado === 'REVISAR' ? 'Importar en Quantum (con avisos: revísalos)' : 'Importar en Quantum';
    case PASO.CUADRAR: return f.cuadre.estado === 'sin-fila' ? 'No sale en el cuadre con el RLC: hay que volver a pasarlo' : 'Cuadrar con el RLC cuando llegue';
    case PASO.DESCUADRE: return f.cuadre.estado === 'sin-rlc' ? 'Tiene coste de SS pero no aparece en el RLC'
      : `Descuadre con el RLC: ${formatoEuros(f.cuadre.dif)}`;
    case PASO.REVISAR: return 'Revisar los mayores';
    default: return f.descartada ? `Cerrada sin importar${f.descartada.motivo ? `: ${f.descartada.motivo}` : ''}` : 'Cerrada';
  }
}

export const formatoEuros = (n) => (n === null || n === undefined ? '—'
  : `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
