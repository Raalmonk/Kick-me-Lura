import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeReport } from './analyzer.js';
import { exchangeAuthCodeForToken } from './wclClient.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8080);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../../frontend');

const OAUTH_CLIENT_ID = process.env.WCL_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.WCL_CLIENT_SECRET;
const REDIRECT_URI = process.env.WCL_REDIRECT_URI || `http://localhost:${port}/api/callback`;

function extractBearerToken(req) {
  const auth = req.headers.authorization || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim();
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(frontendDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'kick-me-lura-backend' });
});

app.get('/api/login', (_req, res) => {
  if (!OAUTH_CLIENT_ID) {
    return res.status(500).json({ error: 'WCL_CLIENT_ID is not configured.' });
  }

  const authorizeUrl = new URL('https://www.warcraftlogs.com/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authorizeUrl.searchParams.set('response_type', 'code');

  return res.redirect(authorizeUrl.toString());
});

app.get('/api/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Missing code query parameter.' });
    }

    const tokenPayload = await exchangeAuthCodeForToken({
      code,
      clientId: OAUTH_CLIENT_ID,
      clientSecret: OAUTH_CLIENT_SECRET,
      redirectUri: REDIRECT_URI
    });

    const accessToken = tokenPayload.access_token;
    if (!accessToken) {
      return res.status(500).json({ error: 'Token exchange succeeded but no access_token was returned.' });
    }

    return res.redirect(`/?token=${encodeURIComponent(accessToken)}`);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/analyze/last-pull', async (req, res) => {
  try {
    const userToken = extractBearerToken(req);
    const { reportCode, rosterText } = req.body;

    if (!userToken) {
      return res.status(401).json({ error: 'Missing Authorization: Bearer <token> header.' });
    }
    if (!reportCode || !rosterText) {
      return res.status(400).json({ error: 'reportCode and rosterText are required.' });
    }

    const data = await analyzeReport({ reportCode, rosterText, userToken, lastPullOnly: true });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/analyze/night', async (req, res) => {
  try {
    const userToken = extractBearerToken(req);
    const { reportCode, rosterText } = req.body;

    if (!userToken) {
      return res.status(401).json({ error: 'Missing Authorization: Bearer <token> header.' });
    }
    if (!reportCode || !rosterText) {
      return res.status(400).json({ error: 'reportCode and rosterText are required.' });
    }

    const data = await analyzeReport({ reportCode, rosterText, userToken, lastPullOnly: false });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Kick-me-Lura app listening on http://localhost:${port}`);
});
