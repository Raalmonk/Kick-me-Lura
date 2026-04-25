import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { analyzeReport } from './analyzer.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8080);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'kick-me-lura-backend' });
});

app.post('/api/analyze/last-pull', async (req, res) => {
  try {
    const { reportCode, rosterText } = req.body;
    if (!reportCode || !rosterText) {
      return res.status(400).json({ error: 'reportCode and rosterText are required.' });
    }

    const data = await analyzeReport({ reportCode, rosterText, lastPullOnly: true });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/analyze/night', async (req, res) => {
  try {
    const { reportCode, rosterText } = req.body;
    if (!reportCode || !rosterText) {
      return res.status(400).json({ error: 'reportCode and rosterText are required.' });
    }

    const data = await analyzeReport({ reportCode, rosterText, lastPullOnly: false });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Kick-me-Lura backend listening on port ${port}`);
});
