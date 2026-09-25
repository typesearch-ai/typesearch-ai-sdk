// Lo que comprueban las dos pruebas de humo: las herramientas se arman sin clave y, al llamarlas, buscan
// en una API mínima con la clave y devuelven la salida compacta.
import http from 'node:http';

export async function check({ newsSearch, getContents, findSimilar }) {
  const bodies = [];
  const server = http.createServer(async (req, res) => {
    let text = '';
    for await (const c of req) text += c;
    bodies.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(text) });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'req_smoke',
        mode: 'fast',
        results: [{ url: 'https://diarioejemplo.example/a', title: 'Una nota', source: 'Diario Ejemplo', published_at: null, snippet: null, score: 0.9, highlights: [], found_in: 'index' }],
        near_misses: [],
        warnings: [],
        incomplete: false,
        cached_at: null,
        usage: { cost_usd: 0 },
      }),
    );
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const baseURL = `http://127.0.0.1:${server.address().port}`;
    for (const make of [getContents, findSimilar]) if (typeof make().execute !== 'function') throw new Error('tool');
    const tool = newsSearch({ apiKey: 'ts_test_smoke', baseURL });
    const out = await tool.execute({ query: 'el dólar' }, { toolCallId: 'c', messages: [] });
    if (out.results[0].title !== 'Una nota' || bodies[0].auth !== 'Bearer ts_test_smoke' || bodies[0].body.mode !== 'fast') throw new Error(JSON.stringify({ out, bodies }));
    const text = await tool.toModelOutput({ toolCallId: 'c', input: {}, output: out });
    if (!text.value.startsWith('1 result for "el dólar" · fast')) throw new Error(text.value);
  } finally {
    server.close();
  }
}
