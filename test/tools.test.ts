import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { asSchema, type Tool } from 'ai';
import Typesearch, { RateLimitError } from 'typesearch-js';
import { findSimilar, getContents, newsSearch, VERSION } from '../src/index.ts';
import pkg from '../package.json' with { type: 'json' };
import { FakeApi, KEY, problem, searchResponse } from './fake-api.ts';

let api: FakeApi;

beforeAll(async () => {
  api = await new FakeApi().start();
});
afterAll(() => api.close());
afterEach(() => api.reset());

const opts = { toolCallId: 'call_1', messages: [], context: {} } as never;

/** Ejecuta una herramienta como lo hace el AI SDK: valida la entrada con su esquema y llama `execute`. */
async function run<I, O>(t: Tool<I, O>, input: unknown): Promise<O> {
  const parsed = await asSchema(t.inputSchema).validate!(input);
  if (!parsed.success) throw parsed.error;
  return (await t.execute!(parsed.value as I, opts)) as O;
}

async function modelText<I, O>(t: Tool<I, O>, input: I, output: O) {
  return t.toModelOutput!({ toolCallId: 'call_1', input, output } as never);
}

const props = (t: Tool) => {
  const s = asSchema(t.inputSchema).jsonSchema as { properties: Record<string, { type?: string; maxItems?: number }>; required?: string[] };
  return { names: Object.keys(s.properties), required: s.required ?? [], schema: s };
};

const base = { apiKey: KEY, baseURL: '' };
const cfg = () => ({ ...base, baseURL: api.url, maxRetries: 0 });

describe('newsSearch', () => {
  test('the model sees the MCP parameters, but not mode or max_results', () => {
    const { names, required } = props(newsSearch(cfg()));
    expect(names).toEqual(['query', 'days', 'published_after', 'published_before', 'include_domains', 'exclude_domains', 'countries', 'languages']);
    expect(required).toEqual(['query']);
    const t = newsSearch(cfg());
    expect(typeof t.description === 'string' && t.description.length).toBeGreaterThan(200);
    expect(t.description).toContain('Cite the link');
  });

  test('sends mode fast and 10 results by default, with the key and the user agent', async () => {
    const out = await run(newsSearch(cfg()), { query: 'el dólar' });
    expect(api.last.path).toBe('/v1/search');
    expect(api.last.body).toEqual({ query: 'el dólar', mode: 'fast', max_results: 10 });
    expect(api.last.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(api.last.headers['user-agent']).toBe(`typesearch-ai-sdk/${VERSION} typesearch-js/0.1.0`);
    expect(out.query).toBe('el dólar');
    expect(out.mode).toBe('fast');
    expect(out.results).toHaveLength(2);
  });

  test('passes what the model asks for', async () => {
    await run(newsSearch(cfg()), {
      query: 'lithium royalties',
      days: 3,
      include_domains: ['diarioejemplo.example'],
      exclude_domains: ['examplewire.example'],
      countries: ['AR', 'CL'],
      languages: ['es'],
    });
    expect(api.last.body).toEqual({
      query: 'lithium royalties',
      mode: 'fast',
      max_results: 10,
      days: 3,
      include_domains: ['diarioejemplo.example'],
      exclude_domains: ['examplewire.example'],
      countries: ['AR', 'CL'],
      languages: ['es'],
    });
    await run(newsSearch(cfg()), { query: 'lithium royalties', published_after: '2026-09-01', published_before: '2026-09-20T12:00:00Z' });
    expect(api.last.body).toMatchObject({ published_after: '2026-09-01', published_before: '2026-09-20T12:00:00Z' });
  });

  test('what the config fixes is hidden from the model and always applied', async () => {
    const t = newsSearch({ ...cfg(), mode: 'deep', maxResults: 5, countries: ['AR'], languages: ['es'], includeDomains: ['diarioejemplo.example'], highlights: true, timezone: 'Europe/Madrid' });
    expect(props(t).names).toEqual(['query', 'days', 'published_after', 'published_before', 'exclude_domains']);
    expect(t.description).toContain('Searches are limited to sources from AR; sources in es; only diarioejemplo.example.');
    await run(t, { query: 'inflación', countries: ['US'] });
    expect(api.last.body).toEqual({
      query: 'inflación',
      mode: 'deep',
      max_results: 5,
      include_domains: ['diarioejemplo.example'],
      countries: ['AR'],
      languages: ['es'],
      highlights: true,
      timezone: 'Europe/Madrid',
    });
  });

  test('days in the config is the window when the model asks for none', async () => {
    const t = newsSearch({ ...cfg(), days: 1 });
    await run(t, { query: 'el dólar' });
    expect(api.last.body.days).toBe(1);
    await run(t, { query: 'el dólar', days: 30 });
    expect(api.last.body.days).toBe(30);
    await run(t, { query: 'el dólar', published_after: '2026-09-01' });
    expect(api.last.body.days).toBeUndefined();
  });

  test('rejects bad input before calling the API', async () => {
    const t = newsSearch(cfg());
    await expect(run(t, { query: 'x' })).rejects.toThrow();
    await expect(run(t, { query: 'el dólar', days: 0 })).rejects.toThrow();
    await expect(run(t, { query: 'el dólar', published_after: 'yesterday' })).rejects.toThrow();
    await expect(run(t, { query: 'el dólar', include_domains: Array(21).fill('a.example') })).rejects.toThrow();
    expect(api.requests).toHaveLength(0);
    expect(() => newsSearch({ maxResults: 51 })).toThrow(RangeError);
  });

  test('compact output: no nulls, no empty lists, dates to the minute', async () => {
    const out = await run(newsSearch(cfg()), { query: 'el dólar' });
    expect(out.results[0]).toEqual({
      title: 'El dólar cerró estable por 1ª rueda',
      url: 'https://diarioejemplo.example/economia/nota-1',
      source: 'Diario Ejemplo',
      published_at: '2026-09-21T18:05Z',
      country: 'AR',
      language: 'es',
      snippet: 'La divisa se mantuvo sin cambios frente al cierre anterior.',
      score: 0.95,
    });
    expect(out.results[1]).toMatchObject({ source: 'Example Wire', found_in: 'discovery', highlights: ['The peso ended the session unchanged'] });
    expect(out.results[1]).not.toHaveProperty('country');
    expect(out).toEqual(expect.objectContaining({ cost_usd: 0.0014, request_id: 'req_fakeaisdk' }));
    expect(out).not.toHaveProperty('warnings');
    expect(out).not.toHaveProperty('near_misses');
  });

  test('the model reads compact text; json on request', async () => {
    const t = newsSearch(cfg());
    const out = await run(t, { query: 'el dólar' });
    const text = await modelText(t, { query: 'el dólar' }, out);
    expect(text).toEqual({ type: 'text', value: expect.stringContaining('2 results for "el dólar" · fast · US$0.0014') });
    const value = (text as { value: string }).value;
    expect(value).toContain('1. El dólar cerró estable por 1ª rueda\nDiario Ejemplo · 2026-09-21 18:05 UTC · AR/es\nhttps://diarioejemplo.example/economia/nota-1');
    expect(value).toContain('found beyond the index');
    expect(value).toContain('> The peso ended the session unchanged');
    expect(value.length).toBeLessThan(JSON.stringify(out).length);
    const json = await modelText(newsSearch({ ...cfg(), modelOutput: 'json' }), { query: 'el dólar' }, out);
    expect(json).toEqual({ type: 'json', value: out });
  });

  test('no results: results stays, with the closest articles', async () => {
    api.next({ status: 200, body: searchResponse({ found: false, total: 0, results: [], near_misses: [{ ...searchResponse().results[0], score: 0.31 }], warnings: [{ code: 'country_not_indexed', message: 'No source from XX.' }] }) });
    const t = newsSearch(cfg());
    const out = await run(t, { query: 'el dólar' });
    expect(out.results).toEqual([]);
    expect(out.near_misses).toHaveLength(1);
    const value = ((await modelText(t, { query: 'el dólar' }, out)) as { value: string }).value;
    expect(value).toContain('No results for "el dólar"');
    expect(value).toContain('Closest articles, which may not be about it:');
    expect(value).toContain('Note (country_not_indexed): No source from XX.');
  });

  test('cached and incomplete are said', async () => {
    api.next({ status: 200, body: searchResponse({ cached_at: '2026-09-25T10:00:00Z', incomplete: true }) });
    const t = newsSearch(cfg());
    const out = await run(t, { query: 'el dólar' });
    expect(out).toMatchObject({ cached: true, incomplete: true });
    const value = ((await modelText(t, { query: 'el dólar' }, out)) as { value: string }).value;
    expect(value).toContain('cached, free');
    expect(value).toContain('Incomplete:');
  });
});

describe('errors reach the model, readable, with the SDK error as cause', () => {
  test('invalid key', async () => {
    const e = await run(newsSearch({ ...cfg(), apiKey: 'ts_live_wrong' }), { query: 'el dólar' }).catch((x) => x);
    expect(e.message).toBe('typesearch error (invalid_api_key): The API key is not valid. [request req_fakeerr1]');
    expect(e.message).not.toContain('ts_live_wrong');
    expect(e.cause.status).toBe(401);
  });

  test('no credit, and rate limits with Retry-After', async () => {
    api.next({ status: 402, body: problem(402, 'insufficient_credits', 'No credit left.') });
    await expect(run(newsSearch(cfg()), { query: 'el dólar' })).rejects.toThrow('typesearch error (insufficient_credits): No credit left.');
    api.next({ status: 429, body: problem(429, 'rate_limited', 'Too many requests.'), headers: { 'retry-after': '7' } });
    const e = await run(newsSearch(cfg()), { query: 'el dólar' }).catch((x) => x);
    expect(e.message).toContain('Retry after 7 s.');
    expect(e.cause).toBeInstanceOf(RateLimitError);
  });

  test('a missing key fails the call, not the definition', async () => {
    const previous = process.env.TYPESEARCH_API_KEY;
    delete process.env.TYPESEARCH_API_KEY;
    try {
      const t = newsSearch({ baseURL: api.url }); // no throw here
      await expect(run(t, { query: 'el dólar' })).rejects.toThrow(/typesearch error: Missing API key/);
      expect(api.requests).toHaveLength(0);
    } finally {
      if (previous !== undefined) process.env.TYPESEARCH_API_KEY = previous;
    }
  });

  test('the key comes from TYPESEARCH_API_KEY', async () => {
    const previous = process.env.TYPESEARCH_API_KEY;
    process.env.TYPESEARCH_API_KEY = KEY;
    try {
      await run(newsSearch({ baseURL: api.url }), { query: 'el dólar' });
      expect(api.last.headers.authorization).toBe(`Bearer ${KEY}`);
    } finally {
      if (previous === undefined) delete process.env.TYPESEARCH_API_KEY;
      else process.env.TYPESEARCH_API_KEY = previous;
    }
  });

  test('connection errors', async () => {
    const e = await run(newsSearch({ apiKey: KEY, baseURL: 'http://127.0.0.1:9', maxRetries: 0 }), { query: 'el dólar' }).catch((x) => x);
    expect(e.message).toMatch(/^typesearch error \(connection\)/);
  });

  test('aborting the call aborts the request', async () => {
    const controller = new AbortController();
    controller.abort(new Error('stop'));
    const t = newsSearch(cfg());
    await expect(t.execute!({ query: 'el dólar' }, { ...(opts as object), abortSignal: controller.signal } as never)).rejects.toThrow('stop');
  });
});

describe('a client of your own', () => {
  test('is used as is', async () => {
    const client = new Typesearch({ apiKey: KEY, baseURL: api.url, maxRetries: 0, defaultHeaders: { 'X-Trace': 'abc' } });
    await run(newsSearch({ client }), { query: 'el dólar' });
    expect(api.last.headers['x-trace']).toBe('abc');
  });
});

describe('getContents', () => {
  test('urls and an optional query', async () => {
    const t = getContents(cfg());
    expect(props(t).names).toEqual(['urls', 'query']);
    expect(props(t).required).toEqual(['urls']);
    const out = await run(t, { urls: ['https://cronicaejemplo.example/politica/presupuesto', 'https://unreachable.example/x'], query: 'presupuesto' });
    expect(api.last.path).toBe('/v1/contents');
    expect(api.last.body).toEqual({ urls: ['https://cronicaejemplo.example/politica/presupuesto', 'https://unreachable.example/x'], query: 'presupuesto' });
    expect(out.results[0]).toEqual({
      url: 'https://cronicaejemplo.example/politica/presupuesto',
      status: 'ok',
      title: 'Presupuesto 2027: las claves del proyecto',
      description: 'El Gobierno envió el proyecto al Congreso.',
      published_at: '2026-09-16T01:12Z',
      source: 'Crónica Ejemplo',
      excerpt: 'El proyecto prevé un superávit primario…',
      highlights: ['Las provincias recibirán más fondos'],
      relevance: 0.97,
    });
    expect(out.results[1]).toEqual({ url: 'https://unreachable.example/x', status: 'error', error: { code: 'site_unreachable', message: 'The site did not answer.' } });
    const value = ((await modelText(t, { urls: [] }, out)) as { value: string }).value;
    expect(value).toContain('1 of 2 URLs read · US$0.0002');
    expect(value).toContain('Relevance to the query: 0.97');
    expect(value).toContain('Error (site_unreachable): The site did not answer.');
  });

  test('without a query, and at most 10 URLs', async () => {
    await run(getContents(cfg()), { urls: ['https://cronicaejemplo.example/a'] });
    expect(api.last.body).toEqual({ urls: ['https://cronicaejemplo.example/a'] });
    await expect(run(getContents(cfg()), { urls: Array(11).fill('https://a.example') })).rejects.toThrow();
    await expect(run(getContents(cfg()), { urls: [] })).rejects.toThrow();
  });
});

describe('findSimilar', () => {
  test('mode fast and 10 results by default; days from the model or the config', async () => {
    const t = findSimilar(cfg());
    expect(props(t).names).toEqual(['url', 'days']);
    const out = await run(t, { url: 'https://diarioejemplo.example/economia/nota-1' });
    expect(api.last.path).toBe('/v1/similar');
    expect(api.last.body).toEqual({ url: 'https://diarioejemplo.example/economia/nota-1', mode: 'fast', max_results: 10 });
    expect(out.reference).toEqual({ title: 'Inflación: qué esperan los analistas', url: 'https://diarioejemplo.example/economia/nota-1' });
    const value = ((await modelText(t, { url: 'x' }, out)) as { value: string }).value;
    expect(value).toMatch(/^2 similar articles to "Inflación: qué esperan los analistas" · US\$0\.0014/);
    await run(findSimilar({ ...cfg(), mode: 'deep', maxResults: 3, days: 30 }), { url: 'https://diarioejemplo.example/economia/nota-1' });
    expect(api.last.body).toEqual({ url: 'https://diarioejemplo.example/economia/nota-1', mode: 'deep', max_results: 3, days: 30 });
    await run(findSimilar({ ...cfg(), days: 30 }), { url: 'https://diarioejemplo.example/economia/nota-1', days: 2 });
    expect(api.last.body.days).toBe(2);
  });

  test('countries and languages are set by the developer, never offered to the model', async () => {
    const t = findSimilar({ ...cfg(), countries: ['AR', 'UY'], languages: ['es'] });
    expect(props(t).names).toEqual(['url', 'days']);
    await run(t, { url: 'https://diarioejemplo.example/economia/nota-1' });
    expect(api.last.body).toEqual({ url: 'https://diarioejemplo.example/economia/nota-1', mode: 'fast', max_results: 10, countries: ['AR', 'UY'], languages: ['es'] });
  });

  test('no similar articles: results stays, empty', async () => {
    api.next({ status: 200, body: searchResponse({ object: 'similar', found: false, total: 0, results: [], reference: null }) });
    const t = findSimilar(cfg());
    const out = await run(t, { url: 'https://diarioejemplo.example/economia/nota-1' });
    expect(out.results).toEqual([]);
    expect(out).not.toHaveProperty('reference');
    const value = ((await modelText(t, { url: 'x' }, out)) as { value: string }).value;
    expect(value).toMatch(/^No similar articles · US\$/);
  });
});

test('VERSION matches package.json', () => {
  expect(VERSION).toBe(pkg.version);
});
