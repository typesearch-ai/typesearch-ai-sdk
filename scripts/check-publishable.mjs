// Antes de publicar: ninguna dependencia puede apuntar a una carpeta local (`file:`). En el repo de trabajo
// typesearch-js se usa por ruta hasta que esté en npm; al publicar va "^0.1.0" (ver PUBLICAR.md).
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const local = Object.entries({ ...pkg.dependencies, ...pkg.peerDependencies }).filter(([, v]) => String(v).startsWith('file:'));
if (local.length) {
  console.error(`Local dependencies cannot be published: ${local.map(([k, v]) => `${k}@${v}`).join(', ')}. Use the npm version.`);
  process.exit(1);
}
