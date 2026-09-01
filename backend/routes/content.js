import express from 'express';
import { generateContent } from '../utils/generateContent.js';
import { triviaSchema, vocabularySchema, quoteSchema } from '../schemas/contentSchemas.js';

const router = express.Router();

const MAX_ITEM_COUNT = 20; // safety cap to avoid abuse / runaway generation, shared by all endpoints

function buildExclusionText(recentItems = []) {
  if (!recentItems.length) return '';
  return `\n\nDo not repeat any of these previously used items:\n${recentItems
    .map((item) => `- ${item}`)
    .join('\n')}`;
}

// Clamps/validates a requested count the same way across all endpoints.
function resolveCount(count) {
  return Math.min(MAX_ITEM_COUNT, Math.max(1, Number.isFinite(count) ? Math.floor(count) : 1));
}

router.post('/trivia', async (req, res) => {
  const { recentTrivias = [], count = 1 } = req.body;
  const numToGenerate = resolveCount(count);

  const topics = ['science', 'history', 'geography', 'pop culture', 'sports', 'space', 'animals'];

  // Generated one at a time so each subsequent question also excludes the
  // ones we've just generated in this same batch, avoiding duplicates
  // within a single request.
  const exclusions = [...recentTrivias];
  const items = [];

  try {
    for (let i = 0; i < numToGenerate; i++) {
      const randomTopic = topics[Math.floor(Math.random() * topics.length)];
      const prompt = `Generate one interesting trivia question about ${randomTopic}, with its answer.${buildExclusionText(
        exclusions
      )}`;

      const data = await generateContent(triviaSchema, prompt);
      items.push(data);
      exclusions.push(data.question);
    }

    res.json(items);
  } catch (error) {
    console.error('Error generating trivia:', error);
    res.status(500).json({ error: 'Failed to generate trivia' });
  }
});

router.post('/vocabulary', async (req, res) => {
  const { recentWords = [], count = 1 } = req.body;
  const numToGenerate = resolveCount(count);

  const exclusions = [...recentWords];
  const items = [];

  try {
    for (let i = 0; i < numToGenerate; i++) {
      const prompt = `Generate one useful vocabulary word with its definition.${buildExclusionText(
        exclusions
      )}`;

      const data = await generateContent(vocabularySchema, prompt);
      items.push(data);
      exclusions.push(data.word);
    }

    res.json(items);
  } catch (error) {
    console.error('Error generating vocabulary:', error);
    res.status(500).json({ error: 'Failed to generate vocabulary' });
  }
});

router.post('/quote', async (req, res) => {
  const { recentQuotes = [], count = 1 } = req.body;
  const numToGenerate = resolveCount(count);

  const exclusions = [...recentQuotes];
  const items = [];

  try {
    for (let i = 0; i < numToGenerate; i++) {
      const prompt = `Generate one inspiring quote.${buildExclusionText(exclusions)}`;

      const data = await generateContent(quoteSchema, prompt);
      items.push(data);
      exclusions.push(data.quote);
    }

    res.json(items);
  } catch (error) {
    console.error('Error generating quote:', error);
    res.status(500).json({ error: 'Failed to generate quote' });
  }
});

export default router;
