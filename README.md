# @typesearch/ai-sdk

News search tools for the [Vercel AI SDK](https://ai-sdk.dev), backed by [typesearch](https://typesearch.ai):
recent news on any topic from outlets worldwide, by country and language, with a calibrated relevance score
on every result.

```bash
npm install @typesearch/ai-sdk ai zod
```

Works with `ai` 6 and 7 and `zod` 3.25+ or 4, in `generateText`, `streamText` and agents.

## Quickstart

Create a key in the [dashboard](https://app.typesearch.ai) and set it as `TYPESEARCH_API_KEY`:

```ts
import { generateText, stepCountIs } from 'ai';
import { newsSearch } from '@typesearch/ai-sdk';

const { text } = await generateText({
  model: 'anthropic/claude-sonnet-4.5',
  tools: { newsSearch: newsSearch() }, // reads TYPESEARCH_API_KEY
  stopWhen: stepCountIs(5),
  prompt: 'What changed in EU AI Act enforcement this week? Cite your sources.',
});
```

## Tools

| Tool | What it does | What the model can set |
| --- | --- | --- |
| `newsSearch()` | News on a topic: title, link, source, date, country and language, standfirst and short excerpts, each with a relevance score. | `query`, `days`, `published_after`, `published_before`, `include_domains`, `exclude_domains`, `countries`, `languages` |
| `getContents()` | Title, standfirst, date, source and a short verbatim excerpt (up to 25 words) of up to 10 article URLs — never the full text. | `urls`, `query` (the excerpt about it, with a relevance score) |
| `findSimilar()` | Other coverage of the story in an article URL, and who published it first. | `url`, `days` |

The parameters, limits and descriptions are the same as the tools of the
[typesearch MCP server](https://typesearch.ai/docs/integrations/mcp), so an agent uses them the same way.

```ts
import { findSimilar, getContents, newsSearch } from '@typesearch/ai-sdk';

const tools = {
  newsSearch: newsSearch({ maxResults: 8 }),
  getContents: getContents(),
  findSimilar: findSimilar(),
};
```

## Configuration

Every tool takes:

| Option | Default | |
| --- | --- | --- |
| `apiKey` | `TYPESEARCH_API_KEY` | Your key. |
| `baseURL` | `https://api.typesearch.ai` | Or `TYPESEARCH_BASE_URL`. |
| `client` | — | A [`typesearch-js`](https://www.npmjs.com/package/typesearch-js) client you already have. |
| `timeout` · `maxRetries` | `70000` · `2` | Per request, as in `typesearch-js`. |
| `modelOutput` | `'text'` | What the model reads: a compact text list (fewer tokens) or `'json'`. |
| `description` | — | Replaces the description the model reads. |

`newsSearch()` also takes:

| Option | Default | |
| --- | --- | --- |
| `mode` | `'fast'` | `ultra`, `fast`, `normal` or `deep`: how much is read before ranking. See [modes](https://typesearch.ai/docs/modes). |
| `maxResults` | `10` | 1 to 50. |
| `days` | — | The window when the model asks for none. The API's default is the last 7 days. |
| `includeDomains` · `excludeDomains` | — | Fixed domain filters. |
| `countries` · `languages` | — | Fixed filters: ISO 3166-1 alpha-2 countries and ISO 639-1 languages of the sources. |
| `highlights` | — | Verbatim excerpts from the articles read (`normal` and `deep`). On by default in `deep`. |
| `timezone` | — | IANA time zone that decides what day "today" is. |

A filter you set in the config is always applied and is no longer offered to the model, so it cannot widen
it; the description tells the model about it. `findSimilar()` also takes `mode` (`'fast'` or `'deep'`),
`maxResults` and `days`.

```ts
// News from Argentina and Chile, in Spanish, reading the best matches.
const search = newsSearch({ mode: 'normal', countries: ['AR', 'CL'], languages: ['es'], timezone: 'America/Santiago' });
```

The key is read when the model first calls a tool, not when you define it: defining the tools at the top
level of a module never fails a build without the key.

## Output

Your code gets structured, compact data (no empty fields); the model reads the same data as a short text
list, which costs fewer tokens:

```ts
const { steps } = await generateText({ /* … */ });
const result = steps[0]?.toolResults[0]?.output;
// {
//   query: 'el dólar', mode: 'fast', cost_usd: 0.0014, request_id: 'req_…',
//   results: [
//     { title: 'El dólar cerró estable', url: 'https://diarioejemplo.example/economia/…', source: 'Diario Ejemplo',
//       published_at: '2026-09-21T18:05Z', country: 'AR', language: 'es', snippet: '…', score: 0.95 },
//   ],
// }
```

`score` is the calibrated probability that the article is about the query. With nothing found, `results`
is empty and `near_misses` has the closest articles. `incomplete: true` means the time or token budget
ran out; `cached: true`, that the result came from the cache and cost nothing.

## Errors

API errors reach the model as a tool error it can read and act on — `typesearch error (rate_limited): …
Retry after 12 s.` — without the key. The original [`typesearch-js`](https://www.npmjs.com/package/typesearch-js)
error is its `cause`, so your code can tell a `RateLimitError` from a `BudgetError`.

## Pricing

Each call is billed to your key like the API request it makes: a search by its mode, `getContents()` per
page, `findSimilar()` per request. Identical calls within 10 minutes come from the cache and cost nothing.
Prices: [typesearch.ai/pricing](https://typesearch.ai/pricing).

## MCP instead

The same tools are served by the remote MCP server at `https://api.typesearch.ai/mcp`, which you can use
from the AI SDK with [`@ai-sdk/mcp`](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools):

```ts
import { createMCPClient } from '@ai-sdk/mcp';

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://api.typesearch.ai/mcp', headers: { Authorization: `Bearer ${process.env.TYPESEARCH_API_KEY}` } },
});
const tools = await mcp.tools(); // search_news, get_contents, find_similar, check_coverage
```

This package needs no MCP connection, lets you fix filters per tool and gives your code typed output.

## Example

[`examples/news-agent.ts`](examples/news-agent.ts): an agent that searches, reads and cites.

## Development

```bash
npm ci
npm run lint        # types
npm test            # the tools against a fake API that validates every request against the API schema,
                    # and generateText end to end with a mock model
npm run test:live   # against the real API: needs TYPESEARCH_API_KEY (spends less than a cent)
npm run build && npm run smoke
```

## License

[MIT](LICENSE)
