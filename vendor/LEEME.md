# Librerías de terceros

Copias sin modificar, tomadas de npm, para que la página no dependa de ningún servidor externo:

| Fichero | Paquete | Versión | Para qué |
|---|---|---|---|
| `msal-browser.min.js` | `@azure/msal-browser` (Microsoft, rama LTS) | 4.30.0 | Inicio de sesión con Microsoft |
| `pdf.min.mjs`, `pdf.worker.min.mjs` | `pdfjs-dist` (Mozilla) | 6.5.438 | Leer el texto de los PDF de nóminas |
| `pdf-lib.esm.min.js` | `pdf-lib` | 1.17.1 | Dividir los PDF de nóminas |

Para actualizarlas: `npm install` y volver a copiar desde `node_modules`.
