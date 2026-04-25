const API_BASE = 'http://localhost:8080/api';

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
  const reportCode = document.querySelector('#reportCode').value.trim();
  const rosterText = document.querySelector('#roster').value;
  const output = document.querySelector('#output');

  output.textContent = 'Loading...';

  const response = await fetch(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
