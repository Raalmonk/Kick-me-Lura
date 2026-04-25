const API_BASE = '/api';
const TOKEN_KEY = 'wcl_access_token';

function getTokenFromUrl() {
  const url = new URL(window.location.href);
  return url.searchParams.get('token');
}

function cleanTokenFromUrl() {
  const url = new URL(window.location.href);
  if (url.searchParams.has('token')) {
    url.searchParams.delete('token');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }
}

function getStoredToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function setStoredToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

function setUiAuthenticated(isAuthenticated) {
  document.querySelector('#loginSection').hidden = isAuthenticated;
  document.querySelector('#analysisSection').hidden = !isAuthenticated;

  if (!isAuthenticated) {
    document.querySelector('#output').textContent = 'Please log in with Warcraft Logs first.';
  }
}

function initializeAuth() {
  const tokenFromUrl = getTokenFromUrl();
  if (tokenFromUrl) {
    setStoredToken(tokenFromUrl);
    cleanTokenFromUrl();
  }

  const token = getStoredToken();
  setUiAuthenticated(Boolean(token));
  return token;
}

function formatTimeline(results) {
  const lines = [];

  for (const fight of results.results || []) {
    lines.push(`Fight #${fight.fightId} (${fight.fightName})`);
    lines.push('--- Timeline ---');
    for (const item of fight.timeline || []) {
      const ts = item.timestamp == null ? 'n/a' : `${(item.timestamp / 1000).toFixed(2)}s`;
      lines.push(`${ts} ${item.text}`);
    }
    lines.push('--- Findings ---');
    for (const f of fight.findings || []) {
      lines.push(`[Wave ${f.wave}] ${f.type}: ${f.detail}`);
    }
    lines.push('');
  }

  if (results.nightlySummary) {
    lines.push('=== Whole Night Summary ===');
    for (const [key, value] of Object.entries(results.nightlySummary)) {
      lines.push(`${key}: ${value}`);
    }

    lines.push('=== Wall of Shame ===');
    for (const x of results.wallOfShame || []) {
      lines.push(`${x.player}: ${x.errors}`);
    }
  }

  return lines.join('\n');
}

async function call(endpoint) {
  const accessToken = getStoredToken();
  const output = document.querySelector('#output');

  if (!accessToken) {
    setUiAuthenticated(false);
    return;
  }

  const reportCode = document.querySelector('#reportCode').value.trim();
  const rosterText = document.querySelector('#roster').value;

  output.textContent = 'Loading...';

  const response = await fetch(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ reportCode, rosterText })
  });

  const json = await response.json();
  if (!response.ok) {
    output.textContent = `Error: ${json.error || 'Unknown API error'}`;
    return;
  }

  output.textContent = formatTimeline(json);
}

initializeAuth();

document.querySelector('#analyzeLast').addEventListener('click', () => call('analyze/last-pull'));
document.querySelector('#analyzeNight').addEventListener('click', () => call('analyze/night'));
