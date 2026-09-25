// Prueba de humo del paquete construido, como ESM: node test/smoke/esm.mjs
import { findSimilar, getContents, newsSearch, VERSION } from '../../dist/esm/index.js';
import { check } from './check.mjs';

await check({ newsSearch, getContents, findSimilar });
console.log(`ok: @typesearch/ai-sdk ${VERSION} (ESM) en Node ${process.version}`);
