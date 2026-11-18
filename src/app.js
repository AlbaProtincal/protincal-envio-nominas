// Pantalla del pre-chequeo. Dibuja lo que decide el motor; no decide nada por su cuenta.
// De momento trabaja con datos de demostración: la lectura de OneDrive y el envío real
// se conectan cuando la app esté registrada en Microsoft 365.
import { leerMaestro, prechequeo, MESES, dosCifras } from './motor.js';
import { demo } from './demo.js';

const estado = {
  mes: demo.mes, anio: demo.anio,
  tabla: demo.maestro.map((f) => [...f]),
  nominas: [...demo.nominas], rnt: [...demo.rnt], rlc: [...demo.rlc],
  enviados: [...demo.enviados],
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
  const { filas, errores } = leerMaestro(estado.tabla);
  const r = prechequeo({
    mes: estado.mes, anio: estado.anio, maestro: filas,
    nominas: estado.nominas, rnt: estado.rnt, rlc: estado.rlc,
    yaEnviados: estado.enviados.map((e) => e.id),
  });
  return { r, erroresMaestro: errores };
}

function textoCorreo(c) {
  const que = c.recibe === 'AMBAS' ? 'las nóminas y los seguros sociales' : c.recibe === 'SS' ? 'los seguros sociales' : 'las nóminas';
  return `Buenos días,\n\nAdjunto ${que} del mes en curso.\n\nMuchas gracias, un saludo.`;
}

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

function dibujar() {
  const { r, erroresMaestro } = calcular();
  const seleccion = r.listos.filter((c) => !estado.excluidos.has(c.id));
  const porDividir = r.clientes.filter((c) => c.porDividir && c.estado === 'PENDIENTE');
  const pendientes = r.pendientes.filter((c) => !c.porDividir);
  const segurosSueltos = r.nuevas.seguros;
  const nNuevas = r.nuevas.nominas.length + (r.nuevas.nominas.length ? 0 : segurosSueltos.length);
  const bloqueos = nNuevas + porDividir.length + r.incidencias.length + erroresMaestro.length;
  const ss = r.periodoSS;

  const resumen = [
    ['#listos', r.listos.length, 'Listos', 'ok'],
    ['#antes', bloqueos, 'Requieren tu atención', bloqueos ? 'mal' : ''],
    ['#pendientes', pendientes.length, 'Pendientes de documentos', pendientes.length ? 'ojo' : ''],
    ['#enviados', r.yaEnviados.length, 'Ya enviados', ''],
  ].map(([h, n, t, tono]) => `<a class="tile ${tono}" href="${h}"><span class="n">${n}</span><span class="t">${t}</span></a>`).join('');

  let antes = '';
  if (r.nuevas.nominas.length || segurosSueltos.length) {
    antes += `<div class="bloque"><h3>Empresas nuevas</h3>
      <p class="ayuda">Hay documentos de empresas que no están en el maestro. No se envían a nadie hasta que indiques el correo.</p>
      ${r.nuevas.nominas.map((n, i) => formularioNueva(n, i, segurosSueltos)).join('')}
      ${!r.nuevas.nominas.length ? segurosSueltos.map((s) => `<p class="nota">Seguros sociales sin cliente: <strong>${esc(s.razon)}</strong> (${s.rnt.length} RNT, ${s.rlc.length} RLC). Falta su nómina o su fila en el maestro.</p>`).join('') : ''}
    </div>`;
  }
  if (porDividir.length) {
    antes += `<div class="bloque"><h3>Nóminas por dividir</h3>
      <p class="ayuda">Estos clientes reciben una nómina por trabajador. Hay que dividir el PDF conjunto antes de enviar.</p>
      <ul class="lista">${porDividir.map((c) => filaCliente(c, { extra: `<button class="b prim" data-accion="dividir" data-id="${esc(c.id)}">Dividir nómina</button>` })).join('')}</ul></div>`;
  }
  if (r.incidencias.length || erroresMaestro.length) {
    antes += `<div class="bloque"><h3>Incidencias</h3>
      <ul class="lista">${r.incidencias.map((c) => filaCliente(c, { extra: `<span class="pil mal">${esc(c.avisos[0] ?? 'Revisar')}</span>` })).join('')}</ul>
      ${erroresMaestro.map((e) => `<p class="nota">Maestro, fila ${e.fila}: ${esc(e.detalle)}</p>`).join('')}</div>`;
  }
  if (r.nuevas.sinRenombrar.length || r.nuevas.otros.length || r.ambiguos.length) {
    antes += `<div class="bloque"><h3>Ficheros sin dueño</h3><ul class="ficheros suelto">
      ${r.nuevas.sinRenombrar.map((h) => `<li><span class="eti">${esc(h.carpeta)}</span> <code>${esc(h.ruta)}</code> <span class="tenue">sin renombrar por razón social</span></li>`).join('')}
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
      <p class="eti">Texto del correo</p><pre class="cuerpo">${esc(textoCorreo(seleccion[0]))}</pre>
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

  document.getElementById('app').innerHTML = `
    <header class="top">
      <div><p class="marca">PROTINCAL · Laboral</p><h1>Envío de nóminas</h1></div>
      <div class="periodo"><span class="mes">${MESES[estado.mes - 1]} ${estado.anio}</span>
        <span class="tenue">Seguros sociales de ${dosCifras(ss.mes)}/${ss.anio}</span></div>
    </header>
    <p class="demo" role="note">Demostración con datos inventados. No lee tus carpetas ni envía ningún correo.</p>
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
    <details class="sec plegada"><summary>No se les envía (${r.noSeEnvia.length})</summary>
      <ul class="lista">${r.noSeEnvia.map((c) => filaCliente(c, { extra: '<span class="pil">Maestro: NADA</span>' })).join('')}</ul></details>
    <footer class="pie">Carpetas: <code>${esc(r.carpetas.nominas)}</code> · <code>${esc(r.carpetas.rnt)}</code> · <code>${esc(r.carpetas.rlc)}</code></footer>`;
}

function ahora() {
  const d = new Date();
  return `${dosCifras(d.getDate())}/${dosCifras(d.getMonth() + 1)}/${d.getFullYear()} ${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`;
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-accion]');
  if (!el || el.tagName === 'FORM') return;
  const { accion, id } = el.dataset;
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

dibujar();
