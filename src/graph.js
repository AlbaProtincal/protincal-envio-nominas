// Conexión con Microsoft 365 (Microsoft Graph): inicio de sesión, OneDrive, Excel y correo.
// Esta versión solo LEE. No escribe ficheros, no modifica el maestro y no envía correos.
import { CONFIG } from './config.js';

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

async function pedir(url) {
  const r = await fetch(url.startsWith('http') ? url : GRAPH + url, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  if (!r.ok) {
    let detalle = '';
    try { detalle = (await r.json()).error?.message ?? ''; } catch { /* sin detalle */ }
    throw new ErrorGraph(r.status, detalle || `Microsoft respondió ${r.status}`);
  }
  return r.json();
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

/** Valores de una hoja de un Excel de OneDrive. Devuelve [] si la hoja no existe. */
export async function leerHoja(base, subruta, hoja) {
  const url = `/drives/${base.drive}/items/${base.id}:/${ruta(subruta)}:` +
    `/workbook/worksheets('${encodeURIComponent(hoja)}')/usedRange(valuesOnly=true)?$select=values`;
  try {
    const r = await pedir(url);
    // Excel devuelve "" en las celdas vacías; el motor espera null.
    return (r.values ?? []).map((f) => f.map((v) => (v === '' ? null : v)));
  } catch (e) {
    if (e instanceof ErrorGraph && e.estado === 404) return [];
    throw e;
  }
}

/** Correos de Elementos enviados desde una fecha: destinatario y asunto de cada uno. */
export async function enviadosDesde(fechaIso, maximo = 2000) {
  const salida = [];
  let url = `/me/mailFolders/sentitems/messages?$filter=${encodeURIComponent(`sentDateTime ge ${fechaIso}`)}` +
    '&$orderby=sentDateTime%20desc&$select=subject,toRecipients,sentDateTime&$top=100';
  while (url && salida.length < maximo) {
    const pag = await pedir(url);
    for (const m of pag.value) {
      for (const d of m.toRecipients ?? []) {
        salida.push({ para: d.emailAddress?.address ?? '', asunto: m.subject ?? '', cuando: m.sentDateTime });
      }
    }
    url = pag['@odata.nextLink'] ?? null;
  }
  return salida;
}
