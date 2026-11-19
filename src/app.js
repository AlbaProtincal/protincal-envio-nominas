// Pantalla del pre-chequeo. Dibuja lo que decide el motor; no decide nada por su cuenta.
// De momento trabaja con datos de demostración: la lectura de OneDrive y el envío real
// se conectan cuando la app esté registrada en Microsoft 365.
import { leerMaestro, prechequeo, MESES, dosCifras } from './motor.js';
import { demo } from './demo.js';
import { cuerpoHtml } from './correo.js';
import * as graph from './graph.js';
import { cargarMes, prepararSS, ejecutarSS } from './datos.js';

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

function dibujarContenido() {
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
    (r.nuevas.sinRenombrar.length ? 1 : 0);
  const ss = r.periodoSS;

  const resumen = [
    ['#listos', r.listos.length, 'Listos', 'ok'],
    ['#antes', bloqueos, 'Requieren tu atención', bloqueos ? 'mal' : ''],
    ['#pendientes', pendientes.length, 'Pendientes de documentos', pendientes.length ? 'ojo' : ''],
    ['#enviados', r.yaEnviados.length, 'Ya enviados', ''],
  ].map(([h, n, t, tono]) => `<a class="tile ${tono}" href="${h}"><span class="n">${n}</span><span class="t">${t}</span></a>`).join('');

  let antes = '';
  const conjuntosSS = r.nuevas.sinRenombrar;
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
      <ul class="lista">${porDividir.map((c) => filaCliente(c, { extra: `<button class="b prim" data-accion="dividir" data-id="${esc(c.id)}">Dividir nómina</button>` })).join('')}</ul></div>`;
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
      <div class="botones"><button class="b prim" data-accion="enviar">Enviar ${plural(seleccion.length, 'correo', 'correos')}</button>
      <button class="b" data-accion="cancelar">Volver</button></div></div>`;
  } else {
    listos = r.listos.length
      ? `<ul class="lista">${r.listos.map((c) => filaCliente(c, { marcar: true })).join('')}</ul>
         <div class="barra"><span>${seleccion.length} de ${r.listos.length} seleccionados</span>
         <button class="b prim" data-accion="revisar" ${seleccion.length ? '' : 'disabled'}>Revisar y enviar</button></div>`
      : '<p class="vacio">No hay ningún cliente listo para enviar.</p>';
  }

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
      <div><p class="marca">PROTINCAL · Laboral</p><h1>Envío de nóminas</h1></div>
      <div class="periodo"><span class="mes">${MESES[estado.mes - 1]} ${estado.anio}</span>
        <span class="tenue">Seguros sociales de ${dosCifras(ss.mes)}/${ss.anio}</span></div>
    </header>
    ${sesion}
    ${real
      ? '<p class="demo" role="note">Versión de prueba en solo lectura: lee tus carpetas y tu correo, pero no envía, no divide y no modifica el maestro.</p>'
      : '<p class="demo" role="note">Demostración con datos inventados. Inicia sesión para ver tus carpetas reales.</p>'}
    ${estado.errorCarga ? `<p class="error" role="alert">${esc(estado.errorCarga)}</p>` : ''}
    ${estado.avisosCarga.map((a) => `<p class="nota">${esc(a)}</p>`).join('')}`;
  if (estado.cargando) {
    document.getElementById('app').innerHTML = `${cabecera}<p class="cargando" role="status">${esc(estado.cargando)}</p>`;
    return;
  }
  document.getElementById('app').innerHTML = `${cabecera}
    ${estado.aviso ? `<p class="hecho" role="status">${esc(estado.aviso)}</p>` : ''}
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
  const sel = '[data-accion="dividir"], [data-accion="enviar"], [data-accion="no-enviar"], form.nueva button, form.nueva input, form.nueva select';
  document.querySelectorAll(sel).forEach((el) => { el.disabled = true; el.title = 'Desactivado en la versión de prueba'; });
}

async function cargar(mes, anio, { probarAnterior = false } = {}) {
  estado.ss = null;
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
  if (accion === 'entrar') { graph.entrar(); return; }
  if (accion === 'salir') { graph.salir(); return; }
  if (accion === 'cargar') {
    cargar(Number(document.getElementById('sel-mes').value), Number(document.getElementById('sel-anio').value));
    return;
  }
  // Solo lectura: en modo real no se ejecuta nada que envíe o modifique.
  if (estado.modo === 'real' && ['enviar', 'dividir', 'no-enviar'].includes(accion)) return;
  estado.aviso = null;
  if (accion === 'abrir') estado.abiertos.has(id) ? estado.abiertos.delete(id) : estado.abiertos.add(id);
  else if (accion === 'marcar') { el.checked ? estado.excluidos.delete(id) : estado.excluidos.add(id); }
  else if (accion === 'revisar') estado.confirmando = true;
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
