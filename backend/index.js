import express from 'express';
import dotenv from 'dotenv';
import contentRouter from './routes/content.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api/content', contentRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});