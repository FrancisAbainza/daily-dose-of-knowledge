const API_BASE_URL = 'https://daily-dose-of-knowledge-backend-w1wo.onrender.com'; // TODO: replace with your Render URL

async function postContent<T>(
  endpoint: string,
  bodyKey: string,
  recentItems: string[]
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ [bodyKey]: recentItems }),
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

export const fetchTrivia = (recentTrivias: string[] = []) =>
  postContent<TriviaItem>('trivia', 'recentTrivias', recentTrivias);

export const fetchVocabulary = (recentWords: string[] = []) =>
  postContent<VocabularyItem>('vocabulary', 'recentWords', recentWords);

export const fetchQuote = (recentQuotes: string[] = []) =>
  postContent<QuoteItem>('quote', 'recentQuotes', recentQuotes);

export const fetchBibleVerse = (recentVerses: string[] = []) =>
  postContent<BibleVerseItem>('bible-verse', 'recentVerses', recentVerses);