/*
 * Una API falsa de typesearch, por HTTP de verdad, equivalente a la de typesearch-js: valida cada pedido
 * contra el esquema del OpenAPI (test/fixtures/requests.schema.json: SearchRequest, SimilarRequest y
 * ContentsRequest, con countries y languages; como la API, rechaza campos desconocidos con 400
 * invalid_request) y responde con ejemplos de medios ficticios `.example`. Guarda cada pedido.
 *
 * `api.next(...)` encola respuestas armadas a mano (errores, 429) que se usan antes que las normales.
 */
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

const schema = JSON.parse(fs.readFileSync(new URL('./fixtures/requests.schema.json', import.meta.url), 'utf8'));
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => void;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'https://fake.typesearch.test/requests', components: schema.components });

function validate(name: string, body: unknown): { path: string; message: string }[] {
  const v = ajv.getSchema(`https://fake.typesearch.test/requests#/components/schemas/${name}`);
  if (!v) throw new Error(`Sin esquema ${name}`);
  if (v(body)) return [];
  return (v.errors ?? []).map((e) => ({ path: e.instancePath.replace(/^\//, '').replace(/\//g, '.') || '(body)', message: e.message ?? 'invalid' }));
}

export const KEY = 'ts_test_aisdk';

export interface Recorded {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: http.IncomingHttpHeaders;
  body: any;
}

export interface Scripted {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export function result(n: number, extra: Record<string, unknown> = {}) {
  return {
    url: `https://diarioejemplo.example/economia/nota-${n}`,
    title: `El dólar cerró estable por ${n}ª rueda`,
    source: 'Diario Ejemplo',
    published_at: '2026-09-21T18:05:31.000Z',
    section: 'economia',
    snippet: 'La divisa se mantuvo sin cambios frente al cierre anterior.',
    score: 0.9612 - n / 100,
    headline_relevance: 0.91,
    read: null,
    highlights: [],
    tone: null,
    answers: null,
    duplicates: [],
    date_match: null,
    referenced_date: null,
    found_in: 'index',
    country: 'AR',
    language: 'es',
    ...extra,
  };
}

export function searchResponse(extra: Record<string, unknown> = {}) {
  return {
    id: 'req_fakeaisdk',
    object: 'search',
    mode: 'fast',
    queries: ['el dólar'],
    found: true,
    total: 2,
    results: [
      result(1),
      result(2, { url: 'https://examplewire.example/markets/peso', title: 'Peso holds steady', source: 'Example Wire', country: null, language: 'en', found_in: 'discovery', highlights: ['The peso ended the session unchanged'] }),
    ],
    groups: null,
    near_misses: [],
    rejected: [],
    diffusion: null,
    tone: null,
    essential: null,
    reference: null,
    temporal: null,
    site: null,
    index: null,
    usage: { tokens: 1840, calls: 2, cost_usd: 0.0014, headlines: 160, from_memory: 0, pages_direct: 0, pages_browser: 0, duration_ms: 910 },
    budget: null,
    discovery: null,
    incomplete: false,
    cached_at: null,
    warnings: [],
    ...extra,
  };
}

export function contentsResponse(urls: string[], query?: string) {
  return {
    id: 'req_fakecont',
    object: 'contents',
    results: urls.map((u) =>
      u.includes('unreachable')
        ? { url: u, status: 'error', error: { code: 'site_unreachable', message: 'The site did not answer.' }, title: null, description: null, published_at: null, source: null, excerpt: null, highlights: [], relevance: null }
        : {
            url: u,
            status: 'ok',
            error: null,
            title: 'Presupuesto 2027: las claves del proyecto',
            description: 'El Gobierno envió el proyecto al Congreso.',
            published_at: '2026-09-16T01:12:00.000Z',
            source: 'Crónica Ejemplo',
            excerpt: 'El proyecto prevé un superávit primario…',
            highlights: query ? ['El proyecto prevé un superávit primario…', 'Las provincias recibirán más fondos'] : [],
            relevance: query ? 0.9712 : null,
          },
    ),
    usage: { tokens: 1320, calls: 1, cost_usd: 0.0002, duration_ms: 1840 },
  };
}

export function problem(status: number, code: string, detail = `detail of ${code}`) {
  return { type: `urn:typesearch:error:${code}`, title: code, status, detail, code, request_id: 'req_fakeerr1' };
}

export class FakeApi {
  readonly requests: Recorded[] = [];
  url = '';
  #queue: Scripted[] = [];
  #server = http.createServer((req, res) => this.#handle(req, res));

  async start(): Promise<this> {
    await new Promise<void>((resolve) => this.#server.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
    return this;
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.#server.close(() => resolve()));
  }

  reset(): void {
    this.requests.length = 0;
    this.#queue = [];
  }

  next(...responses: Scripted[]): this {
    this.#queue.push(...responses);
    return this;
  }

  get last(): Recorded {
    const r = this.requests.at(-1);
    if (!r) throw new Error('No requests');
    return r;
  }

  async #handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    const url = new URL(req.url ?? '/', 'http://fake');
    const body = text ? JSON.parse(text) : undefined;
    this.requests.push({ method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, headers: req.headers, body });

    const send = (status: number, payload: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json', 'x-request-id': 'req_fake0001', ...headers });
      res.end(JSON.stringify(payload));
    };

    const scripted = this.#queue.shift();
    if (scripted) return send(scripted.status, scripted.body, scripted.headers);

    const auth = req.headers.authorization ?? (req.headers['x-api-key'] ? `Bearer ${req.headers['x-api-key']}` : undefined);
    if (!auth) return send(401, problem(401, 'missing_api_key', 'Missing API key.'));
    if (auth !== `Bearer ${KEY}`) return send(401, problem(401, 'invalid_api_key', 'The API key is not valid.'));

    const route = `${req.method} ${url.pathname}`;
    const check = (name: string) => {
      const errors = validate(name, body);
      if (errors.length) send(400, { ...problem(400, 'invalid_request', `${errors[0]!.path}: ${errors[0]!.message}`), errors });
      return errors.length === 0;
    };
    if (route === 'POST /v1/search') {
      if (!check('SearchRequest')) return;
      return send(200, searchResponse({ mode: body.mode ?? 'normal', queries: [body.query] }));
    }
    if (route === 'POST /v1/similar') {
      if (!check('SimilarRequest')) return;
      return send(200, searchResponse({ object: 'similar', mode: body.mode ?? 'normal', queries: [], reference: { url: body.url, title: 'Inflación: qué esperan los analistas' } }));
    }
    if (route === 'POST /v1/contents') {
      if (!check('ContentsRequest')) return;
      return send(200, contentsResponse(body.urls, body.query));
    }
    return send(404, problem(404, 'not_found'));
  }
}
