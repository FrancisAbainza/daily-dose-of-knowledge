import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function generateContent(schema, prompt) {
  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema,
    prompt,
    temperature: 1.0,
  });
  return object;
}