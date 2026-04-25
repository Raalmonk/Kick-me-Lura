import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { analyzeReport } from './analyzer.js';
import { exchangeAuthorizationCodeForToken } from './wclClient.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8080);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../../frontend');
const callbackUri = 'http://localhost:8080/api/callback';

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(frontendDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'kick-me-lura-backend' });
});

app.get('/api/login', (_req, res) => {
  const clientId = process.env.WCL_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'Missing WCL_CLIENT_ID in environment variables.' });
  }

  const authorizeUrl = new URL('https://www.warcraftlogs.com/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', callbackUri);
  authorizeUrl.searchParams.set('response_type', 'code');

  return res.redirect(authorizeUrl.toString());
});

app.get('/api/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Missing OAuth authorization code.' });
    }

    const tokenResponse = await exchangeAuthorizationCodeForToken(String(code), callbackUri);
    const accessToken = tokenResponse.access_token;

    if (!accessToken) {
      return res.status(500).json({ error: 'No access token returned from OAuth provider.' });
    }

    return res.redirect(`/?token=${encodeURIComponent(accessToken)}`);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/analyze/last-pull', async (req, res) => {
  try {
    const { reportCode, rosterText } = req.body;
    const accessToken = getBearerToken(req);

    if (!accessToken) {
      return res.status(401).json({ error: 'Missing Authorization Bearer token.' });
    }

    if (!reportCode || !rosterText) {
      return res.status(400).json({ error: 'reportCode and rosterText are required.' });
    }

    const data = await analyzeReport({ reportCode, rosterText, lastPullOnly: true, accessToken });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/analyze/night', async (req, res) => {
  try {
    const { reportCode, rosterText } = req.body;
    const accessToken = getBearerToken(req);

    if (!accessToken) {
      return res.status(401).json({ error: 'Missing Authorization Bearer token.' });
    }

    if (!reportCode || !rosterText) {
      return res.status(400).json({ error: 'reportCode and rosterText are required.' });
    }

    const data = await analyzeReport({ reportCode, rosterText, lastPullOnly: false, accessToken });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Kick-me-Lura app listening on http://localhost:${port}`);
});
