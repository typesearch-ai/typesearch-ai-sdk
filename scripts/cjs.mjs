// Después de compilar a CommonJS: dist/cjs lleva su propio package.json para que Node lo lea como
// CommonJS aunque el paquete sea "type": "module".
import fs from 'node:fs';

fs.writeFileSync(new URL('../dist/cjs/package.json', import.meta.url), '{ "type": "commonjs" }\n');
