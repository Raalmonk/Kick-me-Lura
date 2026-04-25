const API_BASE = '/api';
const TOKEN_STORAGE_KEY = 'wcl_oauth_token';

const output = document.querySelector('#output');
const authGate = document.querySelector('#authGate');
const analysisUI = document.querySelector('#analysisUI');

function getTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token');
}

function cleanTokenFromAddressBar() {
  const url = new URL(window.location.href);
  url.searchParams.delete('token');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function getUserToken() {
  const fromUrl = getTokenFromUrl();
  if (fromUrl) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, fromUrl);
    cleanTokenFromAddressBar();
    return fromUrl;
  }

  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

function updateAuthUi() {
  const token = getUserToken();
  if (!token) {
    authGate.classList.remove('hidden');
    analysisUI.classList.add('hidden');
    output.textContent = 'Please login with Warcraft Logs to begin analysis.';
    return null;
  }

  authGate.classList.add('hidden');
  analysisUI.classList.remove('hidden');
  output.textContent = 'Ready. Enter report code and click Analyze.';
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
  const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) {
    updateAuthUi();
    return;
  }

  const reportCode = document.querySelector('#reportCode').value.trim();
  const rosterText = document.querySelector('#roster').value;

  output.textContent = 'Loading...';

  const response = await fetch(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
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

document.querySelector('#analyzeLast').addEventListener('click', () => call('analyze/last-pull'));
document.querySelector('#analyzeNight').addEventListener('click', () => call('analyze/night'));

updateAuthUi();
