import express from 'express';
import { generateContent } from '../utils/generateContent.js';
import {
  triviaSchema,
  vocabularySchema,
  quoteSchema,
  bibleVerseSchema,
} from '../schemas/contentSchemas.js';

const router = express.Router();

router.get('/trivia', async (req, res) => {
  const topics = ['science', 'history', 'geography', 'pop culture', 'sports', 'space', 'animals'];
  const randomTopic = topics[Math.floor(Math.random() * topics.length)];

  const prompt = `Generate one interesting trivia question about ${randomTopic}, with its answer.`;
  try {
    const data = await generateContent(
      triviaSchema,
      prompt
    );
    res.json(data);
  } catch (error) {
    console.error('Error generating trivia:', error);
    res.status(500).json({ error: 'Failed to generate trivia' });
  }
});

router.get('/vocabulary', async (req, res) => {
  try {
    const data = await generateContent(
      vocabularySchema,
      'Generate one useful vocabulary word with its definition.'
    );
    res.json(data);
  } catch (error) {
    console.error('Error generating vocabulary:', error);
    res.status(500).json({ error: 'Failed to generate vocabulary' });
  }
});

router.get('/quote', async (req, res) => {
  try {
    const data = await generateContent(
      quoteSchema,
      'Generate one inspiring quote.'
    );
    res.json(data);
  } catch (error) {
    console.error('Error generating quote:', error);
    res.status(500).json({ error: 'Failed to generate quote' });
  }
});

router.get('/bible-verse', async (req, res) => {
  try {
    const data = await generateContent(
      bibleVerseSchema,
      'Generate one meaningful Bible verse, including its reference (book, chapter, verse).'
    );
    res.json(data);
  } catch (error) {
    console.error('Error generating Bible verse:', error);
    res.status(500).json({ error: 'Failed to generate Bible verse' });
  }
});

export default router;