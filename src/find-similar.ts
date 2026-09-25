import { tool, type JSONValue, type Tool } from 'ai';
import { z } from 'zod/v4';
import { call, lazyClient, type TypesearchConfig } from './client.ts';
import { findSimilarOutput, findSimilarText, type FindSimilarOutput } from './format.ts';
import { checkMaxResults, days, url } from './inputs.ts';

export interface FindSimilarConfig extends TypesearchConfig {
  /**
   * `fast` (default) reads only the reference article; `deep` also reads the matches and returns
   * excerpts, at a higher price. See https://typesearch.ai/pricing.
   */
  mode?: 'fast' | 'deep';
  /** Results per call, 1 to 50. Defaults to 10. */
  maxResults?: number;
  /** The window when the model asks for none: the last N days (1–365). The API's default is 7. */
  days?: number;
  /** Only coverage from sources in these countries (ISO 3166-1 alpha-2). Set here, not by the model. */
  countries?: string[];
  /** Only coverage from sources in these languages (ISO 639-1). Set here, not by the model. */
  languages?: string[];
  /** Replaces the tool description the model reads. */
  description?: string;
}

export interface FindSimilarInput {
  url: string;
  days?: number;
}

const DESCRIPTION =
  'Find other news articles about the same story as a given article URL, across the index (the last 7 days by default). ' +
  'Useful to see how other outlets covered a story, and who published it first.';

/** A tool that finds other coverage of the story in an article URL. */
export function findSimilar(config: FindSimilarConfig = {}): Tool<FindSimilarInput, FindSimilarOutput> {
  const client = lazyClient(config);
  const maxResults = checkMaxResults(config.maxResults, 50) ?? 10;
  return tool({
    description: config.description ?? DESCRIPTION,
    inputSchema: z.object({ url, days: days.describe('Only the last N days, 1 to 365. Defaults to 7.').optional() }) as unknown as z.ZodType<FindSimilarInput>,
    execute: async (input, { abortSignal }) => {
      const windowDays = input.days ?? config.days;
      const res = await call(client, (c) =>
        c.similar(
          input.url,
          {
            mode: config.mode ?? 'fast',
            max_results: maxResults,
            ...(windowDays !== undefined ? { days: windowDays } : {}),
            ...(config.countries?.length ? { countries: config.countries } : {}),
            ...(config.languages?.length ? { languages: config.languages } : {}),
          },
          { signal: abortSignal },
        ),
      );
      return findSimilarOutput(res);
    },
    toModelOutput: ({ output }) =>
      config.modelOutput === 'json' ? { type: 'json', value: output as unknown as JSONValue } : { type: 'text', value: findSimilarText(output) },
  });
}
