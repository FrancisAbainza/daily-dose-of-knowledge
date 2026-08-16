const API_BASE_URL = 'https://daily-dose-of-knowledge-backend-w1wo.onrender.com'; // TODO: replace with your Render URL

async function postContent<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

export type TriviaItem = { question: string; answer: string };
export type VocabularyItem = { word: string; definition: string };
export type QuoteItem = { quote: string };
export type BibleVerseItem = { verse: string };

// count defaults to 1 for backwards compatibility with existing callers.
// All four endpoints now return an array of length `count`.
export const fetchTrivia = (recentTrivias: string[] = [], count: number = 1) =>
  postContent<TriviaItem[]>('trivia', { recentTrivias, count });

export const fetchVocabulary = (recentWords: string[] = [], count: number = 1) =>
  postContent<VocabularyItem[]>('vocabulary', { recentWords, count });

export const fetchQuote = (recentQuotes: string[] = [], count: number = 1) =>
  postContent<QuoteItem[]>('quote', { recentQuotes, count });

export const fetchBibleVerse = (recentVerses: string[] = [], count: number = 1) =>
  postContent<BibleVerseItem[]>('bible-verse', { recentVerses, count });
