import dotenv from 'dotenv';

dotenv.config();

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const GRAPHQL_URL = 'https://www.warcraftlogs.com/api/v2/client';

let tokenCache = {
  accessToken: null,
  expiresAt: 0
};

async function fetchAccessToken() {
  const clientId = process.env.WCL_CLIENT_ID;
  const clientSecret = process.env.WCL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing WCL_CLIENT_ID or WCL_CLIENT_SECRET in environment variables.');
  }

  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 30_000) {
    return tokenCache.accessToken;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token request failed: ${response.status} ${text}`);
  }

  const json = await response.json();
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: now + (json.expires_in || 3600) * 1000
  };

  return tokenCache.accessToken;
}

export async function wclGraphql(query, variables = {}) {
  const token = await fetchAccessToken();
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });

  const json = await response.json();
  if (!response.ok || json.errors) {
    throw new Error(`GraphQL request failed: ${response.status} ${JSON.stringify(json.errors || json)}`);
  }
  return json.data;
}
