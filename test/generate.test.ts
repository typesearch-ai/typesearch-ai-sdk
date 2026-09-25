/*
 * De punta a punta con el AI SDK: generateText con un modelo simulado que llama newsSearch, la
 * herramienta busca en la API falsa, y el modelo recibe el texto compacto como resultado.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { generateText, stepCountIs } from 'ai';
import * as aiTest from 'ai/test';
import { findSimilar, getContents, newsSearch } from '../src/index.ts';
import { FakeApi, KEY } from './fake-api.ts';

// MockLanguageModelV4 es de ai 7; con ai 6 (también soportado) estas dos pruebas se saltean.
const MockLanguageModelV4 = (aiTest as Partial<typeof aiTest>).MockLanguageModelV4 as typeof aiTest.MockLanguageModelV4;
const withV4 = test.skipIf(!MockLanguageModelV4);

let api: FakeApi;

beforeAll(async () => {
  api = await new FakeApi().start();
});
afterAll(() => api.close());

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

withV4('generateText: the model calls newsSearch and reads the compact text', async () => {
  const model = new MockLanguageModelV4({
    doGenerate: [
      {
        content: [{ type: 'tool-call', toolCallId: 'call_1', toolName: 'newsSearch', input: JSON.stringify({ query: 'el dólar', days: 1, countries: ['AR'] }) }],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage,
        warnings: [],
      },
      {
        content: [{ type: 'text', text: 'The peso held steady (Diario Ejemplo).' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      },
    ],
  });

  const config = { apiKey: KEY, baseURL: api.url };
  const result = await generateText({
    model,
    tools: { newsSearch: newsSearch(config), getContents: getContents(config), findSimilar: findSimilar(config) },
    stopWhen: stepCountIs(3),
    prompt: 'What happened with the peso today?',
  });

  expect(result.text).toBe('The peso held steady (Diario Ejemplo).');
  expect(api.last.body).toEqual({ query: 'el dólar', mode: 'fast', max_results: 10, days: 1, countries: ['AR'] });

  // Las tres herramientas llegan al modelo con su descripción y su esquema.
  const tools = (model.doGenerateCalls[0]!.tools ?? []) as { name: string; description?: string; inputSchema: { properties: object } }[];
  expect(tools.map((t) => t.name)).toEqual(['newsSearch', 'getContents', 'findSimilar']);
  expect(Object.keys(tools[0]!.inputSchema.properties)).toContain('published_after');

  // La aplicación recibe la salida estructurada…
  const toolResult = result.steps[0]!.toolResults[0]!;
  expect(toolResult.output).toMatchObject({ query: 'el dólar', mode: 'fast', results: [{ source: 'Diario Ejemplo' }, { source: 'Example Wire' }] });

  // …y el modelo, el texto compacto.
  const second = JSON.stringify(model.doGenerateCalls[1]!.prompt);
  expect(second).toContain('2 results for \\"el dólar\\" · fast');
  expect(second).toContain('https://diarioejemplo.example/economia/nota-1');
});

withV4('generateText: an API error reaches the model as a tool error it can read', async () => {
  const model = new MockLanguageModelV4({
    doGenerate: [
      {
        content: [{ type: 'tool-call', toolCallId: 'call_1', toolName: 'newsSearch', input: JSON.stringify({ query: 'el dólar' }) }],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage,
        warnings: [],
      },
      { content: [{ type: 'text', text: 'I could not search.' }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] },
    ],
  });
  await generateText({
    model,
    tools: { newsSearch: newsSearch({ apiKey: 'ts_live_wrong', baseURL: api.url }) },
    stopWhen: stepCountIs(3),
    prompt: 'News about the peso?',
  });
  const second = JSON.stringify(model.doGenerateCalls[1]!.prompt);
  expect(second).toContain('typesearch error (invalid_api_key): The API key is not valid.');
  expect(second).not.toContain('ts_live_wrong');
});
