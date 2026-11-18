// Cuerpo del correo: texto + firma de PROTINCAL (texto, logo y aviso legal).
// Los correos enviados por Microsoft Graph no llevan la firma de Outlook, así que se añade aquí.
// El logo viaja incrustado en el mensaje (adjunto en línea con este identificador), no como enlace.

export const CID_LOGO = 'logo-protincal';

export const FIRMA = ['Muchas gracias, un saludo.', 'Alba Jurado - Protincal Asesores.'];

export const AVISO_LEGAL = [
  'Este mensaje se dirige exclusivamente a su destinatario/a y puede contener información privilegiada o confidencial. ' +
  'Si no es Vd. el/la destinatario/a, queda notificado de que la utilización, divulgación y/o copia sin autorización, ' +
  'está prohibida en virtud de la legislación vigente. Si ha recibido este mensaje por error, rogamos que nos lo comunique ' +
  'inmediatamente por esta misma vía y proceda a su destrucción.',
  'Conforme a lo establecido en la normativa vigente de Protección de Datos de Carácter Personal, se le informa de que los ' +
  'datos personales proporcionados SON CONFIDENCIALES y forman parte de los ficheros tratados por PROTINCAL SLP., y con la ' +
  'finalidad exclusiva de agilizar nuestros servicios profesionales y poder desarrollar las relaciones contractuales. Vd. puede ' +
  'ejercer sus derechos de acceso, rectificación, limitación de tratamiento, supresión, portabilidad así como del consentimiento ' +
  'prestado para el tratamiento de los mismos y oposición, dirigiéndose por escrito al responsable del fichero, PROTINCAL SLP. ' +
  'situado en la AV. DAROCA nº 27, Bajo A, 28017 MADRID mediante escrito y documento acreditativo de su identidad o bien a la ' +
  'dirección de correo electrónico gestion@protincal.es',
];

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * HTML del correo. Estilos en línea y sin clases, que es lo que respetan los programas de correo.
 * @param {string} texto     Texto del mensaje (los saltos de línea dobles separan párrafos)
 * @param {string} [srcLogo] Origen de la imagen: `cid:…` en el correo real; una ruta en la vista previa
 */
export function cuerpoHtml(texto, srcLogo = `cid:${CID_LOGO}`) {
  const base = 'font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000000;margin:0 0 12pt 0;';
  const parrafos = String(texto).split(/\n{2,}/).map((p) => `<p style="${base}">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  return `<div>${parrafos}` +
    `<p style="${base}margin-bottom:6pt;">${FIRMA.map(esc).join('<br>')}</p>` +
    `<p style="margin:0 0 12pt 0;"><img src="${esc(srcLogo)}" alt="PROTINCAL Asesores" width="210" style="width:210px;height:auto;border:0;"></p>` +
    AVISO_LEGAL.map((p) => `<p style="font-family:Calibri,Arial,sans-serif;font-size:8pt;line-height:1.5;color:#595959;margin:0 0 2pt 0;text-align:justify;">${esc(p)}</p>`).join('') +
    '</div>';
}
