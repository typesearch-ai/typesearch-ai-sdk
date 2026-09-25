// Prueba de humo del paquete construido, como CommonJS: node test/smoke/cjs.cjs
const { findSimilar, getContents, newsSearch, VERSION } = require('../../dist/cjs/index.js');

(async () => {
  const { check } = await import('./check.mjs');
  await check({ newsSearch, getContents, findSimilar });
  console.log(`ok: @typesearch/ai-sdk ${VERSION} (CommonJS) en Node ${process.version}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
