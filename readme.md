# Daily Dose of Knowledge

Daily Dose of Knowledge is an Expo React Native app that provides short, AI-generated learning content in three categories:

- Trivia
- Vocabulary
- Quotes

The project contains a mobile frontend and an Express backend. The backend uses the Vercel AI SDK with OpenAI's `gpt-4o-mini` model and validates generated responses with Zod.

## Project Structure

```text
frontend/   Expo React Native application
backend/    Express API and AI content generation service
```

## Prerequisites

- Node.js 22 or later
- npm
- Expo Go, an Android emulator, or an iOS simulator for running the mobile app
- An OpenAI API key for running the backend locally

## Setup

Install dependencies in each part of the project:

```bash
cd backend
npm install

cd ../frontend
npm install
```

Create `backend/.env` with your OpenAI API key:

```env
OPENAI_API_KEY=your_openai_api_key
```

Do not commit `.env` files or API keys. They are excluded by the backend's `.gitignore` file.

## Running the Project

Start the backend from the `backend` directory:

```bash
npm start
```

The API listens on `http://localhost:3000` by default. Set the `PORT` environment variable to use another port.

Start the Expo frontend from a second terminal:

```bash
cd frontend
npm start
```

Useful frontend commands:

```bash
npm run android
npm run ios
npm run web
```

The frontend currently uses the deployed Render API configured in `frontend/api/content.ts`. To use a local backend, change `API_BASE_URL` there to `http://localhost:3000` (or the address reachable from your emulator or device).

## API Endpoints

All endpoints use `POST` requests under `/api` and return an array of generated items. The optional `count` value defaults to `1` and is capped at `20`.

| Endpoint | Request body fields | Response shape |
| --- | --- | --- |
| `/api/trivia` | `recentTrivias`, `count` | `{ question, answer }[]` |
| `/api/vocabulary` | `recentWords`, `count` | `{ word, definition }[]` |
| `/api/quote` | `recentQuotes`, `count` | `{ quote }[]` |

Example request:

```bash
curl -X POST http://localhost:3000/api/trivia \
  -H "Content-Type: application/json" \
  -d '{"recentTrivias": [], "count": 1}'
```

The `recent*` arrays are used to reduce repeated content. Items generated in the same batch are also excluded from subsequent generations in that request.

## Frontend Scripts

Run these commands from `frontend/`:

- `npm start` - Start the Expo development server
- `npm run android` - Start Expo for Android
- `npm run ios` - Start Expo for iOS
- `npm run web` - Start the web version

## Backend Scripts

Run these commands from `backend/`:

- `npm start` - Start the Express server
- `npm test` - Placeholder script; automated backend tests are not configured yet

## License

The frontend includes the project's existing license in [frontend/LICENSE](frontend/LICENSE).
