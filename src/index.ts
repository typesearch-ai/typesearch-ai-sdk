/**
 * News search tools for the Vercel AI SDK, backed by typesearch: https://typesearch.ai
 *
 * ```ts
 * import { newsSearch, getContents, findSimilar } from '@typesearch/ai-sdk';
 *
 * const tools = { newsSearch: newsSearch(), getContents: getContents(), findSimilar: findSimilar() };
 * ```
 */
export { newsSearch, type NewsSearchConfig, type NewsSearchInput } from './news-search.ts';
export { getContents, type GetContentsConfig, type GetContentsInput } from './get-contents.ts';
export { findSimilar, type FindSimilarConfig, type FindSimilarInput } from './find-similar.ts';
export type { TypesearchConfig } from './client.ts';
export type { CompactPage, CompactResult, CompactWarning, FindSimilarOutput, GetContentsOutput, NewsSearchOutput } from './format.ts';
export { VERSION } from './version.ts';
