/*
 * Lo que devuelve cada herramienta: los datos compactos (sin null, sin cadenas ni listas vacías) y un
 * texto breve y legible, que es lo que lee el modelo. Es el mismo formato que el MCP de typesearch
 * (typesearch-mcp/src/format.ts y el remoto): un agente ve lo mismo con el MCP y con este paquete.
 */
import type { ContentsResponse, Result, SearchResponse } from 'typesearch-js';

/** One article, with only the fields an agent cites. Empty fields are left out. */
export interface CompactResult {
  title: string;
  url: string;
  source?: string;
  /** ISO 8601, UTC, to the minute. */
  published_at?: string;
  /** ISO 3166-1 alpha-2 country of the source. */
  country?: string;
  /** ISO 639-1 language. */
  language?: string;
  /** The standfirst, as the outlet published it (shortened). */
  snippet?: string;
  /** Short verbatim excerpts from reading the article (modes that read). */
  highlights?: string[];
  /** Calibrated probability that the article is about the query. */
  score: number;
  /** Only when it was not found in the index: where it came from. */
  found_in?: 'homepage' | 'section' | 'site_search' | 'discovery';
}

export interface CompactWarning {
  code: string;
  message: string;
}

interface CompactCommon {
  mode: SearchResponse['mode'];
  results: CompactResult[];
  /** Only when nothing matched: the closest articles, which may not be about it. */
  near_misses?: CompactResult[];
  /** The time or token budget ran out: there may be more. */
  incomplete?: true;
  /** It came from the cache (free). */
  cached?: true;
  /** What this call was billed, in USD. */
  cost_usd: number;
  warnings?: CompactWarning[];
  request_id: string;
}

/** The output of `newsSearch()`. */
export interface NewsSearchOutput extends CompactCommon {
  query: string;
}

/** The output of `findSimilar()`. */
export interface FindSimilarOutput extends CompactCommon {
  reference?: { title: string; url: string };
}

/** One URL in the output of `getContents()`. */
export interface CompactPage {
  url: string;
  status: 'ok' | 'error';
  title?: string;
  description?: string;
  published_at?: string;
  source?: string;
  /** A short verbatim excerpt (up to 25 words); the one about the query when there is one. */
  excerpt?: string;
  highlights?: string[];
  /** With a query: probability that the article is about it. */
  relevance?: number;
  error?: CompactWarning;
}

/** The output of `getContents()`. */
export interface GetContentsOutput {
  results: CompactPage[];
  cost_usd: number;
  request_id: string;
}

// --- Utilidades ----------------------------------------------------------------------------

/** Sin null, sin cadenas vacías y sin listas vacías: lo que no dice nada no gasta tokens. */
function compact<T>(o: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))) as T;
}

function shorten(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.lastIndexOf(' ', max - 1);
  return `${clean.slice(0, cut > max * 0.6 ? cut : max - 1)}…`;
}

/** ISO al minuto, en UTC: `2026-09-25T14:05Z`. */
function toMinute(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? `${new Date(t).toISOString().slice(0, 16)}Z` : iso;
}

const round = (x: number) => Math.round(x * 100) / 100;
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const cost = (s: { cost_usd: number; cached?: true }) => (s.cached ? 'cached, free' : `US$${s.cost_usd.toFixed(4)}`);
const utc = (iso: string) => iso.replace('T', ' ').replace('Z', ' UTC');

// El país y el idioma de la fuente llegan con la API que filtra por país e idioma; el SDK todavía no los tipa.
type WithPlace = Result & { country?: string | null; language?: string | null };

function compactResult(r: WithPlace): CompactResult {
  return compact<CompactResult>({
    title: r.title,
    url: r.url,
    source: r.source,
    published_at: toMinute(r.published_at),
    country: r.country,
    language: r.language,
    snippet: r.snippet ? shorten(r.snippet, 300) : null,
    highlights: r.highlights,
    score: round(r.score),
    found_in: r.found_in === 'index' ? null : r.found_in,
  });
}

const WHERE: Record<NonNullable<CompactResult['found_in']>, string> = {
  homepage: 'from the homepage',
  section: 'from a section page',
  site_search: "from the site's search",
  discovery: 'found beyond the index',
};

function resultLines(r: CompactResult, i: number): string[] {
  const place = [r.country, r.language].filter(Boolean).join('/');
  const meta = [r.source, r.published_at ? utc(r.published_at) : null, place || null, r.found_in ? WHERE[r.found_in] : null].filter(Boolean).join(' · ');
  return [`${i + 1}. ${r.title}`, ...(meta ? [meta] : []), r.url, ...(r.snippet ? [r.snippet] : []), ...(r.highlights ?? []).map((h) => `> ${h}`)];
}

function common(r: SearchResponse): CompactCommon {
  const results = (r.results ?? []).map(compactResult);
  // `results` va siempre, aunque esté vacía: es lo que dice que no se encontró nada.
  const rest = compact<Omit<CompactCommon, 'mode' | 'results'>>({
    near_misses: results.length === 0 ? (r.near_misses ?? []).slice(0, 5).map(compactResult) : [],
    incomplete: r.incomplete ? true : null,
    cached: r.cached_at ? true : null,
    cost_usd: r.usage?.cost_usd ?? 0,
    warnings: r.warnings,
    request_id: r.id,
  });
  return { mode: r.mode, results, ...rest };
}

function searchText(header: string, s: CompactCommon): string {
  const parts = [header];
  if (s.results.length) parts.push(...s.results.map((r, i) => resultLines(r, i).join('\n')));
  else if (s.near_misses?.length) parts.push('Closest articles, which may not be about it:', ...s.near_misses.map((r, i) => resultLines(r, i).join('\n')));
  if (s.incomplete) parts.push('Incomplete: the time or token budget ran out; repeating the search in a minute may bring more.');
  for (const w of s.warnings ?? []) parts.push(`Note (${w.code}): ${w.message}`);
  return parts.join('\n\n');
}

// --- Salidas ---------------------------------------------------------------------------------

export function newsSearchOutput(r: SearchResponse, query: string): NewsSearchOutput {
  return { query, ...common(r) };
}

export function newsSearchText(s: NewsSearchOutput): string {
  return searchText(`${s.results.length ? count(s.results.length, 'result', 'results') : 'No results'} for "${s.query}" · ${s.mode} · ${cost(s)}`, s);
}

export function findSimilarOutput(r: SearchResponse): FindSimilarOutput {
  // `results` va siempre (common), también vacía: sólo la referencia puede faltar.
  return { ...(r.reference ? { reference: { title: r.reference.title, url: r.reference.url } } : {}), ...common(r) };
}

export function findSimilarText(s: FindSimilarOutput): string {
  const of = s.reference ? ` to "${s.reference.title}"` : '';
  return searchText(`${s.results.length ? count(s.results.length, 'similar article', 'similar articles') : 'No similar articles'}${of} · ${cost(s)}`, s);
}

export function getContentsOutput(r: ContentsResponse): GetContentsOutput {
  const results = r.results.map((x) =>
    compact<CompactPage>({
      url: x.url,
      status: x.status,
      title: x.title,
      description: x.description ? shorten(x.description, 300) : null,
      published_at: toMinute(x.published_at),
      source: x.source,
      excerpt: x.excerpt,
      // El fragmento sobre la consulta ya es `excerpt`: highlights sólo si suman algo.
      highlights: (x.highlights ?? []).filter((h) => h !== x.excerpt),
      relevance: x.relevance === null || x.relevance === undefined ? null : round(x.relevance),
      error: x.error,
    }),
  );
  return { results, cost_usd: r.usage?.cost_usd ?? 0, request_id: r.id };
}

export function getContentsText(s: GetContentsOutput): string {
  const ok = s.results.filter((x) => x.status === 'ok').length;
  const blocks = s.results.map((x, i) => {
    if (x.status === 'error') return `${i + 1}. ${x.url}\nError (${x.error?.code}): ${x.error?.message}`;
    const meta = [x.source, x.published_at ? utc(x.published_at) : null].filter(Boolean).join(' · ');
    return [
      `${i + 1}. ${x.title ?? x.url}`,
      ...(meta ? [meta] : []),
      x.url,
      ...(x.description ? [x.description] : []),
      ...(x.excerpt ? [`> ${x.excerpt}`] : []),
      ...(x.highlights ?? []).map((h) => `> ${h}`),
      ...(x.relevance !== undefined ? [`Relevance to the query: ${x.relevance}`] : []),
    ].join('\n');
  });
  return [`${ok} of ${count(s.results.length, 'URL', 'URLs')} read · US$${s.cost_usd.toFixed(4)}`, ...blocks].join('\n\n');
}
