import { tool, type JSONValue, type Tool } from 'ai';
import { z } from 'zod/v4';
import { call, lazyClient, type TypesearchConfig } from './client.ts';
import { getContentsOutput, getContentsText, type GetContentsOutput } from './format.ts';
import { query, urls } from './inputs.ts';

export interface GetContentsConfig extends TypesearchConfig {
  /** Replaces the tool description the model reads. */
  description?: string;
}

export interface GetContentsInput {
  urls: string[];
  query?: string;
}

const DESCRIPTION =
  'Get the title, standfirst, date, source and a short verbatim excerpt (up to 25 words) of up to 10 news article URLs. ' +
  'With a query, the excerpt is the one about it and relevance says how much the article covers it. Never returns the full text. ' +
  'Use it on links from a news search, or on article links the user gives you.';

/**
 * A tool that reads up to 10 article URLs: metadata and a short verbatim excerpt of each, never the
 * full text. With a `query`, the excerpt about it and how much each article covers it.
 */
export function getContents(config: GetContentsConfig = {}): Tool<GetContentsInput, GetContentsOutput> {
  const client = lazyClient(config);
  return tool({
    description: config.description ?? DESCRIPTION,
    inputSchema: z.object({
      urls,
      query: query.optional().describe('Optional: the excerpt is then the one about this query, with a relevance score.'),
    }) as unknown as z.ZodType<GetContentsInput>,
    execute: async (input, { abortSignal }) => {
      const res = await call(client, (c) => c.contents(input.urls, input.query ? { query: input.query } : {}, { signal: abortSignal }));
      return getContentsOutput(res);
    },
    toModelOutput: ({ output }) =>
      config.modelOutput === 'json' ? { type: 'json', value: output as unknown as JSONValue } : { type: 'text', value: getContentsText(output) },
  });
}
