const GRAPHQL_URL = 'https://www.warcraftlogs.com/api/v2/client';

export async function wclGraphql(userAccessToken, query, variables = {}) {
  if (!userAccessToken) {
    throw new Error('Missing user OAuth token. Please login with Warcraft Logs first.');
  }

  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
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

export async function exchangeAuthCodeForToken({ code, clientId, clientSecret, redirectUri }) {
  if (!code) {
    throw new Error('Missing OAuth code.');
  }
  if (!clientId || !clientSecret) {
    throw new Error('Missing WCL OAuth client credentials in environment variables.');
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://www.warcraftlogs.com/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    })
  });

  const tokenJson = await response.json();
  if (!response.ok) {
    throw new Error(`OAuth token exchange failed: ${response.status} ${JSON.stringify(tokenJson)}`);
  }

  return tokenJson;
}
