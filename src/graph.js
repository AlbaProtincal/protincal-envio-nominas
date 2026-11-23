// Conexión con Microsoft 365 (Microsoft Graph): inicio de sesión, OneDrive, Excel y correo.
// Escribe solo lo que la app confirma: PDF nuevos (sin sobrescribir), carpetas y el estado de contabilidad.
import { CONFIG } from './config.js?v=mwsw0c2u';

const GRAPH = 'https://graph.microsoft.com/v1.0';
let pca = null;
let cuenta = null;

/** Prepara el inicio de sesión y recoge la vuelta de Microsoft si venimos de iniciar sesión. */
export async function iniciar() {
  if (!window.msal) throw new Error('No se ha cargado la librería de inicio de sesión de Microsoft.');
  pca = new window.msal.PublicClientApplication({
    auth: {
      clientId: CONFIG.clientId,
      authority: `https://login.microsoftonline.com/${CONFIG.tenantId}`,
      redirectUri: CONFIG.redirectUri,
    },
    // La sesión se guarda solo en esta pestaña: al cerrarla hay que volver a entrar.
    cache: { cacheLocation: 'sessionStorage' },
  });
  await pca.initialize();
  const vuelta = await pca.handleRedirectPromise();
  cuenta = vuelta?.account ?? pca.getAllAccounts()[0] ?? null;
  return cuenta ? { nombre: cuenta.name ?? '', correo: cuenta.username } : null;
}

export function entrar() {
  return pca.loginRedirect({ scopes: CONFIG.permisos, prompt: 'select_account' });
}

export function salir() {
  return pca.logoutRedirect({ account: cuenta, postLogoutRedirectUri: CONFIG.redirectUri });
}

async function token() {
  try {
    return (await pca.acquireTokenSilent({ scopes: CONFIG.permisos, account: cuenta })).accessToken;
  } catch {
    await pca.acquireTokenRedirect({ scopes: CONFIG.permisos, account: cuenta });
    throw new Error('Hay que volver a iniciar sesión.');
  }
}

export class ErrorGraph extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado; }
}

async function pedir(url, { metodo = 'GET', cuerpo, tipo, extra = {} } = {}) {
  const cabeceras = { Authorization: `Bearer ${await token()}`, ...extra };
  let body;
  if (cuerpo instanceof Uint8Array) { body = cuerpo; cabeceras['Content-Type'] = tipo ?? 'application/octet-stream'; }
  else if (cuerpo !== undefined) { body = JSON.stringify(cuerpo); cabeceras['Content-Type'] = 'application/json'; }
  const r = await fetch(url.startsWith('http') ? url : GRAPH + url, { method: metodo, headers: cabeceras, body });
  if (!r.ok) {
    let detalle = '';
    try { detalle = (await r.json()).error?.message ?? ''; } catch { /* sin detalle */ }
    throw new ErrorGraph(r.status, detalle || `Microsoft respondió ${r.status}`);
  }
  if (r.status === 204 || r.status === 202) return null;
  const texto = await r.text();
  return texto ? JSON.parse(texto) : null;
}

const ruta = (p) => p.split('/').map(encodeURIComponent).join('/');

/** Localiza la carpeta base. Si es un acceso directo a una carpeta compartida, sigue el enlace. */
export async function carpetaBase() {
  const it = await pedir(`/me/drive/root:/${ruta(CONFIG.carpetaBase)}`);
  const real = it.remoteItem ?? it;
  return { drive: real.parentReference.driveId, id: real.id };
}

/** Ficheros y carpetas de una ruta dentro de la carpeta base. Devuelve null si la ruta no existe. */
export async function listar(base, subruta) {
  const elementos = [];
  let url = `/drives/${base.drive}/items/${base.id}:/${ruta(subruta)}:/children?$top=200`;
  try {
    while (url) {
      const pag = await pedir(url);
      elementos.push(...pag.value);
      url = pag['@odata.nextLink'] ?? null;
    }
  } catch (e) {
    if (e instanceof ErrorGraph && e.estado === 404) return null;
    throw e;
  }
  return elementos.map((it) => ({
    nombre: it.name,
    esCarpeta: Boolean(it.folder),
    bytes: it.size ?? 0,
    modificado: Date.parse(it.lastModifiedDateTime) || 0,
    id: it.id,
    descarga: it['@microsoft.graph.downloadUrl'] ?? null,
  }));
}

/** Contenido de un fichero, por su enlace de descarga temporal. */
export async function descargar(fichero) {
  if (!fichero.descarga) throw new Error(`Sin enlace de descarga para ${fichero.nombre}`);
  const r = await fetch(fichero.descarga);
  if (!r.ok) throw new Error(`No se pudo descargar ${fichero.nombre} (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

/**
 * Sube un fichero nuevo a una carpeta. Si ya existe uno con ese nombre, falla: nunca sobrescribe.
 * Válido para ficheros de hasta 4 MB (los PDF de nóminas y seguros sociales pesan unos cientos de KB).
 */
export async function subir(base, subrutaCarpeta, nombre, bytes, tipo = 'application/pdf') {
  if (bytes.length > 4 * 1024 * 1024) throw new Error(`${nombre} supera 4 MB`);
  const url = `/drives/${base.drive}/items/${base.id}:/${ruta(`${subrutaCarpeta}/${nombre}`)}:/content` +
    '?@microsoft.graph.conflictBehavior=fail';
  return pedir(url, { metodo: 'PUT', cuerpo: bytes, tipo });
}

/** Devuelve el id de una subcarpeta, creándola si no existe. */
export async function asegurarCarpeta(base, subrutaPadre, nombre) {
  const existentes = (await listar(base, subrutaPadre)) ?? [];
  const ya = existentes.find((f) => f.esCarpeta && f.nombre.toLowerCase() === nombre.toLowerCase());
  if (ya) return ya.id;
  const it = await pedir(`/drives/${base.drive}/items/${base.id}:/${ruta(subrutaPadre)}:/children`, {
    metodo: 'POST', cuerpo: { name: nombre, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
  });
  return it.id;
}

/** Mueve un fichero a otra carpeta (por id). No borra nada. */
export async function mover(base, idFichero, idCarpeta) {
  return pedir(`/drives/${base.drive}/items/${idFichero}`, {
    metodo: 'PATCH', cuerpo: { parentReference: { id: idCarpeta } },
  });
}

/**
 * Correos enviados por el usuario desde una fecha, estén en la carpeta que estén
 * (en PROTINCAL los enviados se archivan en carpetas por cliente): destinatarios y asunto.
 */
export async function enviadosDesde(fechaIso, maximo = 5000) {
  const yo = String(cuenta?.username ?? '').toLowerCase();
  const filtro = `sentDateTime ge ${fechaIso} and isDraft eq false` +
    (yo ? ` and from/emailAddress/address eq '${yo.replace(/'/g, "''")}'` : '');
  const salida = [];
  let leidos = 0;
  let url = `/me/messages?$filter=${encodeURIComponent(filtro)}` +
    '&$select=subject,toRecipients,ccRecipients,bccRecipients,sentDateTime&$top=100';
  while (url && leidos < maximo) {
    const pag = await pedir(url);
    for (const m of pag.value) {
      leidos += 1;
      for (const d of [...(m.toRecipients ?? []), ...(m.ccRecipients ?? []), ...(m.bccRecipients ?? [])]) {
        salida.push({ para: d.emailAddress?.address ?? '', asunto: m.subject ?? '', cuando: m.sentDateTime });
      }
    }
    url = pag['@odata.nextLink'] ?? null;
  }
  return salida;
}

/**
 * Lee un JSON de OneDrive junto con su eTag (para guardar sin pisar cambios de otro).
 * @returns {{ datos: object|null, etag: string|null }}  datos null si no existe
 */
export async function leerJson(base, subruta) {
  let it;
  try {
    it = await pedir(`/drives/${base.drive}/items/${base.id}:/${ruta(subruta)}`);
  } catch (e) {
    if (e instanceof ErrorGraph && e.estado === 404) return { datos: null, etag: null };
    throw e;
  }
  const r = await fetch(it['@microsoft.graph.downloadUrl']);
  if (!r.ok) throw new Error(`No se pudo leer ${subruta} (${r.status})`);
  return { datos: await r.json(), etag: it.eTag };
}

/**
 * Guarda un JSON en OneDrive. Con etag, solo si nadie lo ha cambiado desde que se leyó (si no, error 412).
 * Sin etag, solo si no existe todavía.
 */
export async function guardarJson(base, subruta, datos, etag) {
  const bytes = new TextEncoder().encode(JSON.stringify(datos, null, 2));
  const url = `/drives/${base.drive}/items/${base.id}:/${ruta(subruta)}:/content` +
    (etag ? '' : '?@microsoft.graph.conflictBehavior=fail');
  const it = await pedir(url, { metodo: 'PUT', cuerpo: bytes, tipo: 'application/json', extra: etag ? { 'If-Match': etag } : {} });
  return it.eTag;
}

/** Descarga un fichero de OneDrive por su id. */
export async function descargarPorId(base, id) {
  // Sin $select: con $select Graph no devuelve el enlace de descarga.
  const it = await pedir(`/drives/${base.drive}/items/${id}`);
  return descargar({ nombre: it.name, descarga: it['@microsoft.graph.downloadUrl'] });
}

function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// /me/sendMail admite unos 4 MB por petición; en base64 los adjuntos crecen un 33 %.
export const MAX_TOTAL = 2.8 * 1024 * 1024;

/**
 * Envía un correo desde el buzón de la sesión con /me/sendMail (solo necesita el permiso Mail.Send)
 * y lo guarda en Enviados. El logo de la firma va como adjunto en línea.
 * @param {{ para: string, asunto: string, html: string, adjuntos: Array<{nombre, bytes}>, logo?: {bytes, cid} }} c
 */
export async function enviarCorreo({ para, asunto, html, adjuntos, logo }) {
  const total = adjuntos.reduce((n, a) => n + a.bytes.length, 0) + (logo?.bytes.length ?? 0);
  if (total > MAX_TOTAL) throw new Error(`Los adjuntos pesan ${(total / 1048576).toFixed(1)} MB, más de lo que admite el envío automático: envíalo a mano`);
  const fichero = (nombre, tipo, bytes, extra = {}) => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: nombre, contentType: tipo, contentBytes: base64(bytes), ...extra });
  await pedir('/me/sendMail', { metodo: 'POST', cuerpo: {
    message: {
      subject: asunto,
      body: { contentType: 'HTML', content: html },
      toRecipients: [{ emailAddress: { address: para } }],
      attachments: [
        ...(logo ? [fichero('logo-protincal.jpg', 'image/jpeg', logo.bytes, { isInline: true, contentId: logo.cid })] : []),
        ...adjuntos.map((a) => fichero(a.nombre, 'application/pdf', a.bytes)),
      ],
    },
    saveToSentItems: true,
  } });
}

/**
 * Busca en Enviados un correo por asunto y destinatario y devuelve los nombres de sus adjuntos (sin el logo).
 * @returns {Promise<string[]|null>} null si no aparece
 */
export async function buscarEnviado(asunto, para, desdeIso) {
  const filtro = `sentDateTime ge ${desdeIso} and subject eq '${asunto.replace(/'/g, "''")}'`;
  const pag = await pedir(`/me/mailFolders/sentitems/messages?$filter=${encodeURIComponent(filtro)}` +
    '&$select=subject,toRecipients,sentDateTime&$expand=attachments($select=name,isInline)&$top=10');
  const m = (pag.value ?? []).find((x) => (x.toRecipients ?? []).some((d) => d.emailAddress?.address?.toLowerCase() === para.toLowerCase()));
  return m ? (m.attachments ?? []).filter((a) => !a.isInline).map((a) => a.name) : null;
}
