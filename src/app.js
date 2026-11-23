// Pantalla del pre-chequeo. Dibuja lo que decide el motor; no decide nada por su cuenta.
// De momento trabaja con datos de demostración: la lectura de OneDrive y el envío real
// se conectan cuando la app esté registrada en Microsoft 365.
import { leerMaestro, prechequeo, MESES, dosCifras } from './motor.js?v=mwsvuvih';
import { demo } from './demo.js?v=mwsvuvih';
import { cuerpoHtml, CID_LOGO } from './correo.js?v=mwsvuvih';
import * as graph from './graph.js?v=mwsvuvih';
import { cargarMes, prepararSS, ejecutarSS, prepararDivision, ejecutarDivision, cargarContabilidad, guardarMarca } from './datos.js?v=mwsvuvih';
import { tablero, marcar, leerControl, estadoVacio, textoPaso, formatoEuros, PASO } from './contabilidad.js?v=mwsvuvih';

const estado = {
  mes: demo.mes, anio: demo.anio,
  tabla: demo.maestro.map((f) => [...f]),
  tablaTrab: demo.trabajadoresMaestro.map((f) => [...f]),
  nominas: [...demo.nominas], rnt: [...demo.rnt], rlc: [...demo.rlc],
  enviados: [...demo.enviados],
  enviadosOutlook: [],
  // 'demo' = datos inventados; 'real' = carpetas y correo de Microsoft 365, en solo lectura.
  modo: 'demo',
  usuario: null,
  sesionDisponible: false,
  cargando: null,
  errorCarga: null,
  avisosCarga: [],
  // División de los seguros sociales conjuntos: null | { prep } | { error }
  ss: null,
  div: null, // división de una nómina en curso: { id, prep } o { id, error }
  vista: 'envio', // 'envio' | 'contabilidad'
  conta: null, // datos del tablero de contabilidad del mes: { costes, control, cuadre, guardado } o { error }
  contaCargando: false,
  contaAbiertos: new Set(),
  guardando: null, // clave de la empresa cuya marca se está guardando
  modoPrueba: true, // envío real: todos los correos van a la cuenta de la sesión, con el destinatario real en el asunto
  enviando: false,
  informeEnvio: null, // [{ id, email, ok, detalle }] del último envío
  conjuntosSS: null, // en modo real, los PDF conjuntos encontrados al cargar el mes
  excluidos: new Set(),
  abiertos: new Set(),
  confirmando: false,
  aviso: null,
  errores: {},
};

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.round(b / 1024)} KB`);
const emailOk = (e) => /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(e);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function calcular() {
  const { filas, errores } = leerMaestro(estado.tabla, estado.tablaTrab);
  const r = prechequeo({
    mes: estado.mes, anio: estado.anio, maestro: filas,
    nominas: estado.nominas, rnt: estado.rnt, rlc: estado.rlc,
    yaEnviados: estado.enviados.map((e) => e.id),
    enviadosOutlook: estado.enviadosOutlook,
  });
  return { r, erroresMaestro: errores };
}

const textoCorreo = (c) => c.texto;

function pildoras(c) {
  const p = [];
  if (c.cuenta.nominas) p.push(`<span class="pil">${plural(c.cuenta.nominas, 'nómina', 'nóminas')}</span>`);
  if (c.cuenta.rnt) p.push(`<span class="pil">${c.cuenta.rnt} RNT</span>`);
  if (c.cuenta.rlc) p.push(`<span class="pil">${c.cuenta.rlc} RLC</span>`);
  return p.join('');
}

function filaCliente(c, { marcar = false, extra = '' } = {}) {
  const abierto = estado.abiertos.has(c.id);
  const detalle = abierto ? `
    <div class="detalle">
      ${c.asunto ? `<p class="linea"><span class="eti">Asunto</span> ${esc(c.asunto)}</p>` : ''}
      ${c.texto && c.adjuntos.length ? `<p class="linea"><span class="eti">Texto</span> ${esc(c.texto.replace(/\n+/g, ' '))}</p>` : ''}
      ${c.adjuntos.length ? `<ul class="ficheros">${c.adjuntos.map((a) => `<li><span class="eti">${esc(a.carpeta)}</span> <code>${esc(a.ruta)}</code> <span class="tenue">${kb(a.bytes)}</span></li>`).join('')}</ul>` : ''}
      ${c.avisos.map((a) => `<p class="nota">${esc(a)}</p>`).join('')}
      ${c.notas ? `<p class="nota">Nota del maestro: ${esc(c.notas)}</p>` : ''}
    </div>` : '';
  return `
  <li class="cli ${marcar && estado.excluidos.has(c.id) ? 'fuera' : ''}">
    <div class="cab">
      ${marcar ? `<input type="checkbox" id="chk-${esc(c.fila)}" data-accion="marcar" data-id="${esc(c.id)}" ${estado.excluidos.has(c.id) ? '' : 'checked'} aria-label="Incluir a ${esc(c.id)} en el envío">` : ''}
      <button class="nombre" data-accion="abrir" data-id="${esc(c.id)}" aria-expanded="${abierto}">
        <span class="alias">${esc(c.id)}</span>
        <span class="correo">${esc(c.email || 'sin correo')}</span>
      </button>
      <div class="lado">${extra || pildoras(c)}${c.avisos.length && !extra ? `<span class="pil aviso" title="${esc(c.avisos.join(' · '))}">${plural(c.avisos.length, 'aviso', 'avisos')}</span>` : ''}</div>
    </div>${detalle}
  </li>`;
}

function seccion(id, titulo, cuenta, cuerpo, { tono = '', ayuda = '' } = {}) {
  return `<section id="${id}" class="sec ${tono}">
    <header><h2>${titulo}</h2><span class="num">${cuenta}</span></header>
    ${ayuda ? `<p class="ayuda">${ayuda}</p>` : ''}${cuerpo}</section>`;
}

function formularioNueva(n, i, seguros) {
  const err = estado.errores[`nueva-${i}`];
  return `<form class="nueva" data-accion="alta" data-i="${i}" novalidate>
    <p class="quien"><strong>${esc(n.alias)}</strong> <span class="tenue">por el fichero</span> <code>${esc(n.ruta)}</code></p>
    <div class="campos">
      <label for="alias-${i}">Alias de la nómina<input id="alias-${i}" name="alias" value="${esc(n.alias)}" required></label>
      <label for="email-${i}">Correo al que se envía<input id="email-${i}" name="email" type="email" placeholder="nombre@empresa.es" autocomplete="off" required></label>
      <label for="razon-${i}">Seguros sociales (RNT/RLC)
        <select id="razon-${i}" name="razon"><option value="">No tiene, solo nómina</option>
          ${seguros.map((s) => `<option value="${esc(s.razon)}" ${seguros.length === 1 ? 'selected' : ''}>${esc(s.razon)}</option>`).join('')}
        </select></label>
      <label class="check" for="indiv-${i}"><input id="indiv-${i}" name="indiv" type="checkbox"> Nóminas individuales por trabajador</label>
    </div>
    ${err ? `<p class="error" role="alert">${esc(err)}</p>` : ''}
    <div class="botones">
      <button type="submit" class="b prim">Añadir al maestro</button>
      <button type="button" class="b" data-accion="no-enviar" data-i="${i}">A esta empresa no se le envía</button>
    </div>
  </form>`;
}

function bloqueSS(conjuntos) {
  const lista = conjuntos.map((h) => `<li><span class="eti">${esc(h.carpeta)}</span> <code>${esc(h.ruta)}</code></li>`).join('');
  const real = estado.modo === 'real';
  if (!estado.ss) {
    return `<p class="ayuda">Han llegado los RLC y RNT de todas las empresas en un PDF conjunto. Hay que dividirlos en un PDF por
      empresa, nombrado con su razón social, antes de poder enviarlos.</p>
      <ul class="ficheros suelto">${lista}</ul>
      <div class="botones"><button class="b prim" data-accion="ss-preparar" ${real ? '' : 'disabled title="Inicia sesión para dividir los seguros sociales reales"'}>Revisar la división</button></div>`;
  }
  if (estado.ss.error) {
    return `<p class="error" role="alert">${esc(estado.ss.error)}</p>
      <div class="botones"><button class="b" data-accion="ss-cancelar">Volver</button></div>`;
  }
  const { plan, yaDivididos, conjuntos: orig } = estado.ss.prep;
  const nRlc = plan.ficheros.filter((f) => f.tipo === 'RLC').length;
  const nRnt = plan.ficheros.filter((f) => f.tipo === 'RNT').length;
  const filas = plan.ficheros.map((f) => `<li><span class="eti">${esc(f.tipo)}</span> <code>${esc(f.nombre)}</code>
    <span class="tenue">${esc(f.calificador === 'L00' ? '' : f.calificador)}${f.existe ? ' · ya existe' : ''}</span></li>`).join('');
  if (!plan.ok) {
    return `<p class="error" role="alert">No se puede dividir. No se ha tocado ningún fichero.</p>
      ${plan.errores.map((e) => `<p class="nota">${esc(e)}</p>`).join('')}
      <div class="botones"><button class="b" data-accion="ss-cancelar">Volver</button></div>`;
  }
  const accion = yaDivididos
    ? `<p class="ayuda">Estos seguros sociales ya estaban divididos: todos los ficheros existen en la carpeta. Solo queda apartar
        los PDF conjuntos en la subcarpeta Originales para que no estorben.</p>
       <button class="b prim" data-accion="ss-ejecutar">Apartar los conjuntos en Originales</button>`
    : `<p class="ayuda">Se crearán ${nRlc} RLC y ${nRnt} RNT en sus carpetas. Los PDF conjuntos no se borran: se apartan en la
        subcarpeta Originales. Si ya existiera un fichero con el mismo nombre, no se sobrescribe.</p>
       <button class="b prim" data-accion="ss-ejecutar">Dividir y guardar en OneDrive</button>`;
  return `<p><strong>${plan.ficheros.length} liquidaciones</strong> en ${orig.map((o) => `<code>${esc(o.clave)}</code>`).join(' y ')}.</p>
    ${plan.avisos.map((a) => `<p class="nota">${esc(a)}</p>`).join('')}
    <details><summary>Ver los ${plan.ficheros.length} ficheros que salen</summary><ul class="ficheros suelto">${filas}</ul></details>
    ${accion}
    <div class="botones"><button class="b" data-accion="ss-cancelar">Cancelar</button></div>`;
}

function bloqueDivision() {
  const d = estado.div;
  if (d.error) {
    return `<div class="plan"><p class="error" role="alert">${esc(d.id)}: ${esc(d.error)}</p>
      ${(d.errores ?? []).map((e) => `<p class="nota">${esc(e)}</p>`).join('')}
      <div class="botones"><button class="b" data-accion="div-cancelar">Volver</button></div></div>`;
  }
  const p = d.prep;
  return `<div class="plan"><p><strong>${esc(d.id)}</strong>: <code>${esc(p.origen)}</code> de ${esc(p.empresa)} (${esc(p.cif)})
      se divide en ${plural(p.salidas.length, 'nómina individual', 'nóminas individuales')}:</p>
    <ul class="ficheros suelto">${p.salidas.map((s) => `<li><code>${esc(s.nombre)}</code> <span class="tenue">${esc(s.dni)}</span></li>`).join('')}</ul>
    <p class="ayuda">Se guardarán en la subcarpeta <code>${esc(p.destino)}</code>. La nómina conjunta no se borra ni se mueve, y no se
      sobrescribe ningún fichero.${p.otrosEnDestino.length ? ` En esa carpeta ya hay: ${esc(p.otrosEnDestino.join(', '))}.` : ''}</p>
    <div class="botones"><button class="b prim" data-accion="div-ejecutar">Dividir y guardar en OneDrive</button>
      <button class="b" data-accion="div-cancelar">Cancelar</button></div></div>`;
}

async function accionDivision(accion, id) {
  if (accion === 'div-cancelar') { estado.div = null; dibujar(); return; }
  if (estado.modo !== 'real') return;
  if (accion === 'div-preparar') {
    const c = calcular().r.clientes.find((x) => x.id === id);
    if (!c?.porDividir) return;
    estado.cargando = `Leyendo la nómina de ${id}…`; dibujar();
    try {
      const prep = await prepararDivision(estado.mes, estado.anio, c.porDividir);
      estado.div = prep.ok ? { id, prep } : { id, error: prep.motivo, errores: prep.errores };
    } catch (e) { estado.div = { id, error: `No se ha podido preparar: ${e.message}` }; }
    estado.cargando = null; dibujar();
    return;
  }
  if (accion === 'div-ejecutar' && estado.div?.prep) {
    const { id: quien, prep } = estado.div;
    estado.cargando = `Dividiendo la nómina de ${quien}…`; dibujar();
    try {
      const r = await ejecutarDivision(prep, (t) => { estado.cargando = t; dibujar(); });
      estado.div = null;
      await cargar(estado.mes, estado.anio);
      estado.aviso = `${quien}: ${plural(r.subidos.length, 'nómina individual guardada', 'nóminas individuales guardadas')} en ${prep.destino}.`;
    } catch (e) {
      estado.div = { id: quien, error: `Se ha detenido a mitad: ${e.message}. Revisa la carpeta ${prep.destino} antes de volver a intentarlo.` };
      estado.cargando = null;
    }
    dibujar();
  }
}

// ---- Envío real por Microsoft Graph -----------------------------------------------------

const nombreAdjunto = (a) => {
  const base = a.ruta.split('/').pop();
  return a.tipo === 'nomina' ? base : `${a.tipo.toUpperCase()} - ${base}`;
};

async function enviarReal() {
  if (estado.enviando) return;
  const { r } = calcular();
  const sel = r.listos.filter((c) => !estado.excluidos.has(c.id));
  if (!sel.length) return;
  const prueba = estado.modoPrueba;
  const yo = estado.usuario?.correo;
  if (prueba && !yo) { estado.aviso = 'No sé cuál es tu buzón: vuelve a iniciar sesión.'; dibujar(); return; }
  estado.enviando = true; estado.informeEnvio = []; estado.aviso = null;
  const desde = new Date(Date.now() - 5 * 60000).toISOString();
  const base = await graph.carpetaBase();
  const logo = { bytes: new Uint8Array(await (await fetch('assets/logo-firma.jpg')).arrayBuffer()), cid: CID_LOGO };
  const salidos = [];
  for (const [i, c] of sel.entries()) {
    estado.cargando = `${prueba ? 'Prueba: e' : 'E'}nviando ${i + 1} de ${sel.length}: ${c.id}…`; dibujar();
    try {
      const adjuntos = [];
      for (const a of c.adjuntos) adjuntos.push({ nombre: nombreAdjunto(a), bytes: await graph.descargarPorId(base, a.id) });
      const nombres = adjuntos.map((a) => a.nombre);
      if (new Set(nombres).size !== nombres.length) throw new Error('Dos adjuntos con el mismo nombre');
      const asunto = prueba ? `[PRUEBA para ${c.email}] ${c.asunto}` : c.asunto;
      await graph.enviarCorreo({ para: prueba ? yo : c.email, asunto, html: cuerpoHtml(c.texto), adjuntos, logo });
      salidos.push({ c, asunto, para: prueba ? yo : c.email, nombres });
      estado.informeEnvio.push({ id: c.id, email: c.email, ok: true, detalle: `${plural(nombres.length, 'adjunto', 'adjuntos')}; comprobando en Enviados…` });
    } catch (e) {
      estado.informeEnvio.push({ id: c.id, email: c.email, ok: false, detalle: e.message });
      // Se para al primer fallo: mejor revisar que seguir enviando a ciegas.
      estado.aviso = `Se ha detenido en ${c.id}. Los anteriores sí han salido. Revisa el error antes de seguir.`;
      break;
    }
  }
  // Comprobación en Enviados: el correo existe, va a quien debe y lleva exactamente los adjuntos previstos.
  estado.cargando = 'Comprobando en Enviados…'; dibujar();
  await new Promise((res) => setTimeout(res, 4000));
  for (const s of salidos) {
    const fila = estado.informeEnvio.find((x) => x.id === s.c.id);
    let vistos = null;
    for (let intento = 0; intento < 3 && !vistos; intento++) {
      try { vistos = await graph.buscarEnviado(s.asunto, s.para, desde); } catch { vistos = null; }
      if (!vistos) await new Promise((res) => setTimeout(res, 3000));
    }
    if (!vistos) { fila.detalle = 'Enviado, pero todavía no aparece en Enviados: compruébalo en Outlook'; continue; }
    const faltan = s.nombres.filter((n) => !vistos.includes(n));
    fila.detalle = faltan.length ? `En Enviados faltan adjuntos: ${faltan.join(', ')}` : `Comprobado en Enviados con sus ${plural(s.nombres.length, 'adjunto', 'adjuntos')}`;
    fila.ok = !faltan.length;
  }
  estado.enviando = false; estado.confirmando = false; estado.cargando = null;
  const bien = estado.informeEnvio.filter((x) => x.ok).length;
  if (!estado.aviso) {
    estado.aviso = prueba ? `Prueba terminada: ${plural(bien, 'correo', 'correos')} en tu buzón. Revísalos; a los clientes no les ha llegado nada.`
      : `${plural(bien, 'correo enviado', 'correos enviados')} a los clientes.`;
  }
  if (!prueba) { const av = estado.aviso; await cargar(estado.mes, estado.anio); estado.aviso = av; }
  dibujar();
}

async function accionSS(accion) {
  if (accion === 'ss-cancelar') { estado.ss = null; dibujar(); return; }
  if (estado.modo !== 'real') return;
  if (accion === 'ss-preparar') {
    estado.cargando = 'Preparando la división de los seguros sociales…'; dibujar();
    try {
      const prep = await prepararSS(estado.mes, estado.anio, (t) => { estado.cargando = t; dibujar(); });
      estado.ss = prep.ok ? { prep } : { error: prep.motivo };
    } catch (e) { estado.ss = { error: `No se ha podido preparar: ${e.message}` }; }
    estado.cargando = null; dibujar();
    return;
  }
  if (accion === 'ss-ejecutar' && estado.ss?.prep) {
    const prep = estado.ss.prep;
    estado.cargando = 'Dividiendo los seguros sociales…'; dibujar();
    try {
      const r = await ejecutarSS(prep, (t) => { estado.cargando = t; dibujar(); });
      estado.ss = null;
      await cargar(estado.mes, estado.anio);
      estado.aviso = `Seguros sociales: ${r.subidos.length} ficheros creados y ${r.movidos.length} conjuntos apartados en Originales.`;
    } catch (e) {
      estado.ss = { error: `Se ha detenido a mitad: ${e.message}. Revisa las carpetas RLC y RNT antes de volver a intentarlo.` };
      estado.cargando = null;
    }
    dibujar();
  }
}

function cabeceraHtml(ss) {
  const real = estado.modo === 'real';
  const anios = [estado.anio - 1, estado.anio, estado.anio + 1];
  const sesion = real
    ? `<div class="sesion"><span class="tenue">${esc(estado.usuario?.correo ?? '')}</span>
        <label class="oculto" for="sel-mes">Mes</label>
        <select id="sel-mes">${MESES.map((m, i) => `<option value="${i + 1}" ${i + 1 === estado.mes ? 'selected' : ''}>${m[0]}${m.slice(1).toLowerCase()}</option>`).join('')}</select>
        <label class="oculto" for="sel-anio">Año</label>
        <select id="sel-anio">${anios.map((a) => `<option ${a === estado.anio ? 'selected' : ''}>${a}</option>`).join('')}</select>
        <button class="b" data-accion="cargar">Cargar mes</button>
        <button class="b" data-accion="salir">Cerrar sesión</button></div>`
    : `<div class="sesion"><button class="b prim" data-accion="entrar" ${estado.sesionDisponible ? '' : 'disabled'}>Iniciar sesión con Microsoft</button></div>`;
  const cabecera = `
    <header class="top">
      <div><p class="marca">PROTINCAL · Laboral</p><h1>${estado.vista === 'contabilidad' ? 'Contabilidad de nóminas' : 'Envío de nóminas'}</h1></div>
      <div class="periodo"><span class="mes">${MESES[estado.mes - 1]} ${estado.anio}</span>
        <span class="tenue">${estado.vista === 'contabilidad' ? 'Costes del mes · cuadre con el RLC del mismo mes' : `Seguros sociales de ${dosCifras(ss.mes)}/${ss.anio}`}</span></div>
    </header>
    ${sesion}
    <nav class="pestanas" aria-label="Secciones">
      <button class="pest" data-accion="vista" data-id="envio" aria-current="${estado.vista === 'envio' ? 'page' : 'false'}">Envío</button>
      <button class="pest" data-accion="vista" data-id="contabilidad" aria-current="${estado.vista === 'contabilidad' ? 'page' : 'false'}">Contabilidad</button>
    </nav>
    ${real
      ? '<p class="demo" role="note">Versión de prueba: lee tus carpetas y tu correo. Todavía no envía correos ni modifica el maestro. Solo divide los seguros sociales y las nóminas, y guarda las marcas de contabilidad, siempre cuando tú lo pides.</p>'
      : '<p class="demo" role="note">Demostración con datos inventados. Inicia sesión para ver tus carpetas reales.</p>'}
    ${estado.errorCarga ? `<p class="error" role="alert">${esc(estado.errorCarga)}</p>` : ''}
    ${estado.avisosCarga.map((a) => `<p class="nota">${esc(a)}</p>`).join('')}`;
  return cabecera;
}

// ---- Tablero de contabilidad ------------------------------------------------------------

function datosConta() {
  if (estado.modo !== 'real') {
    if (!estado.conta) {
      const d = demo.contabilidad;
      estado.conta = { costes: d.costes, control: { ...leerControl(d.control), modificado: 1000 }, cuadre: d.cuadre ? { ...leerControl(d.cuadre), modificado: 1000 } : null,
        guardado: structuredClone(d.guardado), hayImportar: true };
    }
    return estado.conta;
  }
  if (!estado.conta && !estado.contaCargando) {
    estado.contaCargando = true;
    cargarContabilidad(estado.mes, estado.anio, (t) => { estado.cargando = t; dibujar(); })
      .then((d) => { estado.conta = d.ok ? d : { error: d.motivo }; })
      .catch((e) => { estado.conta = { error: `No se ha podido leer: ${e.message}` }; })
      .finally(() => { estado.contaCargando = false; estado.cargando = null; dibujar(); });
  }
  return estado.conta;
}

const PIL_GEN = { OK: ['ok', 'Fichero OK'], REVISAR: ['ojo', 'Fichero con avisos'], ERROR: ['mal', 'Fichero con error'] };
const fecha = (iso) => { const d = new Date(iso); return `${dosCifras(d.getDate())}/${dosCifras(d.getMonth() + 1)}`; };

function pildorasConta(f) {
  if (f.paso === PASO.FUERA) return '<span class="pil">Fuera de Quantum</span>';
  if (f.descartada) return '<span class="pil">Sin importar</span>';
  const p = [];
  if (f.porGenerar) p.push('<span class="pil ojo">Por generar</span>');
  else if (f.generado) { const [t, txt] = PIL_GEN[f.generado]; p.push(`<span class="pil ${t}">${txt}</span>`); }
  if (f.importado) p.push(`<span class="pil ok">Importado ${fecha(f.importado.cuando)}</span>`);
  const c = f.cuadre.estado;
  if (c === 'ok') p.push('<span class="pil ok">Cuadra con RLC</span>');
  else if (c === 'corregido') p.push('<span class="pil ok">Corregido al RLC</span>');
  else if (c === 'descuadre' || c === 'sin-rlc') p.push('<span class="pil mal">Descuadre RLC</span>');
  if (f.revisado) p.push(`<span class="pil ok">Revisado ${fecha(f.revisado.cuando)}</span>`);
  return p.join('');
}

function filaConta(f) {
  const abierto = estado.contaAbiertos.has(f.clave);
  const ocupado = estado.guardando === f.clave;
  const puedeImportar = !f.porGenerar && (f.generado === 'OK' || f.generado === 'REVISAR');
  const botones = f.paso === PASO.FUERA ? '' : `<div class="botones">
      ${f.importado
    ? `<button class="b" data-accion="conta-marca" data-id="${esc(f.clave)}" data-que="importado-no" ${ocupado ? 'disabled' : ''}>Deshacer «importado»</button>`
    : `<button class="b prim" data-accion="conta-marca" data-id="${esc(f.clave)}" data-que="importado" ${puedeImportar && !ocupado ? '' : 'disabled'}>Marcar importado en Quantum</button>`}
      ${f.importado ? (f.revisado
    ? `<button class="b" data-accion="conta-marca" data-id="${esc(f.clave)}" data-que="revisado-no" ${ocupado ? 'disabled' : ''}>Deshacer «revisado»</button>`
    : `<button class="b ${f.paso === PASO.REVISAR ? 'prim' : ''}" data-accion="conta-marca" data-id="${esc(f.clave)}" data-que="revisado" ${ocupado ? 'disabled' : ''}>Marcar mayores revisados</button>`) : ''}
    </div>`;
  const inc = (lista, clase) => lista.map((x) => `<p class="${clase}">${x.trabajador ? `<strong>${esc(x.trabajador)}</strong>: ` : ''}${esc(x.detalle)}</p>`).join('');
  const detalle = abierto ? `<div class="detalle">
      <ul class="ficheros">${f.ficheros.map((x) => `<li><span class="eti">Costes</span> <code>${esc(x)}</code></li>`).join('')}
        ${f.salidas.map((x) => `<li><span class="eti">Importar</span> <code>${esc(x)}</code></li>`).join('')}</ul>
      ${f.generado ? `<p class="linea tenue">${plural(f.trabajadores, 'trabajador', 'trabajadores')} · bruto ${formatoEuros(f.bruto)} · líquido ${formatoEuros(f.liquido)} · liquidación SS ${formatoEuros(f.liqSS)}</p>` : ''}
      ${f.cuadre.rlc !== undefined ? `<p class="linea tenue">RLC ${formatoEuros(f.cuadre.rlc)} · diferencia ${formatoEuros(f.cuadre.dif)}</p>` : ''}
      ${f.cuadre.estado === 'corregido' ? `<p class="linea tenue">Corregido en Quantum para que coincida con el RLC${f.cuadre.nota ? `: ${esc(f.cuadre.nota)}` : ''}</p>` : ''}
      ${inc(f.errores, 'error')}${inc(f.revisar, 'nota')}
      ${f.info.length ? `<details><summary class="tenue">${plural(f.info.length, 'nota informativa', 'notas informativas')}</summary>${inc(f.info, 'tenue')}</details>` : ''}
      ${f.importado ? `<p class="linea tenue">Importado el ${fecha(f.importado.cuando)} por ${esc(f.importado.quien)}</p>` : ''}
      ${f.revisado ? `<p class="linea tenue">Mayores revisados el ${fecha(f.revisado.cuando)} por ${esc(f.revisado.quien)}</p>` : ''}
      ${botones}
    </div>` : '';
  return `<li class="cli">
    <div class="cab">
      <button class="nombre" data-accion="conta-abrir" data-id="${esc(f.clave)}" aria-expanded="${abierto}">
        <span class="alias">${esc(f.nombre)}</span>
        <span class="paso"><code>${esc(f.nif || 'sin NIF')}</code> · ${esc(textoPaso(f))}</span>
      </button>
      <div class="lado">${pildorasConta(f)}</div>
    </div>${detalle}</li>`;
}

function dibujarContabilidad() {
  const cabecera = cabeceraHtml(null);
  const app = document.getElementById('app');
  const d = datosConta();
  if (estado.cargando || !d) { app.innerHTML = `${cabecera}<p class="cargando" role="status">${esc(estado.cargando ?? 'Leyendo la contabilidad del mes…')}</p>`; return; }
  if (d.error) { app.innerHTML = `${cabecera}<p class="error" role="alert">${esc(d.error)}</p>`; return; }
  const t = tablero(d);
  const grupo = (pasos) => t.filas.filter((f) => pasos.includes(f.paso));
  const lista = (fs) => `<ul class="lista">${fs.map(filaConta).join('')}</ul>`;
  const atencion = grupo([PASO.ERROR, PASO.DESCUADRE, PASO.GENERAR]);
  const tiles = [
    ['#c-atencion', t.cuentas.atencion, 'Requieren tu atención', t.cuentas.atencion ? 'mal' : ''],
    ['#c-importar', t.cuentas.importar, 'Por importar', t.cuentas.importar ? 'ojo' : ''],
    ['#c-cuadrar', t.cuentas.cuadrar, 'Pendientes del RLC', ''],
    ['#c-revisar', t.cuentas.revisar, 'Por revisar mayores', t.cuentas.revisar ? 'ojo' : ''],
    ['#c-cerradas', t.cuentas.cerradas, 'Cerradas', 'ok'],
  ].map(([h, n, txt, tono]) => `<a class="tile ${tono}" href="${h}"><span class="n">${n}</span><span class="t">${txt}</span></a>`).join('');
  const sinRlc = t.rlcSinExcel.map((x) => `<p class="nota">RLC sin Excel de costes: <strong>${esc(x.razon)}</strong>. ${esc(x.detalle)}</p>`).join('');
  const avisoControl = !t.hayControl && t.filas.length
    ? '<p class="nota">Todavía no se han generado los ficheros de importación de este mes. Pídeselo a Claude en el proyecto Laboral.</p>' : '';
  app.innerHTML = `${cabecera}
    ${estado.aviso ? `<p class="hecho" role="status">${esc(estado.aviso)}</p>` : ''}
    ${t.filas.length ? `<nav class="tiles cinco" aria-label="Resumen">${tiles}</nav>` : '<p class="vacio">No hay Excel de costes en la carpeta de este mes.</p>'}
    ${avisoControl}
    ${atencion.length || sinRlc ? seccion('c-atencion', 'Requieren tu atención', atencion.length + t.rlcSinExcel.length, `${sinRlc}${atencion.length ? lista(atencion) : ''}`,
    { tono: 'atencion', ayuda: 'No se importan hasta resolverlo. Los ficheros por generar los prepara Claude con el script.' }) : ''}
    ${seccion('c-importar', 'Por importar en Quantum', t.cuentas.importar, t.cuentas.importar ? lista(grupo([PASO.IMPORTAR])) : '<p class="vacio">Nada pendiente de importar.</p>',
    { ayuda: 'Los ficheros están en IMPORTAR QUANTUM. Cuando lo importes, márcalo aquí.' })}
    ${seccion('c-cuadrar', 'Pendientes de cuadrar con el RLC', t.cuentas.cuadrar, t.cuentas.cuadrar ? lista(grupo([PASO.CUADRAR])) : '<p class="vacio">Nada pendiente.</p>',
    { ayuda: 'Importadas. El RLC de este mes llega a mes vencido: entonces Claude pasa el cuadre y se actualiza solo.' })}
    ${seccion('c-revisar', 'Por revisar los mayores', t.cuentas.revisar, t.cuentas.revisar ? lista(grupo([PASO.REVISAR])) : '<p class="vacio">Nada pendiente.</p>',
    { ayuda: 'Cuadran con el RLC. Falta comprobar los mayores (640, 642, 476, 4751, 465…).' })}
    <details id="c-cerradas" class="sec plegada"><summary>Cerradas (${t.cuentas.cerradas})</summary>${t.cuentas.cerradas ? lista(grupo([PASO.CERRADA])) : '<p class="vacio">Ninguna todavía.</p>'}</details>
    ${t.cuentas.fuera ? `<details class="sec plegada"><summary>No se llevan en Quantum (${t.cuentas.fuera})</summary>
      <p class="ayuda">Personas físicas o empresas sin trabajadores en la tabla de Quantum. Si alguna sí se lleva en Quantum, hay que completar la tabla de trabajadores.</p>${lista(grupo([PASO.FUERA]))}</details>` : ''}
    <footer class="pie">Carpeta: <code>Nóminas/${dosCifras(estado.mes)}${estado.anio}/IMPORTAR QUANTUM</code></footer>`;
}

async function accionConta(accion, clave, que) {
  if (accion === 'conta-abrir') {
    estado.contaAbiertos.has(clave) ? estado.contaAbiertos.delete(clave) : estado.contaAbiertos.add(clave);
    dibujar(); return;
  }
  if (accion !== 'conta-marca' || !estado.conta || estado.guardando) return;
  const valor = !que.endsWith('-no');
  const tipo = que.replace(/-no$/, '');
  const quien = estado.usuario?.correo ?? 'demostración';
  estado.aviso = null;
  if (estado.modo !== 'real') {
    estado.conta.guardado = marcar(estado.conta.guardado, clave, tipo, valor, { quien });
    dibujar(); return;
  }
  estado.guardando = clave; dibujar();
  try {
    const r = await guardarMarca(estado.mes, estado.anio, clave, tipo, valor, quien);
    estado.conta.guardado = r.guardado; estado.conta.etag = r.etag;
  } catch (e) {
    estado.aviso = null;
    estado.conta = { ...estado.conta };
    alertaConta(`No se ha podido guardar en OneDrive: ${e.message}. No se ha marcado nada.`);
  }
  estado.guardando = null; dibujar();
}

function alertaConta(texto) { estado.avisosCarga = [texto]; }

function dibujarContenido() {
  if (estado.vista === 'contabilidad') { dibujarContabilidad(); return; }
  const { r, erroresMaestro } = calcular();
  const seleccion = r.listos.filter((c) => !estado.excluidos.has(c.id));
  const porDividir = r.clientes.filter((c) => c.porDividir && c.estado === 'PENDIENTE');
  const pendientes = r.pendientes.filter((c) => !c.porDividir);
  const segurosSueltos = r.nuevas.seguros;
  const nNuevas = r.nuevas.nominas.length + (r.nuevas.nominas.length ? 0 : segurosSueltos.length);
  const trabNuevos = r.nuevas.trabajadores;
  const idsTrabNuevos = new Set(trabNuevos.map((t) => `${t.empresa} · ${t.nombre}`));
  const incidencias = r.incidencias.filter((c) => !idsTrabNuevos.has(c.id));
  const bloqueos = nNuevas + trabNuevos.length + porDividir.length + incidencias.length + erroresMaestro.length +
    ((estado.conjuntosSS ?? r.nuevas.sinRenombrar).length ? 1 : 0);
  const ss = r.periodoSS;

  const resumen = [
    ['#listos', r.listos.length, 'Listos', 'ok'],
    ['#antes', bloqueos, 'Requieren tu atención', bloqueos ? 'mal' : ''],
    ['#pendientes', pendientes.length, 'Pendientes de documentos', pendientes.length ? 'ojo' : ''],
    ['#enviados', r.yaEnviados.length, 'Ya enviados', ''],
  ].map(([h, n, t, tono]) => `<a class="tile ${tono}" href="${h}"><span class="n">${n}</span><span class="t">${t}</span></a>`).join('');

  let antes = '';
  const conjuntosSS = estado.conjuntosSS ?? r.nuevas.sinRenombrar;
  if (conjuntosSS.length || estado.ss) {
    antes += `<div class="bloque"><h3>Seguros sociales sin dividir</h3>${bloqueSS(conjuntosSS)}</div>`;
  }
  if (r.nuevas.nominas.length || segurosSueltos.length) {
    antes += `<div class="bloque"><h3>Empresas nuevas</h3>
      <p class="ayuda">Hay documentos de empresas que no están en el maestro. No se envían a nadie hasta que indiques el correo.</p>
      ${r.nuevas.nominas.map((n, i) => formularioNueva(n, i, segurosSueltos)).join('')}
      ${!r.nuevas.nominas.length ? segurosSueltos.map((s) => `<p class="nota">Seguros sociales sin cliente: <strong>${esc(s.razon)}</strong> (${s.rnt.length} RNT, ${s.rlc.length} RLC). Falta su nómina o su fila en el maestro.</p>`).join('') : ''}
    </div>`;
  }
  if (trabNuevos.length) {
    antes += `<div class="bloque"><h3>Trabajadores nuevos</h3>
      <p class="ayuda">En estas empresas cada nómina va al correo de su trabajador. Falta el correo de alguien; su nómina no se envía a nadie hasta que lo indiques.</p>
      ${trabNuevos.map((t, i) => `<form class="nueva" data-accion="alta-trabajador" data-i="${i}" novalidate>
        <p class="quien"><strong>${esc(t.nombre)}</strong> <span class="tenue">de</span> ${esc(t.empresa)} · <code>${esc(t.ruta)}</code></p>
        <div class="campos"><label for="temail-${i}">Correo del trabajador<input id="temail-${i}" name="email" type="email" placeholder="nombre@correo.es" autocomplete="off" required></label></div>
        ${estado.errores[`trab-${i}`] ? `<p class="error" role="alert">${esc(estado.errores[`trab-${i}`])}</p>` : ''}
        <div class="botones"><button type="submit" class="b prim">Guardar correo</button></div></form>`).join('')}
    </div>`;
  }
  if (porDividir.length) {
    antes += `<div class="bloque"><h3>Nóminas por dividir</h3>
      <p class="ayuda">Estos clientes reciben una nómina por trabajador. Hay que dividir el PDF conjunto antes de enviar.</p>
      <ul class="lista">${porDividir.map((c) => filaCliente(c, { extra: estado.modo === 'real'
        ? `<button class="b prim" data-accion="div-preparar" data-id="${esc(c.id)}">Revisar la división</button>`
        : `<button class="b prim" data-accion="dividir" data-id="${esc(c.id)}">Dividir nómina</button>` })).join('')}</ul>
      ${estado.div ? bloqueDivision() : ''}</div>`;
  }
  if (incidencias.length || erroresMaestro.length) {
    antes += `<div class="bloque"><h3>Incidencias</h3>
      <ul class="lista">${incidencias.map((c) => filaCliente(c, { extra: `<span class="pil mal">${esc(c.avisos[0] ?? 'Revisar')}</span>` })).join('')}</ul>
      ${erroresMaestro.map((e) => `<p class="nota">Maestro, fila ${e.fila}: ${esc(e.detalle)}</p>`).join('')}</div>`;
  }
  if (r.nuevas.otros.length || r.ambiguos.length) {
    antes += `<div class="bloque"><h3>Ficheros sin dueño</h3><ul class="ficheros suelto">
      ${r.nuevas.otros.map((h) => `<li><span class="eti">${esc(h.carpeta)}</span> <code>${esc(h.ruta)}</code> <span class="tenue">${esc(h.motivo)}</span></li>`).join('')}
      ${r.ambiguos.map((h) => `<li><span class="eti">${esc(h.carpeta)}</span> <code>${esc(h.ruta)}</code> <span class="tenue">casa con varias filas: ${esc(h.filas.join(', '))}</span></li>`).join('')}
    </ul></div>`;
  }

  let listos;
  if (estado.confirmando && seleccion.length) {
    const total = seleccion.reduce((s, c) => s + c.bytes, 0);
    listos = `<div class="confirma">
      <h3>Vas a enviar ${plural(seleccion.length, 'correo', 'correos')}</h3>
      <ol class="repaso">${seleccion.map((c) => `<li><span class="alias">${esc(c.id)}</span><span class="correo">${esc(c.email)}</span><span class="tenue">${esc(c.asunto)} · ${plural(c.adjuntos.length, 'adjunto', 'adjuntos')} · ${kb(c.bytes)}</span></li>`).join('')}</ol>
      ${[...new Set(seleccion.map(textoCorreo))].map((t) => `<p class="eti">Así llega el correo <span class="tenue">(${plural(seleccion.filter((c) => textoCorreo(c) === t).length, 'correo', 'correos')})</span></p>
        <div class="vista">${cuerpoHtml(t, 'assets/logo-firma.jpg')}</div>`).join('')}
      <p class="tenue">Total: ${kb(total)}. Tras enviar se comprueba en Enviados que cada correo ha salido con sus adjuntos.</p>
      ${estado.modo === 'real' ? `<label class="prueba"><input type="checkbox" data-accion="modo-prueba" ${estado.modoPrueba ? 'checked' : ''}>
        <span><strong>Modo prueba:</strong> todos los correos llegan a ${esc(estado.usuario?.correo ?? 'tu buzón')}, con el destinatario real en el asunto. A los clientes no les llega nada.</span></label>` : ''}
      <div class="botones"><button class="b prim ${estado.modo === 'real' && !estado.modoPrueba ? 'peligro' : ''}" data-accion="enviar" ${estado.enviando ? 'disabled' : ''}>${
  estado.modo !== 'real' ? `Enviar ${plural(seleccion.length, 'correo', 'correos')}`
    : estado.modoPrueba ? `Enviar ${plural(seleccion.length, 'correo', 'correos')} de prueba a mi buzón`
      : `Enviar ${plural(seleccion.length, 'correo', 'correos')} a los clientes`}</button>
      <button class="b" data-accion="cancelar" ${estado.enviando ? 'disabled' : ''}>Volver</button></div></div>`;
  } else {
    listos = r.listos.length
      ? `<ul class="lista">${r.listos.map((c) => filaCliente(c, { marcar: true })).join('')}</ul>
         <div class="barra"><span>${seleccion.length} de ${r.listos.length} seleccionados</span>
         <button class="b prim" data-accion="revisar" ${seleccion.length ? '' : 'disabled'}>Revisar y enviar</button></div>`
      : '<p class="vacio">No hay ningún cliente listo para enviar.</p>';
  }

  const cabecera = cabeceraHtml(ss);
  if (estado.cargando) {
    document.getElementById('app').innerHTML = `${cabecera}<p class="cargando" role="status">${esc(estado.cargando)}</p>`;
    return;
  }
  const informe = estado.informeEnvio ? `<div class="bloque informe"><h3>Resultado del envío</h3><ul class="ficheros suelto">
      ${estado.informeEnvio.map((x) => `<li><span class="pil ${x.ok ? 'ok' : 'mal'}">${x.ok ? 'Enviado' : 'No enviado'}</span> <strong>${esc(x.id)}</strong> <span class="tenue">${esc(x.email)} · ${esc(x.detalle)}</span></li>`).join('')}
    </ul></div>` : '';
  document.getElementById('app').innerHTML = `${cabecera}
    ${estado.aviso ? `<p class="hecho" role="status">${esc(estado.aviso)}</p>` : ''}
    ${informe}
    <nav class="tiles" aria-label="Resumen">${resumen}</nav>
    ${antes ? seccion('antes', 'Antes de enviar', bloqueos, antes, { tono: 'atencion' }) : ''}
    ${seccion('listos', 'Listos para enviar', r.listos.length, listos, { ayuda: 'Tienen todos sus documentos y todavía no se les ha enviado este mes.' })}
    ${seccion('pendientes', 'Pendientes de documentos', pendientes.length, pendientes.length
      ? `<ul class="lista">${pendientes.map((c) => filaCliente(c, { extra: `<span class="pil ojo">Falta ${esc(c.faltan.join(', '))}</span>` })).join('')}</ul>`
      : '<p class="vacio">Nadie pendiente.</p>', { ayuda: 'No se envía a medias: saldrán en otra tanda cuando estén completos.' })}
    ${seccion('enviados', 'Ya enviados este mes', r.yaEnviados.length, r.yaEnviados.length
      ? `<ul class="lista">${r.yaEnviados.map((c) => filaCliente(c, { extra: `<span class="pil ok">${esc(estado.enviados.find((e) => e.id === c.id)?.cuando ?? 'Enviado')}</span>` })).join('')}</ul>`
      : '<p class="vacio">Todavía no se ha enviado nada.</p>')}
    <details class="sec plegada" ${r.noSeEnvia.some((c) => c.cuenta.nominas) ? 'open' : ''}><summary>No se envían por correo (${r.noSeEnvia.length})</summary>
      <p class="ayuda">La app no les envía nada. Si tienen nómina este mes, hay que hacerla llegar por otra vía.</p>
      <ul class="lista">${r.noSeEnvia.map((c) => filaCliente(c, { extra: `${c.cuenta.nominas ? `<span class="pil ojo">${plural(c.cuenta.nominas, 'nómina', 'nóminas')} este mes</span>` : ''}<span class="pil">${esc(c.notas || 'Maestro: NADA')}</span>` })).join('')}</ul></details>
    <footer class="pie">Carpetas: <code>${esc(r.carpetas.nominas)}</code> · <code>${esc(r.carpetas.rnt)}</code> · <code>${esc(r.carpetas.rlc)}</code></footer>`;
}

function dibujar() {
  dibujarContenido();
  bloquearCambios();
}

/** En modo real (solo lectura) se desactiva todo lo que enviaría o modificaría algo. */
function bloquearCambios() {
  if (estado.modo !== 'real') return;
  const sel = '[data-accion="dividir"], [data-accion="no-enviar"], form.nueva button, form.nueva input, form.nueva select';
  document.querySelectorAll(sel).forEach((el) => { el.disabled = true; el.title = 'Desactivado en la versión de prueba'; });
}

async function cargar(mes, anio, { probarAnterior = false } = {}) {
  estado.ss = null;
  estado.div = null;
  estado.confirmando = false;
  estado.conta = null; estado.contaAbiertos = new Set();
  estado.conjuntosSS = null;
  estado.errorCarga = null; estado.avisosCarga = []; estado.aviso = null; estado.confirmando = false;
  estado.mes = mes; estado.anio = anio;
  estado.cargando = 'Conectando con Microsoft 365…';
  dibujar();
  try {
    let d = await cargarMes(mes, anio, (t) => { estado.cargando = t; dibujar(); });
    if (!d.ok && probarAnterior) {
      // Si aún no existe la carpeta del mes en curso, se abre el mes anterior.
      const ant = mes === 1 ? { mes: 12, anio: anio - 1 } : { mes: mes - 1, anio };
      const motivo = d.motivo;
      d = await cargarMes(ant.mes, ant.anio, (t) => { estado.cargando = t; dibujar(); });
      if (d.ok) { estado.mes = ant.mes; estado.anio = ant.anio; estado.avisosCarga = [`${motivo}: se muestra el mes anterior.`]; }
    }
    if (!d.ok) {
      estado.errorCarga = d.motivo;
      estado.tabla = [demo.maestro[0]]; estado.tablaTrab = []; estado.nominas = []; estado.rnt = []; estado.rlc = [];
    } else {
      estado.tabla = d.tabla; estado.tablaTrab = d.tablaTrab;
      estado.nominas = d.nominas; estado.rnt = d.rnt; estado.rlc = d.rlc;
      estado.enviadosOutlook = d.enviadosOutlook;
      estado.conjuntosSS = d.conjuntosSS;
      estado.avisosCarga.push(...d.avisos);
    }
    estado.enviados = []; estado.excluidos = new Set(); estado.abiertos = new Set();
  } catch (e) {
    estado.errorCarga = `No se han podido leer los datos: ${e.message}`;
  }
  estado.cargando = null;
  dibujar();
}

async function arrancar() {
  dibujar();
  try {
    const usuario = await graph.iniciar();
    estado.sesionDisponible = true;
    if (usuario) {
      estado.modo = 'real'; estado.usuario = usuario;
      const hoy = new Date();
      await cargar(hoy.getMonth() + 1, hoy.getFullYear(), { probarAnterior: true });
      return;
    }
  } catch (e) {
    estado.errorCarga = `Inicio de sesión no disponible: ${e.message}`;
  }
  dibujar();
}

function ahora() {
  const d = new Date();
  return `${dosCifras(d.getDate())}/${dosCifras(d.getMonth() + 1)}/${d.getFullYear()} ${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`;
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-accion]');
  if (!el || el.tagName === 'FORM') return;
  const { accion, id } = el.dataset;
  if (accion && accion.startsWith('ss-')) { accionSS(accion); return; }
  if (accion && accion.startsWith('div-')) { accionDivision(accion, id); return; }
  if (accion === 'vista') { estado.vista = id; estado.aviso = null; dibujar(); window.scrollTo(0, 0); return; }
  if (accion && accion.startsWith('conta-')) { accionConta(accion, id, el.dataset.que); return; }
  if (accion === 'entrar') { graph.entrar(); return; }
  if (accion === 'salir') { graph.salir(); return; }
  if (accion === 'cargar') {
    cargar(Number(document.getElementById('sel-mes').value), Number(document.getElementById('sel-anio').value));
    return;
  }
  // Solo lectura: en modo real no se ejecuta nada que envíe o modifique.
  if (accion === 'modo-prueba') { estado.modoPrueba = el.checked; dibujar(); return; }
  if (estado.modo === 'real' && accion === 'enviar') { enviarReal(); return; }
  if (estado.modo === 'real' && ['dividir', 'no-enviar'].includes(accion)) return;
  estado.aviso = null;
  if (accion === 'abrir') estado.abiertos.has(id) ? estado.abiertos.delete(id) : estado.abiertos.add(id);
  else if (accion === 'marcar') { el.checked ? estado.excluidos.delete(id) : estado.excluidos.add(id); }
  else if (accion === 'revisar') { estado.confirmando = true; estado.informeEnvio = null; }
  else if (accion === 'cancelar') estado.confirmando = false;
  else if (accion === 'enviar') {
    const { r } = calcular();
    const sel = r.listos.filter((c) => !estado.excluidos.has(c.id));
    const cuando = ahora();
    sel.forEach((c) => estado.enviados.push({ id: c.id, cuando }));
    estado.confirmando = false;
    estado.aviso = `Demostración: ${plural(sel.length, 'correo marcado', 'correos marcados')} como enviados. No ha salido ningún correo real.`;
  } else if (accion === 'dividir') {
    const { r } = calcular();
    const c = r.clientes.find((x) => x.id === id);
    const nombres = demo.trabajadores[c.porDividir.origen] ?? [];
    nombres.forEach((n) => estado.nominas.push({
      ruta: `${c.porDividir.destino}/${n} nom ${dosCifras(estado.mes)}.pdf`, bytes: 105 * 1024, modificado: Date.now(),
    }));
    estado.aviso = `${c.id}: PDF dividido en ${plural(nombres.length, 'nómina individual', 'nóminas individuales')} en la carpeta ${c.porDividir.destino}.`;
  } else if (accion === 'no-enviar') {
    const { r } = calcular();
    const n = r.nuevas.nominas[Number(el.dataset.i)];
    estado.tabla.push([n.alias, null, null, 'NADA', 'Añadida desde la app: no se le envía', null]);
    estado.aviso = `${n.alias} añadida al maestro como "no se le envía".`;
  } else return;
  dibujar();
});

document.addEventListener('submit', (ev) => {
  if (estado.modo === 'real') { ev.preventDefault(); return; }
  const ft = ev.target.closest('form[data-accion="alta-trabajador"]');
  if (ft) {
    ev.preventDefault();
    const { r } = calcular();
    const t = r.nuevas.trabajadores[Number(ft.dataset.i)];
    const email = String(new FormData(ft).get('email')).trim();
    estado.errores = {};
    if (!emailOk(email)) estado.errores[`trab-${ft.dataset.i}`] = 'Escribe un correo válido, por ejemplo nombre@correo.es.';
    else {
      estado.tablaTrab.push([t.empresa, t.nombre, email]);
      estado.aviso = `Correo de ${t.nombre} guardado en la hoja Trabajadores.`;
    }
    dibujar();
    return;
  }
  const f = ev.target.closest('form[data-accion="alta"]');
  if (!f) return;
  ev.preventDefault();
  const i = f.dataset.i;
  const d = new FormData(f);
  const alias = String(d.get('alias')).trim();
  const email = String(d.get('email')).trim();
  const razon = String(d.get('razon'));
  estado.errores = {};
  if (!alias) estado.errores[`nueva-${i}`] = 'Escribe el alias con el que aparece en el nombre de la nómina.';
  else if (!emailOk(email)) estado.errores[`nueva-${i}`] = 'Escribe un correo válido, por ejemplo nombre@empresa.es.';
  else {
    estado.tabla.push([alias, razon || null, email, razon ? 'AMBAS' : 'NOMINA', 'Añadida desde la app', d.get('indiv') ? 'SI' : null]);
    estado.aviso = `${alias} añadida al maestro con el correo ${email}.`;
  }
  dibujar();
});

arrancar();
