import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { meRouter } from './routes/me.js';

const app = express();
const port = process.env.PORT ?? 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());

app.use('/health', healthRouter);
app.use('/me', meRouter);

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});

export { app };
