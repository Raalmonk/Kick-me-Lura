import { wclGraphql } from './wclClient.js';
import { INTERRUPT_AND_CAST_EVENTS, PLAYER_INFO_IN_FIGHT, REPORT_FIGHTS_AND_ACTORS } from './queries.js';

const INTERRUPT_BY_CLASS = {
  Mage: 2139,
  'Death Knight': 47528,
  'Demon Hunter': 183752,
  Hunter: 147362,
  Evoker: 351338,
  Shaman: 57994,
  Warrior: 6552,
  Rogue: 1766,
  Warlock: 89766
};

const WAVES = [
  { wave: 1, startMs: 5000, endMs: 25000 },
  { wave: 2, startMs: 67000, endMs: 87000 },
  { wave: 3, startMs: 129000, endMs: 149000 }
];

function normalize(name) {
  return String(name || '').trim().toLowerCase();
}

export function parseRoster(raw) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^intstart$/i.test(line) && !/^intend$/i.test(line));

  if (lines.length !== 3) {
    throw new Error('Roster must contain exactly 3 assignment lines between intstart and Intend.');
  }

  return lines.map((line, idx) => {
    const players = line.split(/\s+/).filter(Boolean);
    if (players.length !== 4) {
      throw new Error(`Row ${idx + 1} must contain exactly 4 player names.`);
    }
    return players;
  });
}

function extractClasses(playerDetailsJson) {
  if (!playerDetailsJson) return {};
  const result = {};

  const details = typeof playerDetailsJson === 'string' ? JSON.parse(playerDetailsJson) : playerDetailsJson;
  const all = [...(details.tanks || []), ...(details.healers || []), ...(details.dps || [])];

  for (const p of all) {
    result[normalize(p.name)] = {
      name: p.name,
      className: p.type,
      server: p.server,
      spec: p.specs?.[0]?.spec
    };
  }

  return result;
}

function buildActorMaps(actors) {
  const byId = new Map();
  const petToOwner = new Map();

  for (const actor of actors || []) {
    byId.set(actor.id, actor);
    if (actor.petOwner) {
      petToOwner.set(actor.id, actor.petOwner);
    }
  }

  return { byId, petToOwner };
}

function buildAssignmentMetadata(rosterRows, classMap) {
  return rosterRows.map((row, rowIndex) =>
    row.map((name, orderIndex) => {
      const p = classMap[normalize(name)] || {};
      const className = p.className || 'Unknown';
      const spellId = INTERRUPT_BY_CLASS[className];
      return {
        row: rowIndex + 1,
        order: orderIndex + 1,
        assignedName: name,
        normalized: normalize(name),
        className,
        interruptSpellId: spellId
      };
    })
  );
}

function parseEvents(eventsJson) {
  if (!eventsJson) return [];
  const payload = typeof eventsJson === 'string' ? JSON.parse(eventsJson) : eventsJson;
  return payload?.data || [];
}

function isInWave(relativeMs) {
  return WAVES.find((w) => relativeMs >= w.startMs && relativeMs <= w.endMs) || null;
}

function indexInterrupts(interruptEvents, reportStart, actorMaps) {
  const indexed = [];

  for (const evt of interruptEvents) {
    const relativeMs = evt.timestamp - reportStart;
    const wave = isInWave(relativeMs);
    if (!wave) continue;

    const sourceActor = actorMaps.byId.get(evt.sourceID);
    const ownerId = actorMaps.petToOwner.get(evt.sourceID);
    const ownerActor = ownerId ? actorMaps.byId.get(ownerId) : null;

    indexed.push({
      ...evt,
      eventType: 'interrupt',
      wave: wave.wave,
      relativeMs,
      sourceEffectiveName: ownerActor?.name || sourceActor?.name,
      sourceEffectiveId: ownerActor?.id || sourceActor?.id,
      sourceOriginalName: sourceActor?.name,
      targetName: evt.target?.name || evt.targetName,
      targetID: evt.target?.id || evt.targetID,
      targetInstance: evt.target?.instance || evt.targetInstance
    });
  }

  return indexed;
}

function indexCasts(castEvents, reportStart, actorMaps) {
  return castEvents
    .map((evt) => {
      const relativeMs = evt.timestamp - reportStart;
      const wave = isInWave(relativeMs);
      if (!wave) return null;

      const sourceActor = actorMaps.byId.get(evt.sourceID);
      const ownerId = actorMaps.petToOwner.get(evt.sourceID);
      const ownerActor = ownerId ? actorMaps.byId.get(ownerId) : null;

      return {
        ...evt,
        eventType: 'cast',
        wave: wave.wave,
        relativeMs,
        sourceEffectiveName: ownerActor?.name || sourceActor?.name,
        sourceEffectiveId: ownerActor?.id || sourceActor?.id,
        targetName: evt.target?.name || evt.targetName,
        targetID: evt.target?.id || evt.targetID,
        targetInstance: evt.target?.instance || evt.targetInstance
      };
    })
    .filter(Boolean);
}

function buildRowToInstanceMap(interrupts, assignments) {
  const map = new Map();
  const rows = [1, 2, 3];

  for (const wave of [1, 2, 3]) {
    const waveInts = interrupts.filter((e) => e.wave === wave && /Termination Matrix/i.test(e.targetName || ''));
    const instances = [...new Set(waveInts.map((e) => `${e.targetID}:${e.targetInstance}`))];

    for (const key of instances) {
      const keyInts = waveInts.filter((e) => `${e.targetID}:${e.targetInstance}` === key);
      const interrupterNames = new Set(keyInts.map((e) => normalize(e.sourceEffectiveName)));

      let bestRow = null;
      let bestScore = -1;

      for (const row of rows) {
        const assigned = assignments[row - 1].map((a) => a.normalized);
        const score = assigned.filter((n) => interrupterNames.has(n)).length;
        if (score > bestScore) {
          bestScore = score;
          bestRow = row;
        }
      }

      if (bestRow) {
        map.set(`${wave}|${key}`, bestRow);
      }
    }
  }

  return map;
}

function evaluateWave(wave, interrupts, casts, assignments, rowInstanceMap) {
  const findings = [];
  const timeline = [];

  const waveInterrupts = interrupts.filter((e) => e.wave === wave).sort((a, b) => a.timestamp - b.timestamp);
  const waveCasts = casts.filter((e) => e.wave === wave);

  // Rule 1 + Rule 4 + Rule 3
  const byRow = new Map();
  for (const intEvt of waveInterrupts) {
    if (/Lu'ra/i.test(intEvt.targetName || '')) {
      findings.push({
        wave,
        type: 'Wrong Target',
        player: intEvt.sourceEffectiveName,
        detail: `${intEvt.sourceEffectiveName} interrupted Lu'ra instead of Termination Matrix.`
      });
      timeline.push({ ok: false, wave, timestamp: intEvt.relativeMs, text: `[W${wave}] ❌ Wrong Target: ${intEvt.sourceEffectiveName} -> Lu'ra` });
      continue;
    }

    if (!/Termination Matrix/i.test(intEvt.targetName || '')) continue;
    const row = rowInstanceMap.get(`${wave}|${intEvt.targetID}:${intEvt.targetInstance}`);
    if (!row) continue;

    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push(intEvt);
  }

  for (const [row, rowEvents] of byRow.entries()) {
    const assignedRow = assignments[row - 1];
    const expectedByOrder = new Map(assignedRow.map((a) => [a.order, a]));

    let expectedOrder = 1;
    for (const evt of rowEvents) {
      const actorNorm = normalize(evt.sourceEffectiveName);
      const assignmentEntry = assignedRow.find((a) => a.normalized === actorNorm);

      if (!assignmentEntry) {
        const expected = expectedByOrder.get(expectedOrder);
        findings.push({
          wave,
          row,
          type: 'Unassigned Kick',
          player: evt.sourceEffectiveName,
          detail: `${evt.sourceEffectiveName} kicked in row ${row} but was not assigned. Expected: ${expected?.assignedName || 'unknown'}.`
        });
        timeline.push({ ok: false, wave, timestamp: evt.relativeMs, text: `[W${wave}] ❌ Unassigned Kick: ${evt.sourceEffectiveName} (expected ${expected?.assignedName || 'unknown'})` });
        continue;
      }

      if (assignmentEntry.order !== expectedOrder) {
        const expected = expectedByOrder.get(expectedOrder);
        findings.push({
          wave,
          row,
          type: 'Wrong Order',
          player: evt.sourceEffectiveName,
          detail: `${evt.sourceEffectiveName} (order ${assignmentEntry.order}) interrupted before ${expected?.assignedName || 'expected player'} (order ${expectedOrder}).`
        });
        timeline.push({ ok: false, wave, timestamp: evt.relativeMs, text: `[W${wave}] ❌ Wrong Order: ${evt.sourceEffectiveName} kicked before ${expected?.assignedName || 'expected player'}` });
      } else {
        timeline.push({ ok: true, wave, timestamp: evt.relativeMs, text: `[W${wave}] ✅ ${evt.sourceEffectiveName} successful interrupt in correct order (${expectedOrder})` });
        expectedOrder += 1;
      }
    }

    // Missed kicks
    for (let missedOrder = expectedOrder; missedOrder <= 4; missedOrder += 1) {
      const expected = expectedByOrder.get(missedOrder);
      findings.push({
        wave,
        row,
        type: 'Missed Kick',
        player: expected?.assignedName,
        detail: `${expected?.assignedName || 'Unknown'} did not land assigned kick #${missedOrder} in row ${row}.`
      });
      timeline.push({ ok: false, wave, timestamp: null, text: `[W${wave}] ❌ Missed Kick: ${expected?.assignedName || 'Unknown'} missed order ${missedOrder} (row ${row})` });
    }
  }

  // Rule 2 (Early Kick cast w/o interrupt)
  for (const castEvt of waveCasts) {
    const spellId = castEvt.abilityGameID || castEvt.ability?.gameID;
    if (!Object.values(INTERRUPT_BY_CLASS).includes(spellId)) continue;

    const hasMatchingInterrupt = waveInterrupts.some((i) =>
      normalize(i.sourceEffectiveName) === normalize(castEvt.sourceEffectiveName) &&
      Math.abs(i.timestamp - castEvt.timestamp) <= 800 &&
      (i.targetID === castEvt.targetID || i.targetInstance === castEvt.targetInstance)
    );

    if (!hasMatchingInterrupt) {
      findings.push({
        wave,
        type: 'Early Kick',
        player: castEvt.sourceEffectiveName,
        detail: `${castEvt.sourceEffectiveName} cast interrupt at ${castEvt.relativeMs}ms but no interrupt landed.`
      });
      timeline.push({ ok: false, wave, timestamp: castEvt.relativeMs, text: `[W${wave}] ❌ Early Kick: ${castEvt.sourceEffectiveName} cast with no successful interrupt` });
    }
  }

  return { findings, timeline };
}

export async function analyzeReport({ reportCode, rosterText, lastPullOnly = true }) {
  const rosterRows = parseRoster(rosterText);

  const reportData = await wclGraphql(REPORT_FIGHTS_AND_ACTORS, { code: reportCode });
  const report = reportData.reportData.report;

  const luraFights = (report.fights || []).filter((f) => /lu'?ra/i.test(f.name || ''));
  if (!luraFights.length) {
    throw new Error('No Lu\'ra pulls found in this report.');
  }

  const selectedFights = lastPullOnly ? [luraFights[luraFights.length - 1]] : luraFights;
  const actorMaps = buildActorMaps(report.masterData?.actors || []);

  const allFightResults = [];
  const nightlySummary = {
    'Wrong Target': 0,
    'Early Kick': 0,
    'Missed Kick': 0,
    'Wrong Order': 0,
    'Unassigned Kick': 0
  };
  const wallOfShame = new Map();

  for (const fight of selectedFights) {
    const fightID = fight.id;

    const playerInfo = await wclGraphql(PLAYER_INFO_IN_FIGHT, {
      code: reportCode,
      fightIDs: [fightID]
    });

    const classMap = extractClasses(playerInfo.reportData.report.playerDetails);
    const assignments = buildAssignmentMetadata(rosterRows, classMap);

    const eventsResp = await wclGraphql(INTERRUPT_AND_CAST_EVENTS, {
      code: reportCode,
      startTime: fight.startTime,
      endTime: fight.endTime
    });

    const castEventsRaw = parseEvents(eventsResp.reportData.report.castEvents?.data);
    const interruptEventsRaw = parseEvents(eventsResp.reportData.report.interruptEvents?.data);

    const casts = indexCasts(castEventsRaw, fight.startTime, actorMaps);
    const interrupts = indexInterrupts(interruptEventsRaw, fight.startTime, actorMaps);

    const rowInstanceMap = buildRowToInstanceMap(interrupts, assignments);

    const combinedFindings = [];
    const combinedTimeline = [];

    for (const w of [1, 2, 3]) {
      const { findings, timeline } = evaluateWave(w, interrupts, casts, assignments, rowInstanceMap);
      combinedFindings.push(...findings);
      combinedTimeline.push(...timeline);
    }

    combinedTimeline.sort((a, b) => (a.timestamp ?? 999999999) - (b.timestamp ?? 999999999));

    for (const finding of combinedFindings) {
      nightlySummary[finding.type] = (nightlySummary[finding.type] || 0) + 1;
      if (finding.player) {
        wallOfShame.set(finding.player, (wallOfShame.get(finding.player) || 0) + 1);
      }
    }

    allFightResults.push({
      fightId: fightID,
      fightName: fight.name,
      startTime: fight.startTime,
      endTime: fight.endTime,
      findings: combinedFindings,
      timeline: combinedTimeline,
      assignments
    });
  }

  return {
    reportTitle: report.title,
    fightsAnalyzed: allFightResults.length,
    results: allFightResults,
    nightlySummary,
    wallOfShame: [...wallOfShame.entries()]
      .map(([player, errors]) => ({ player, errors }))
      .sort((a, b) => b.errors - a.errors)
  };
}
