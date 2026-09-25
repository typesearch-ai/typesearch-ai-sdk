/*
 * A news agent with the AI SDK: it searches, reads what it needs and cites its sources.
 *
 *   npm install ai @typesearch/ai-sdk zod
 *   TYPESEARCH_API_KEY=ts_live_… AI_GATEWAY_API_KEY=… npx tsx examples/news-agent.ts "What changed in EU AI Act enforcement this week?"
 */
import { generateText, stepCountIs } from 'ai';
import { findSimilar, getContents, newsSearch } from '@typesearch/ai-sdk';

const question = process.argv[2] ?? 'What changed in EU AI Act enforcement this week?';

const { text, steps } = await generateText({
  model: 'anthropic/claude-sonnet-4.5',
  system: 'Answer with recent news. Cite the source and the link of every fact. Say so when you found nothing.',
  tools: {
    newsSearch: newsSearch({ maxResults: 8 }), // reads TYPESEARCH_API_KEY
    getContents: getContents(),
    findSimilar: findSimilar(),
  },
  stopWhen: stepCountIs(6),
  prompt: question,
});

for (const step of steps) for (const call of step.toolCalls) console.error(`· ${call.toolName} ${JSON.stringify(call.input)}`);
console.log(text);
