import express from 'express';
import { generateContent } from '../utils/generateContent.js';
import {
  triviaSchema,
  vocabularySchema,
  quoteSchema,
  bibleVerseSchema,
} from '../schemas/contentSchemas.js';

const router = express.Router();

function buildExclusionText(recentItems = []) {
  if (!recentItems.length) return '';
  return `\n\nDo not repeat any of these previously used items:\n${recentItems
    .map((item) => `- ${item}`)
    .join('\n')}`;
}

router.post('/trivia', async (req, res) => {
  const { recentTrivias = [] } = req.body;

  const topics = ['science', 'history', 'geography', 'pop culture', 'sports', 'space', 'animals'];
  const randomTopic = topics[Math.floor(Math.random() * topics.length)];

  const prompt = `Generate one interesting trivia question about ${randomTopic}, with its answer.${buildExclusionText(
    recentTrivias
  )}`;

  try {
    const data = await generateContent(triviaSchema, prompt);
    res.json(data);
  } catch (error) {
    console.error('Error generating trivia:', error);
    res.status(500).json({ error: 'Failed to generate trivia' });
  }
});

router.post('/vocabulary', async (req, res) => {
  const { recentWords = [] } = req.body;

  const prompt = `Generate one useful vocabulary word with its definition.${buildExclusionText(
    recentWords
  )}`;

  try {
    const data = await generateContent(vocabularySchema, prompt);
    res.json(data);
  } catch (error) {
    console.error('Error generating vocabulary:', error);
    res.status(500).json({ error: 'Failed to generate vocabulary' });
  }
});

router.post('/quote', async (req, res) => {
  const { recentQuotes = [] } = req.body;

  const prompt = `Generate one inspiring quote.${buildExclusionText(recentQuotes)}`;

  try {
    const data = await generateContent(quoteSchema, prompt);
    res.json(data);
  } catch (error) {
    console.error('Error generating quote:', error);
    res.status(500).json({ error: 'Failed to generate quote' });
  }
});

router.post('/bible-verse', async (req, res) => {
  const { recentVerses = [] } = req.body;

  const prompt = `Generate one meaningful Bible verse, including its reference (book, chapter, verse).${buildExclusionText(
    recentVerses
  )}`;

  try {
    const data = await generateContent(bibleVerseSchema, prompt);
    res.json(data);
  } catch (error) {
    console.error('Error generating Bible verse:', error);
    res.status(500).json({ error: 'Failed to generate Bible verse' });
  }
});

export default router;