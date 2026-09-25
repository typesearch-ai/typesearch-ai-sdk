/*
 * El cliente de la API detrás de las herramientas. Se crea la primera vez que el modelo llama una
 * herramienta, no al definirla: `newsSearch()` en el nivel superior de un módulo no falla en un build sin
 * clave (Next.js, por ejemplo), y el error de la clave faltante le llega al modelo como error de la
 * herramienta.
 */
import Typesearch, { APIConnectionError, APIError, APITimeoutError, RateLimitError, VERSION as SDK_VERSION } from 'typesearch-js';
import { VERSION } from './version.ts';

/** Settings shared by every tool. */
export interface TypesearchConfig {
  /** Your API key. Defaults to the `TYPESEARCH_API_KEY` environment variable. */
  apiKey?: string;
  /** Defaults to `TYPESEARCH_BASE_URL`, or `https://api.typesearch.ai`. */
  baseURL?: string;
  /** A `typesearch-js` client you already have, used instead of creating one. */
  client?: Typesearch;
  /** Milliseconds before a request is aborted. Defaults to 70 000 (a `deep` search can take about a minute). */
  timeout?: number;
  /** Retries on connection errors, `429 rate_limited` and `5xx`. Defaults to 2. */
  maxRetries?: number;
  /**
   * What the model reads: `text` (default) is a compact, readable list that costs fewer tokens; `json` is
   * the same data as the tool's output. Your code always gets the structured output.
   */
  modelOutput?: 'text' | 'json';
}

export const USER_AGENT = `typesearch-ai-sdk/${VERSION} typesearch-js/${SDK_VERSION}`;

/** Un cliente perezoso: se crea en la primera llamada y se reusa. */
export function lazyClient(config: TypesearchConfig): () => Typesearch {
  let client = config.client;
  return () => {
    client ??= new Typesearch({
      ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
      ...(config.baseURL !== undefined ? { baseURL: config.baseURL } : {}),
      ...(config.timeout !== undefined ? { timeout: config.timeout } : {}),
      ...(config.maxRetries !== undefined ? { maxRetries: config.maxRetries } : {}),
      defaultHeaders: { 'User-Agent': USER_AGENT },
    });
    return client;
  };
}

/**
 * Un error que el modelo entiende y sobre el que puede actuar, en inglés y sin la clave. El error original
 * del SDK queda en `cause`, para el código que lo quiera distinguir (`instanceof RateLimitError`…).
 */
export function toolError(e: unknown): Error {
  if (e instanceof APIError) {
    const retry = e instanceof RateLimitError && e.retryAfter ? ` Retry after ${e.retryAfter} s.` : '';
    return new Error(`typesearch error (${e.code}): ${e.message}${retry}${e.requestId ? ` [request ${e.requestId}]` : ''}`, { cause: e });
  }
  if (e instanceof APITimeoutError) return new Error('typesearch error (timeout): the API took too long to answer. Try again, or use a lighter mode.', { cause: e });
  if (e instanceof APIConnectionError) return new Error('typesearch error (connection): could not reach the typesearch API. Try again.', { cause: e });
  if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) return e;
  return new Error(`typesearch error: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
}

/** Llama a la API con el cliente perezoso y traduce los errores. */
export async function call<T>(client: () => Typesearch, run: (c: Typesearch) => Promise<T>): Promise<T> {
  try {
    return await run(client());
  } catch (e) {
    throw toolError(e);
  }
}
