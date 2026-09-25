/*
 * Contra la API de verdad: corre sólo con `npm run test:live` y TYPESEARCH_API_KEY en el entorno (con
 * `npm test` se saltea aunque haya clave, para no gastar sin querer). Gasta muy poco: una búsqueda `fast`
 * de 3 resultados, el contenido de una URL y un `similar`. TYPESEARCH_BASE_URL apunta a otra API.
 */
import { describe, expect, test } from 'vitest';
import type { Tool } from 'ai';
import { findSimilar, getContents, newsSearch } from '../src/index.ts';

const key = process.env.TYPESEARCH_LIVE === '1' ? process.env.TYPESEARCH_API_KEY : undefined;
const opts = { toolCallId: 'live', messages: [], context: {} } as never;
const exec = async <I, O>(t: Tool<I, O>, input: I) => (await t.execute!(input, opts)) as O;

describe.skipIf(!key)('live API', () => {
  let url: string | undefined;

  test('newsSearch', async () => {
    const t = newsSearch({ apiKey: key, maxResults: 3 });
    const out = await exec(t, { query: 'inflation', days: 7 });
    expect(out.mode).toBe('fast');
    expect(out.results.length).toBeLessThanOrEqual(3);
    for (const r of out.results) expect(r.url).toMatch(/^https?:\/\//);
    url = out.results[0]?.url;
    const text = await t.toModelOutput!({ toolCallId: 'live', input: { query: 'inflation' }, output: out });
    expect(text.type).toBe('text');
  }, 60_000);

  test('getContents and findSimilar on the first result', async () => {
    if (!url) return;
    const pages = await exec(getContents({ apiKey: key }), { urls: [url] });
    expect(pages.results[0]!.url).toBe(url);
    const similar = await exec(findSimilar({ apiKey: key, maxResults: 3 }), { url });
    expect(similar.mode).toBe('fast');
  }, 90_000);
});
