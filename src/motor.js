// Motor de emparejamiento y pre-chequeo del envío mensual de nóminas + RNT + RLC.
//
// Función pura: recibe el maestro y los listados de ficheros, devuelve qué se envía a quién.
// No lee disco, no llama a Microsoft, no envía nada. Así se puede probar entera sin riesgo.
//
// Regla de oro (RGPD): el emparejamiento sale SOLO del maestro. Si un fichero no casa con
// exactamente una fila, no se adjunta a nadie: se marca como incidencia o como huérfano.

export const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO',
  'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

export const ESTADO = {
  LISTO: 'LISTO',
  PENDIENTE: 'PENDIENTE',
  YA_ENVIADO: 'YA_ENVIADO',
  INCIDENCIA: 'INCIDENCIA',
  NO_SE_ENVIA: 'NO_SE_ENVIA',
};

const RECIBE_VALIDOS = ['AMBAS', 'NOMINA', 'SS', 'NADA'];

/** Minúsculas, sin acentos, puntuación convertida en espacios. Devuelve las palabras. */
export function palabras(texto) {
  return String(texto ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function sinExtension(nombre) {
  return nombre.replace(/\.[^.\\/]+$/, '');
}

function esPdf(nombre) {
  return /\.pdf$/i.test(nombre);
}

/** ¿Aparece `aguja` como secuencia contigua de palabras dentro de `pajar`? */
function contieneSecuencia(pajar, aguja) {
  if (aguja.length === 0 || aguja.length > pajar.length) return false;
  for (let i = 0; i + aguja.length <= pajar.length; i++) {
    let igual = true;
    for (let j = 0; j < aguja.length; j++) {
      if (pajar[i + j] !== aguja[j]) { igual = false; break; }
    }
    if (igual) return true;
  }
  return false;
}

/**
 * Texto del correo según lo que lleva adjunto.
 * @param {number}  nNominas     Nóminas que van en el envío (contando las de dentro de un PDF conjunto)
 * @param {boolean} tieneSS      Lleva RNT/RLC
 * @param {boolean} aTrabajador  Va directamente al trabajador, no a la empresa
 */
export function textoCorreo({ nNominas, tieneSS, aTrabajador = false }) {
  // "Buenos días," en una línea y el resto en la siguiente, sin línea en blanco entre medias.
  if (aTrabajador) return 'Buenos días,\nSe adjunta la nómina del mes en curso.';
  const nominas = nNominas > 1 ? 'las nóminas' : nNominas === 1 ? 'la nómina' : '';
  const que = nominas && tieneSS ? `${nominas} y seguros sociales`
    : nominas || 'los seguros sociales';
  return `Buenos días,\nAdjunto ${que} del mes en curso.`;
}

/** Periodo de seguros sociales = mes de la nómina − 1 (enero → diciembre del año anterior). */
export function periodoSeguros(mes, anio) {
  return mes === 1 ? { mes: 12, anio: anio - 1 } : { mes: mes - 1, anio };
}

export function dosCifras(n) {
  return String(n).padStart(2, '0');
}

/** Rutas relativas a "PROTINCAL LABORAL" de las tres carpetas del mes. */
export function carpetasDelMes(mes, anio) {
  const ss = periodoSeguros(mes, anio);
  const baseSS = `Seguros Sociales/${ss.anio}/${dosCifras(ss.mes)}.${ss.anio}`;
  return {
    nominas: `Nóminas/${dosCifras(mes)}${anio}`,
    rnt: `${baseSS}/RNT`,
    rlc: `${baseSS}/RLC`,
  };
}

/**
 * Convierte las filas del Excel maestro (primera fila = cabecera) en filas limpias.
 * Devuelve { filas, errores }. Un error de maestro bloquea esa fila, no el resto.
 */
export function leerMaestro(tabla, tablaTrabajadores = []) {
  const filas = [];
  const errores = [];
  // Hoja "Trabajadores": EMPRESA (alias) | NOMBRE EN LA NÓMINA | EMAIL
  const trabajadores = tablaTrabajadores.slice(1)
    .filter((t) => t && (t[0] || t[1] || t[2]))
    .map((t, i) => ({
      fila: i + 2,
      empresa: palabras(t[0]).join(' '),
      nombre: String(t[1] ?? '').trim(),
      email: String(t[2] ?? '').trim(),
    }));
  tabla.slice(1).forEach((f, i) => {
    const numFila = i + 2; // como se ve en Excel
    const [alias, razon, email, recibe, notas, indiv] = f;
    if (!alias && !razon && !email && !recibe) return; // fila vacía
    const aliases = String(alias ?? '').split(';').map((a) => a.trim()).filter(Boolean);
    const razones = String(razon ?? '').split(';').map((r) => r.trim()).filter(Boolean);
    const rec = String(recibe ?? '').trim().toUpperCase();
    const correo = String(email ?? '').trim();
    const fila = {
      fila: numFila,
      id: aliases[0] ?? `fila ${numFila}`,
      aliases,
      razones,
      email: correo,
      recibe: rec,
      notas: notas ? String(notas) : '',
      // Columna F del maestro:
      //   vacío       → CONJUNTO: un PDF con todas las nóminas, al correo de la empresa
      //   SI          → INDIVIDUAL: una nómina por trabajador, todas al correo de la empresa
      //   TRABAJADOR  → TRABAJADOR: una nómina por trabajador, cada una al correo de ese trabajador
      envio: /^trabajador(es|a|as)?$/i.test(String(indiv ?? '').trim()) ? 'TRABAJADOR'
        : /^(si|sí|s|x)$/i.test(String(indiv ?? '').trim()) ? 'INDIVIDUAL' : 'CONJUNTO',
      trabajadores: trabajadores.filter((t) => aliases.some((al) => palabras(al).join(' ') === t.empresa)),
    };
    fila.individuales = fila.envio !== 'CONJUNTO';
    if (aliases.length === 0) errores.push({ fila: numFila, detalle: 'Fila sin alias de nómina' });
    if (fila.envio === 'TRABAJADOR' && (rec === 'AMBAS' || rec === 'SS')) {
      errores.push({ fila: numFila, detalle: 'Envío a cada trabajador: RECIBE tiene que ser NOMINA (los seguros sociales no van a los trabajadores)' });
      fila.recibe = 'INVALIDO';
    } else if (!RECIBE_VALIDOS.includes(rec)) {
      errores.push({ fila: numFila, detalle: `RECIBE no válido: "${recibe ?? ''}"` });
      fila.recibe = 'INVALIDO';
    }
    filas.push(fila);
  });
  for (const t of trabajadores) {
    if (!filas.some((f) => f.trabajadores.includes(t))) {
      errores.push({ fila: t.fila, detalle: `Hoja Trabajadores: la empresa de "${t.nombre}" no es un alias del maestro` });
    }
  }
  return { filas, errores };
}

/** "ANA GARCIA LOPEZ nom 10.pdf" → "ana garcia lopez": la clave con la que se busca al trabajador. */
export function claveTrabajador(nombreFichero) {
  const w = palabras(sinExtension(nombreFichero));
  const corte = w.findIndex((x) => x === 'nom' || x === 'nomina');
  return (corte > 0 ? w.slice(0, corte) : w).join(' ');
}

/** Subcarpeta (dentro de la carpeta del mes) donde van las nóminas individuales de un cliente. */
export function carpetaIndividuales(fila) {
  return fila.id.toUpperCase();
}

function emailValido(email) {
  return /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(email);
}

/**
 * Pre-chequeo de un mes.
 *
 * @param {object} e
 * @param {number} e.mes            Mes de la nómina (1-12)
 * @param {number} e.anio
 * @param {Array}  e.maestro        Filas ya limpias (leerMaestro().filas)
 * @param {Array}  e.nominas        Ficheros de la carpeta de nóminas: { ruta, bytes }.
 *                                  `ruta` relativa a la carpeta del mes ("x nom 10.pdf" o "SUBCARPETA/x.pdf").
 * @param {Array}  e.rnt            Ficheros de la carpeta RNT: { ruta, bytes }
 * @param {Array}  e.rlc            Ficheros de la carpeta RLC: { ruta, bytes }
 * @param {Array}  [e.yaEnviados]   Ids de fila (alias principal) ya enviados este mes, según el registro.
 * @param {Array}  [e.enviadosOutlook] Correos del mes en Enviados: { para, asunto }
 */
export function prechequeo(e) {
  const { mes, anio, maestro } = e;
  const mm = dosCifras(mes);
  const asuntoBase = `NOMINAS ${MESES[mes - 1]} ${anio}`;
  const yaEnviados = new Set((e.yaEnviados ?? []).map((x) => palabras(x).join(' ')));
  // El asunto se compara sin acentos ni mayúsculas: "Nóminas octubre 2026" escrito a mano también cuenta.
  const enviadosOutlook = (e.enviadosOutlook ?? []).map((c) => ({
    para: String(c.para).trim().toLowerCase(),
    asunto: palabras(c.asunto).join(' '),
  }));

  // ---- 1. Clasificar los ficheros de la carpeta de nóminas -------------------------
  const sueltas = [];        // PDF de nómina en la raíz de la carpeta del mes
  const subcarpetas = new Map(); // nombre de subcarpeta -> PDFs dentro
  const ignorados = [];      // costes, importaciones, no-PDF: nunca se envían
  for (const f of e.nominas ?? []) {
    const partes = f.ruta.split(/[\\/]/);
    const nombre = partes[partes.length - 1];
    const w = palabras(sinExtension(nombre));
    if (!esPdf(nombre) || w.includes('costes') || w.includes('importar')) {
      ignorados.push(f.ruta);
      continue;
    }
    if (partes.length === 1) {
      sueltas.push({ ...f, nombre, w });
    } else if (partes.length === 2) {
      if (!subcarpetas.has(partes[0])) subcarpetas.set(partes[0], []);
      subcarpetas.get(partes[0]).push({ ...f, nombre, w });
    } else {
      ignorados.push(f.ruta);
    }
  }

  const filasDeAlias = (w) => maestro.filter((r) =>
    r.aliases.some((a) => contieneSecuencia(w, palabras(a))));

  // Nóminas sueltas: tienen que terminar en " MM" y casar con UNA sola fila.
  const nominaDeFila = new Map(); // fila.id -> [ficheros]
  const huerfanos = [];
  const ambiguos = [];
  for (const f of sueltas) {
    if (f.w[f.w.length - 1] !== mm && f.w[f.w.length - 1] !== String(mes)) {
      huerfanos.push({ ruta: f.ruta, carpeta: 'Nóminas', motivo: `El nombre no termina en " ${mm}"` });
      continue;
    }
    const filas = filasDeAlias(f.w);
    if (filas.length === 0) {
      huerfanos.push({ ruta: f.ruta, carpeta: 'Nóminas', motivo: 'No casa con ningún alias del maestro' });
    } else if (filas.length > 1) {
      ambiguos.push({ ruta: f.ruta, carpeta: 'Nóminas', filas: filas.map((r) => r.id) });
    } else {
      const id = filas[0].id;
      if (!nominaDeFila.has(id)) nominaDeFila.set(id, []);
      nominaDeFila.get(id).push(f);
    }
  }

  // Subcarpetas con nóminas individuales: el nombre de la carpeta debe SER un alias (no contenerlo).
  const subcarpetaDeFila = new Map();
  for (const [carpeta, ficheros] of subcarpetas) {
    const wc = palabras(carpeta).join(' ');
    const filas = maestro.filter((r) => r.aliases.some((a) => palabras(a).join(' ') === wc));
    if (filas.length === 1) {
      subcarpetaDeFila.set(filas[0].id, { carpeta, ficheros });
    } else {
      for (const f of ficheros) {
        huerfanos.push({
          ruta: f.ruta, carpeta: 'Nóminas',
          motivo: filas.length === 0
            ? `La subcarpeta "${carpeta}" no es un alias del maestro`
            : `La subcarpeta "${carpeta}" es alias de varias filas`,
        });
      }
    }
  }

  // ---- 2. Clasificar RNT y RLC -----------------------------------------------------
  // Casa si el nombre es la razón social, o la razón social seguida de un número de cuenta: "(2)", "2".
  function casaRazon(w, razon) {
    const wr = palabras(razon);
    if (wr.length === 0 || w.length < wr.length) return false;
    for (let i = 0; i < wr.length; i++) if (w[i] !== wr[i]) return false;
    const resto = w.slice(wr.length);
    return resto.length === 0 || (resto.length === 1 && /^\d{1,2}$/.test(resto[0]));
  }
  function repartirSS(ficheros, carpeta) {
    const porFila = new Map();
    for (const f of ficheros ?? []) {
      const partes = f.ruta.split(/[\\/]/);
      const nombre = partes[partes.length - 1];
      if (!esPdf(nombre) || partes.length > 1) { ignorados.push(`${carpeta}/${f.ruta}`); continue; }
      const w = palabras(sinExtension(nombre));
      const filas = maestro.filter((r) => r.razones.some((rz) => casaRazon(w, rz)));
      if (filas.length === 0) {
        huerfanos.push({ ruta: f.ruta, carpeta, motivo: 'No casa con ninguna razón social del maestro' });
      } else if (filas.length > 1) {
        ambiguos.push({ ruta: f.ruta, carpeta, filas: filas.map((r) => r.id) });
      } else {
        const id = filas[0].id;
        if (!porFila.has(id)) porFila.set(id, []);
        porFila.get(id).push({ ...f, nombre });
      }
    }
    return porFila;
  }
  const rntDeFila = repartirSS(e.rnt, 'RNT');
  const rlcDeFila = repartirSS(e.rlc, 'RLC');

  // ---- 3. Correos compartidos: el asunto lleva el nombre del cliente ----------------
  const usoEmail = new Map();
  for (const r of maestro) {
    if (r.recibe === 'NADA' || !r.email) continue;
    const k = r.email.toLowerCase();
    usoEmail.set(k, (usoEmail.get(k) ?? 0) + 1);
  }

  // ---- 4. Estado de cada fila ------------------------------------------------------
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
  const trabajadoresNuevos = [];
  const clientes = maestro.flatMap((r) => {
    if (r.envio === 'TRABAJADOR' && r.recibe === 'NOMINA') return porTrabajador(r);
    const avisos = [];
    const faltan = [];
    const quiereNomina = r.recibe === 'AMBAS' || r.recibe === 'NOMINA';
    const quiereSS = r.recibe === 'AMBAS' || r.recibe === 'SS';

    const sub = subcarpetaDeFila.get(r.id);
    const sueltasFila = nominaDeFila.get(r.id) ?? [];
    let nominas = [];
    let incidencia = null;
    let faltaDividir = null;
    if (sub) {
      nominas = [...sub.ficheros].sort(porNombre);
      avisos.push(`Nóminas individuales de la subcarpeta "${sub.carpeta}" (${nominas.length})` +
        (sueltasFila.length ? '; la nómina conjunta de la raíz no se adjunta' : ''));
      // Si la conjunta se ha vuelto a guardar después de dividirla, las individuales están viejas.
      const fechaConjunta = Math.max(...sueltasFila.map((f) => f.modificado ?? 0), 0);
      const fechaIndiv = Math.min(...nominas.map((f) => f.modificado ?? Infinity));
      if (fechaConjunta && fechaIndiv !== Infinity && fechaConjunta > fechaIndiv) {
        nominas = [];
        faltaDividir = 'volver a dividir la nómina (la conjunta es más reciente que las individuales)';
      }
    } else if (r.individuales) {
      // Cliente de nóminas individuales sin dividir todavía: la conjunta NUNCA se adjunta.
      if (sueltasFila.length === 1) faltaDividir = 'dividir la nómina en individuales';
      else if (sueltasFila.length > 1) {
        incidencia = `Hay ${sueltasFila.length} PDF de nómina candidatos: ` + sueltasFila.map((f) => f.nombre).join(' · ');
      }
    } else if (sueltasFila.length > 1) {
      incidencia = `Hay ${sueltasFila.length} PDF de nómina candidatos: ` +
        sueltasFila.map((f) => f.nombre).join(' · ');
    } else {
      nominas = sueltasFila;
    }
    const rnt = [...(rntDeFila.get(r.id) ?? [])].sort(porNombre);
    const rlc = [...(rlcDeFila.get(r.id) ?? [])].sort(porNombre);

    const compartido = r.email && (usoEmail.get(r.email.toLowerCase()) ?? 0) > 1;
    const asunto = compartido
      ? `${asuntoBase} - ${(r.razones[0] ?? r.id).toUpperCase()}`
      : asuntoBase;
    if (compartido) avisos.push('Correo compartido con otro cliente: el asunto lleva el nombre de la empresa');

    const base = {
      fila: r.fila, id: r.id, email: r.email, recibe: r.recibe, asunto, notas: r.notas,
      individuales: r.individuales,
      // Lo que la app tiene que dividir antes de poder enviar a este cliente.
      porDividir: faltaDividir && sueltasFila.length === 1
        ? { origen: sueltasFila[0].ruta, destino: carpetaIndividuales(r) } : null,
    };
    const tieneAlgo = nominas.length + sueltasFila.length + rnt.length + rlc.length > 0;

    if (r.recibe === 'NADA') {
      if (tieneAlgo) avisos.push('Tiene documentos este mes pero el maestro dice NADA');
      return { ...base, estado: ESTADO.NO_SE_ENVIA, adjuntos: [], cuenta: cuenta(nominas, rnt, rlc), faltan, avisos };
    }
    if (r.recibe === 'INVALIDO') {
      return { ...base, estado: ESTADO.INCIDENCIA, adjuntos: [], cuenta: cuenta(nominas, rnt, rlc), faltan,
        avisos: ['Columna RECIBE no válida en el maestro'] };
    }

    const enRegistro = yaEnviados.has(palabras(r.id).join(' ')) ||
      r.aliases.some((a) => yaEnviados.has(palabras(a).join(' ')));
    const enOutlook = r.email && enviadosOutlook.some((c) =>
      c.para === r.email.toLowerCase() && c.asunto === palabras(asunto).join(' '));
    if (enRegistro || enOutlook) {
      return { ...base, estado: ESTADO.YA_ENVIADO, adjuntos: [], cuenta: cuenta(nominas, rnt, rlc), faltan, avisos };
    }

    if (!emailValido(r.email)) incidencia = incidencia ?? (r.email ? `Correo no válido: "${r.email}"` : 'Sin correo en el maestro');
    const ambiguosFila = ambiguos.filter((a) => a.filas.includes(r.id));
    if (ambiguosFila.length) {
      incidencia = incidencia ?? ('Fichero que casa con varias filas del maestro: ' + ambiguosFila.map((a) => a.ruta).join(' · '));
    }
    if (incidencia) {
      return { ...base, estado: ESTADO.INCIDENCIA, adjuntos: [], cuenta: cuenta(nominas, rnt, rlc), faltan, avisos: [incidencia, ...avisos] };
    }

    if (quiereNomina && nominas.length === 0) faltan.push(faltaDividir ?? 'nómina');
    if (quiereSS && rnt.length === 0) faltan.push('RNT');
    if (quiereSS && rlc.length === 0) faltan.push('RLC');
    if (quiereSS && rnt.length && rlc.length && rnt.length !== rlc.length) {
      avisos.push(`Nº de RNT (${rnt.length}) distinto del de RLC (${rlc.length})`);
    }
    if (!quiereSS && (rnt.length || rlc.length)) avisos.push('Tiene RNT/RLC pero el maestro dice solo NOMINA: no se adjuntan');
    if (!quiereNomina && nominas.length) avisos.push('Tiene nómina pero el maestro dice solo SS: no se adjunta');

    const adjuntos = [
      ...(quiereNomina ? nominas.map((f) => ({ tipo: 'nomina', carpeta: 'Nóminas', ruta: f.ruta, bytes: f.bytes ?? 0, nominas: f.nominas ?? 1 })) : []),
      ...(quiereSS ? rnt.map((f) => ({ tipo: 'rnt', carpeta: 'RNT', ruta: f.ruta, bytes: f.bytes ?? 0 })) : []),
      ...(quiereSS ? rlc.map((f) => ({ tipo: 'rlc', carpeta: 'RLC', ruta: f.ruta, bytes: f.bytes ?? 0 })) : []),
    ];
    const nNominas = adjuntos.filter((x) => x.tipo === 'nomina').reduce((n, x) => n + x.nominas, 0);
    return {
      ...base,
      nNominas,
      texto: textoCorreo({ nNominas, tieneSS: adjuntos.some((x) => x.tipo !== 'nomina') }),
      estado: faltan.length ? ESTADO.PENDIENTE : ESTADO.LISTO,
      adjuntos: faltan.length ? [] : adjuntos,
      cuenta: cuenta(quiereNomina ? nominas : [], quiereSS ? rnt : [], quiereSS ? rlc : []),
      bytes: adjuntos.reduce((s, a) => s + a.bytes, 0),
      faltan,
      avisos,
    };
  });

  // ---- 4 bis. Empresas cuyas nóminas van directamente a cada trabajador ----------------
  function porTrabajador(r) {
    const sub = subcarpetaDeFila.get(r.id);
    const sueltasFila = nominaDeFila.get(r.id) ?? [];
    const comun = { fila: r.fila, recibe: 'NOMINA', notas: r.notas, individuales: true, empresa: r.id, porDividir: null,
      nNominas: 1, texto: textoCorreo({ nNominas: 1, tieneSS: false, aTrabajador: true }) };
    const asunto = `NOMINA ${MESES[mes - 1]} ${anio}`;
    const fechaConjunta = Math.max(...sueltasFila.map((f) => f.modificado ?? 0), 0);
    const fechaIndiv = sub ? Math.min(...sub.ficheros.map((f) => f.modificado ?? Infinity)) : Infinity;
    const vieja = sub && fechaConjunta && fechaIndiv !== Infinity && fechaConjunta > fechaIndiv;

    if (!sub || vieja) {
      // Aún sin dividir: una sola línea para la empresa.
      const falta = sueltasFila.length === 0 ? 'nómina'
        : vieja ? 'volver a dividir la nómina (la conjunta es más reciente que las individuales)'
          : 'dividir la nómina en individuales';
      const varias = sueltasFila.length > 1;
      return [{
        ...comun, id: r.id, email: '', asunto,
        estado: varias ? ESTADO.INCIDENCIA : ESTADO.PENDIENTE,
        adjuntos: [], cuenta: cuenta([], [], []), bytes: 0,
        faltan: varias ? [] : [falta],
        avisos: varias ? [`Hay ${sueltasFila.length} PDF de nómina candidatos`] : ['Cada nómina se envía al correo de su trabajador'],
        porDividir: sueltasFila.length === 1 ? { origen: sueltasFila[0].ruta, destino: carpetaIndividuales(r) } : null,
      }];
    }

    const entradas = [];
    const usados = new Set();
    for (const f of [...sub.ficheros].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))) {
      const clave = claveTrabajador(f.nombre);
      const quienes = r.trabajadores.filter((t) => palabras(t.nombre).join(' ') === clave);
      const t = quienes.length === 1 ? quienes[0] : null;
      const nombre = t ? t.nombre : sinExtension(f.nombre).replace(/\s+nom(ina)?\s+\d{1,2}$/i, '');
      const id = `${r.id} · ${nombre}`;
      const base = { ...comun, id, email: t ? t.email : '', asunto, cuenta: cuenta([f], [], []), bytes: f.bytes ?? 0, faltan: [] };
      const adjunto = { tipo: 'nomina', carpeta: 'Nóminas', ruta: f.ruta, bytes: f.bytes ?? 0 };
      if (t) usados.add(t);
      if (!t) {
        if (quienes.length === 0) trabajadoresNuevos.push({ empresa: r.id, nombre, ruta: f.ruta });
        entradas.push({ ...base, estado: ESTADO.INCIDENCIA, adjuntos: [],
          avisos: [quienes.length ? 'Trabajador repetido en la hoja Trabajadores' : 'Trabajador nuevo: falta indicar su correo'] });
      } else if (!emailValido(t.email)) {
        entradas.push({ ...base, estado: ESTADO.INCIDENCIA, adjuntos: [],
          avisos: [t.email ? `Correo no válido: "${t.email}"` : 'Sin correo en la hoja Trabajadores'] });
      } else if (yaEnviados.has(palabras(id).join(' ')) || enviadosOutlook.some((c) =>
        c.para === t.email.toLowerCase() && c.asunto === palabras(asunto).join(' '))) {
        entradas.push({ ...base, estado: ESTADO.YA_ENVIADO, adjuntos: [], avisos: [] });
      } else {
        entradas.push({ ...base, estado: ESTADO.LISTO, adjuntos: [adjunto], avisos: ['Se envía directamente al trabajador'] });
      }
    }
    for (const t of r.trabajadores) {
      if (usados.has(t)) continue;
      entradas.push({ ...comun, id: `${r.id} · ${t.nombre}`, email: t.email, asunto, estado: ESTADO.PENDIENTE,
        adjuntos: [], cuenta: cuenta([], [], []), bytes: 0, faltan: ['nómina'],
        avisos: ['Está en la hoja Trabajadores pero este mes no tiene nómina'] });
    }
    if ((rntDeFila.get(r.id) ?? []).length || (rlcDeFila.get(r.id) ?? []).length) {
      entradas[0]?.avisos.push('La empresa tiene RNT/RLC este mes: no se envían a los trabajadores');
    }
    return entradas;
  }

  // ---- 5. Comprobación final: ningún fichero puede ir a dos correos ------------------
  const visto = new Map();
  for (const c of clientes) {
    for (const a of c.adjuntos) {
      const k = `${a.carpeta}/${a.ruta}`;
      if (visto.has(k)) throw new Error(`Fallo de seguridad: ${k} asignado a "${visto.get(k)}" y a "${c.id}"`);
      visto.set(k, c.id);
    }
  }

  const nuevas = { ...candidatosNuevos(huerfanos), trabajadores: trabajadoresNuevos };
  const de = (estado) => clientes.filter((c) => c.estado === estado);
  return {
    mes, anio, asuntoBase,
    periodoSS: periodoSeguros(mes, anio),
    carpetas: carpetasDelMes(mes, anio),
    clientes,
    listos: de(ESTADO.LISTO),
    pendientes: de(ESTADO.PENDIENTE),
    yaEnviados: de(ESTADO.YA_ENVIADO),
    incidencias: de(ESTADO.INCIDENCIA),
    noSeEnvia: de(ESTADO.NO_SE_ENVIA),
    huerfanos,
    nuevas,
    ambiguos,
    ignorados,
  };
}

/**
 * Agrupa los ficheros huérfanos en posibles empresas nuevas, para preguntar a qué correo se envían.
 * No decide nada: solo propone un alias (del nombre de la nómina) o una razón social (del RNT/RLC).
 * Una nómina y unos seguros sociales de la misma empresa no se pueden unir por el nombre: los une la persona.
 */
export function candidatosNuevos(huerfanos) {
  const nominas = [];
  const seguros = new Map();
  const sinRenombrar = [];
  const otros = [];
  for (const h of huerfanos) {
    const nombre = h.ruta.split(/[\\/]/).pop();
    const base = sinExtension(nombre);
    const w = palabras(base);
    if (h.carpeta === 'Nóminas') {
      if (!/No casa con ningún alias/.test(h.motivo)) { otros.push(h); continue; }
      // "margarita lopez nom 10" → alias "margarita lopez"
      const corte = w.findIndex((x) => x === 'nom' || x === 'nomina' || x === 'nominas');
      const alias = (corte > 0 ? w.slice(0, corte) : w.slice(0, -1)).join(' ');
      if (!alias) { otros.push(h); continue; }
      nominas.push({ alias, ruta: h.ruta });
    } else {
      if (w.length === 1 && (w[0] === 'rnt' || w[0] === 'rlc')) { sinRenombrar.push(h); continue; }
      const razon = base.replace(/\s*\(?\d{1,2}\)?\s*$/, '').trim();
      const k = palabras(razon).join(' ');
      if (!seguros.has(k)) seguros.set(k, { razon, rnt: [], rlc: [] });
      seguros.get(k)[h.carpeta === 'RNT' ? 'rnt' : 'rlc'].push(h.ruta);
    }
  }
  return { nominas, seguros: [...seguros.values()], sinRenombrar, otros };
}

function cuenta(nominas, rnt, rlc) {
  return { nominas: nominas.length, rnt: rnt.length, rlc: rlc.length };
}
