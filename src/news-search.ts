import { tool, type JSONValue, type Tool } from 'ai';
import type { Mode, SearchOptions } from 'typesearch-js';
import { z } from 'zod/v4';
import { call, lazyClient, type TypesearchConfig } from './client.ts';
import { newsSearchOutput, newsSearchText, type NewsSearchOutput } from './format.ts';
import { checkMaxResults, countries, days, excludeDomains, includeDomains, languages, publishedAfter, publishedBefore, query } from './inputs.ts';

export interface NewsSearchConfig extends TypesearchConfig {
  /**
   * How much is read before ranking: `fast` (default, the cheapest and quickest: headlines and
   * standfirsts), `ultra` (headlines only, same price), `normal` (also reads the best matches) or `deep`
   * (reads more and finds the topic in other words too). See https://typesearch.ai/docs/modes.
   */
  mode?: Mode;
  /** Results per search, 1 to 50. Defaults to 10. */
  maxResults?: number;
  /** The window when the model asks for none: the last N days (1–365). The API's default is 7. */
  days?: number;
  /** Always search only these domains or paths. The model can no longer choose them. */
  includeDomains?: string[];
  /** Never these domains or paths. The model can no longer choose them. */
  excludeDomains?: string[];
  /** Always search only sources from these countries (ISO 3166-1 alpha-2). The model can no longer choose them. */
  countries?: string[];
  /** Always search only sources in these languages (ISO 639-1). The model can no longer choose them. */
  languages?: string[];
  /** Verbatim excerpts from the articles that were read (`normal` and `deep`). On by default only in `deep`. */
  highlights?: boolean;
  /** IANA time zone that decides what day "today" is in a query such as "news from today". */
  timezone?: string;
  /** Replaces the tool description the model reads. */
  description?: string;
}

/** What the model can ask for. The filters set in the config are not offered to it. */
export interface NewsSearchInput {
  query: string;
  days?: number;
  published_after?: string;
  published_before?: string;
  include_domains?: string[];
  exclude_domains?: string[];
  countries?: string[];
  languages?: string[];
}

const DESCRIPTION =
  'Search recent news on any topic across a curated index of news outlets worldwide, judged by a relevance model. ' +
  'Returns the matching articles: title, link, source, date, country and language, standfirst, and short excerpts in the modes that read, each with a relevance score from 0 to 1. ' +
  'Use it for current events and for what outlets reported about a company, person, place or topic. It covers the last 7 days unless you set days or a date range. Cite the link of every fact.';

/**
 * A news search tool for the AI SDK.
 *
 * ```ts
 * import { generateText, stepCountIs } from 'ai';
 * import { newsSearch } from '@typesearch/ai-sdk';
 *
 * const { text } = await generateText({
 *   model: 'anthropic/claude-sonnet-4.5',
 *   tools: { newsSearch: newsSearch() }, // reads TYPESEARCH_API_KEY
 *   stopWhen: stepCountIs(5),
 *   prompt: 'What changed in EU AI Act enforcement this week?',
 * });
 * ```
 */
export function newsSearch(config: NewsSearchConfig = {}): Tool<NewsSearchInput, NewsSearchOutput> {
  const client = lazyClient(config);
  const mode = config.mode ?? 'fast';
  const maxResults = checkMaxResults(config.maxResults, 50) ?? 10;

  // Lo que fija el desarrollador no se le ofrece al modelo: no puede saltearlo ni gastar tokens en él.
  const shape: Record<string, z.ZodType> = {
    query,
    days: days.optional(),
    published_after: publishedAfter.optional(),
    published_before: publishedBefore.optional(),
  };
  if (!config.includeDomains) shape.include_domains = includeDomains.optional();
  if (!config.excludeDomains) shape.exclude_domains = excludeDomains.optional();
  if (!config.countries) shape.countries = countries.optional();
  if (!config.languages) shape.languages = languages.optional();

  const limits = [
    config.countries?.length ? `sources from ${config.countries.join(', ')}` : null,
    config.languages?.length ? `sources in ${config.languages.join(', ')}` : null,
    config.includeDomains?.length ? `only ${config.includeDomains.join(', ')}` : null,
    config.excludeDomains?.length ? `never ${config.excludeDomains.join(', ')}` : null,
  ].filter(Boolean);

  return tool({
    description: config.description ?? (limits.length ? `${DESCRIPTION} Searches are limited to ${limits.join('; ')}.` : DESCRIPTION),
    inputSchema: z.object(shape) as unknown as z.ZodType<NewsSearchInput>,
    execute: async (input, { abortSignal }) => {
      const dated = input.days !== undefined || input.published_after !== undefined || input.published_before !== undefined;
      const options: SearchOptions & { countries?: string[]; languages?: string[] } = {
        mode,
        max_results: maxResults,
        ...(input.days !== undefined ? { days: input.days } : !dated && config.days !== undefined ? { days: config.days } : {}),
        ...(input.published_after ? { published_after: input.published_after } : {}),
        ...(input.published_before ? { published_before: input.published_before } : {}),
        ...nonEmpty('include_domains', config.includeDomains ?? input.include_domains),
        ...nonEmpty('exclude_domains', config.excludeDomains ?? input.exclude_domains),
        ...nonEmpty('countries', config.countries ?? input.countries),
        ...nonEmpty('languages', config.languages ?? input.languages),
        ...(config.highlights !== undefined ? { highlights: config.highlights } : {}),
        ...(config.timezone ? { timezone: config.timezone } : {}),
      };
      const res = await call(client, (c) => c.search(input.query, options, { signal: abortSignal }));
      return newsSearchOutput(res, input.query);
    },
    toModelOutput: ({ output }) =>
      config.modelOutput === 'json' ? { type: 'json', value: output as unknown as JSONValue } : { type: 'text', value: newsSearchText(output) },
  });
}

function nonEmpty<K extends string>(key: K, value: string[] | undefined): { [k in K]?: string[] } {
  return value?.length ? ({ [key]: value } as { [k in K]: string[] }) : {};
}
