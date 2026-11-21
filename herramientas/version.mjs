// Pone ?v=<versión> en todas las importaciones locales para que el navegador no use módulos viejos
// de su caché tras publicar. Ejecutar antes de cada commit que cambie src/:
//   node herramientas/version.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const v = Date.now().toString(36);
const ficheros = ['index.html', ...readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => `src/${f}`)];
for (const f of ficheros) {
  const antes = readFileSync(f, 'utf8');
  const despues = antes
    .replace(/((?:from|import)\s*\(?\s*['"])(\.{1,2}\/[^'"?]+\.(?:m?js))(\?v=[\w]+)?(['"])/g, `$1$2?v=${v}$4`)
    .replace(/(src="src\/app\.js)(\?v=[\w]+)?(")/, `$1?v=${v}$3`);
  if (despues !== antes) writeFileSync(f, despues);
}
console.log('versión', v);
