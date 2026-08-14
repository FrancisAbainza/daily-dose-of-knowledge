import express from 'express';
import dotenv from 'dotenv';
import contentRouter from './routes/content.js';
import { apiLimiter } from './middleware/rateLimiter.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // trust first proxy (Render's load balancer)

app.use(express.json());
app.use('/api', apiLimiter, contentRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});