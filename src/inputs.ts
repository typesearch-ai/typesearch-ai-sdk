/*
 * Los parámetros que ve el modelo: los mismos nombres, límites y descripciones que `search_news`,
 * `get_contents` y `find_similar` del MCP de typesearch, para que un agente los use igual por cualquiera
 * de los dos caminos. `zod/v4` funciona con zod 3.25+ y con zod 4.
 */
import { z } from 'zod/v4';

export const MODES = ['ultra', 'fast', 'normal', 'deep'] as const;

export const query = z
  .string()
  .trim()
  .min(2, 'query needs at least two letters.')
  .max(200, 'query is too long: 200 characters at most.')
  .describe('What to look for, in any language: a topic, event, person, company or place, such as "inflation in Argentina" or "OpenAI funding".');

export const days = z
  .number()
  .int()
  .min(1)
  .max(365)
  .describe('Only the last N days, 1 to 365. Defaults to 7 unless published_after or published_before are given.');

const date = (field: string) =>
  z.union([z.iso.date(), z.iso.datetime({ offset: true })], { error: `${field} must be a date (2026-09-25) or a date-time with its offset (2026-09-25T14:00:00Z).` });

export const publishedAfter = date('published_after').describe('Published on or after this date: 2026-09-25, or a date-time with offset.');
export const publishedBefore = date('published_before').describe('Published on or before this date; a bare date includes that whole day.');

const domains = z.array(z.string().max(200)).max(20);
export const includeDomains = domains.describe('Only these domains or paths, such as example.com or example.com/sports.');
export const excludeDomains = domains.describe('Never these domains or paths.');

export const countries = z
  .array(z.string().max(20))
  .min(1)
  .max(50)
  .describe('Only sources from these countries: ISO 3166-1 alpha-2 codes, such as ["AR"] or ["US", "GB"].');

export const languages = z
  .array(z.string().max(35))
  .min(1)
  .max(20)
  .describe('Only sources that publish in these languages: ISO 639-1 codes, such as ["es"] or ["en", "pt"].');

export const urls = z.array(z.string().max(2000)).min(1).max(10).describe('Up to 10 article URLs, such as https://example.com/news/article.');

export const url = z.string().max(2000).describe('The article URL whose story to find elsewhere.');

/** Checks a `maxResults` setting where the tool is defined, not when the model calls it. */
export function checkMaxResults(n: number | undefined, max: number): number | undefined {
  if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > max)) throw new RangeError(`maxResults must be a whole number from 1 to ${max}.`);
  return n;
}
