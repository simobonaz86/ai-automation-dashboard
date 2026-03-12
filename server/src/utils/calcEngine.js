import db from '../db.js';

/**
 * Interpolate monthly values from quarterly milestones.
 */
export function interpolateMonthlyCurve(milestones, launchMonth, interpolation = 'linear') {
  const result = {};
  const launch = new Date(launchMonth);
  const launchIdx = (launch.getFullYear() - 2026) * 12 + launch.getMonth();

  const points = [];
  for (const ms of milestones.sort((a, b) => a.year - b.year)) {
    const decIdx = (ms.year - 2026) * 12 + 11;
    points.push({ idx: decIdx, value: ms.q4_value });
  }

  for (let i = 0; i < 48; i++) {
    const year = 2026 + Math.floor(i / 12);
    const month = (i % 12) + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;

    if (i < launchIdx) { result[key] = 0; continue; }

    let value = 0;
    if (points.length === 0) {
      value = 0;
    } else if (i >= points[points.length - 1].idx) {
      value = points[points.length - 1].value;
    } else {
      let left = { idx: Math.max(launchIdx - 1, -1), value: 0 };
      let right = points[0];
      for (let p = 0; p < points.length; p++) {
        if (points[p].idx >= i) {
          right = points[p];
          left = p > 0 ? points[p - 1] : { idx: Math.max(launchIdx - 1, 0), value: 0 };
          break;
        }
      }
      const span = right.idx - left.idx;
      const progress = span > 0 ? (i - left.idx) / span : 1;
      if (interpolation === 'step') value = left.value;
      else if (interpolation === 's_curve') { const s = progress * progress * (3 - 2 * progress); value = left.value + (right.value - left.value) * s; }
      else value = left.value + (right.value - left.value) * progress;
    }
    result[key] = Math.round(value * 100) / 100;
  }
  return result;
}

function getEffectiveAllocation(stepId, regionId) {
  let pct = 1.0;
  let currentId = stepId;
  while (currentId) {
    const alloc = db.prepare(`
      SELECT allocation_pct FROM step_allocations
      WHERE step_id = ? AND (region_id = ? OR region_id IS NULL)
      ORDER BY CASE WHEN region_id IS NOT NULL THEN 0 ELSE 1 END LIMIT 1
    `).get(currentId, regionId);
    if (alloc) pct *= alloc.allocation_pct / 100;
    const step = db.prepare('SELECT parent_id FROM process_steps WHERE id = ?').get(currentId);
    currentId = step ? step.parent_id : null;
  }
  return pct;
}

function getGrowthRate(regionId, teamId, year, version) {
  const specific = db.prepare(`
    SELECT growth_pct FROM growth_rates
    WHERE year = ? AND version = ?
    AND (region_id = ? OR region_id IS NULL)
    AND (team_id = ? OR team_id IS NULL)
    ORDER BY
      CASE WHEN region_id IS NOT NULL AND team_id IS NOT NULL THEN 0
           WHEN region_id IS NOT NULL THEN 1
           WHEN team_id IS NOT NULL THEN 2
           ELSE 3 END
    LIMIT 1
  `).get(year, version, regionId, teamId);
  return specific ? specific.growth_pct : 0;
}

function getRawFTE2026(teamId, regionId, month, version) {
  const raw = db.prepare(`
    SELECT fte_value FROM fte_baselines
    WHERE team_id = ? AND region_id = ? AND year = 2026 AND month = ? AND version = ?
  `).get(teamId, regionId, month, version);
  return raw ? raw.fte_value : 0;
}

function applyTransfers(rawFte, teamId, regionId, sourceTeamFtes) {
  const outbound = db.prepare(`
    SELECT COALESCE(SUM(transfer_pct), 0) as total_out FROM team_transfers
    WHERE source_team_id = ? AND region_id = ?
  `).get(teamId, regionId);

  const inbound = db.prepare(`
    SELECT source_team_id, transfer_pct FROM team_transfers
    WHERE target_team_id = ? AND region_id = ?
  `).all(teamId, regionId);

  let netFte = rawFte * (1 - (outbound.total_out || 0) / 100);
  for (const ib of inbound) {
    const sourceFte = sourceTeamFtes[ib.source_team_id] || 0;
    netFte += sourceFte * (ib.transfer_pct / 100);
  }
  return netFte;
}

/**
 * Main calculation with sequential year computation.
 * 2026 = manual baseline. 2027+ = (prior net FTE) × (1 + growth%).
 * AI savings are subtracted before computing next year's baseline.
 */
export function calculateScenario(scenarioId) {
  const scenario = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(scenarioId);
  if (!scenario) throw new Error('Scenario not found');

  const agentSet = JSON.parse(scenario.agent_set);
  const regions = db.prepare('SELECT * FROM regions WHERE is_active = 1 ORDER BY sort_order').all();
  const teams = db.prepare('SELECT * FROM teams').all();
  const leafSteps = db.prepare(`
    SELECT ps.* FROM process_steps ps
    WHERE ps.is_automatable = 1 AND ps.is_active = 1
    AND NOT EXISTS (SELECT 1 FROM process_steps child WHERE child.parent_id = ps.id)
  `).all();

  // Pre-compute all agent assumption curves
  const agentCurves = {};
  for (const agentId of agentSet) {
    const agent = db.prepare('SELECT * FROM ai_agents WHERE id = ?').get(agentId);
    if (!agent) continue;
    const getProfile = (metric) => {
      const override = db.prepare(`
        SELECT milestones, interpolation FROM scenario_overrides
        WHERE scenario_id = ? AND agent_id = ? AND metric = ?
        AND region_id IS NULL
        ORDER BY CASE WHEN region_id IS NOT NULL THEN 0 ELSE 1 END LIMIT 1
      `).get(scenarioId, agentId, metric);
      if (override) return override;
      return db.prepare(`
        SELECT milestones, launch_month, interpolation FROM assumption_profiles
        WHERE agent_id = ? AND metric = ? AND region_id IS NULL
        ORDER BY CASE WHEN region_id IS NOT NULL THEN 0 ELSE 1 END LIMIT 1
      `).get(agentId, metric);
    };
    const minP = getProfile('min_automation');
    const maxP = getProfile('max_automation');
    const adoptP = getProfile('adoption');
    if (!minP || !maxP || !adoptP) continue;
    const launchMonth = minP.launch_month || adoptP.launch_month || agent.launch_date || '2026-01-01';
    agentCurves[agentId] = {
      agent,
      min: interpolateMonthlyCurve(JSON.parse(minP.milestones), launchMonth, minP.interpolation),
      max: interpolateMonthlyCurve(JSON.parse(maxP.milestones), launchMonth, maxP.interpolation),
      adoption: interpolateMonthlyCurve(JSON.parse(adoptP.milestones), launchMonth, adoptP.interpolation),
    };
  }

  // Pre-compute step allocations
  const stepAllocCache = {};
  for (const step of leafSteps) {
    stepAllocCache[step.id] = {};
    for (const region of regions) {
      stepAllocCache[step.id][region.id] = getEffectiveAllocation(step.id, region.id);
    }
  }

  // Pre-compute step-agent assignments
  const stepAgents = {};
  for (const step of leafSteps) {
    stepAgents[step.id] = db.prepare(`
      SELECT asa.agent_id FROM agent_step_assignments asa
      WHERE asa.step_id = ? AND asa.is_active = 1
      AND (asa.region_id IS NULL)
      AND asa.agent_id IN (${agentSet.map(() => '?').join(',') || "''"})
    `).all(step.id, ...agentSet).map(a => a.agent_id).filter(id => agentCurves[id]);
  }

  const results = {
    scenario: { id: scenario.id, name: scenario.name },
    byRegion: {}, byTeam: {}, byStep: {}, byAgent: {},
    monthly: {}, totals: { min: 0, max: 0, baseline: 0, preAiBaseline: 0 },
    yearlyTotals: {},
  };

  for (const y of [2026, 2027, 2028, 2029]) {
    results.yearlyTotals[y] = { min: 0, max: 0, baseline: 0, preAiBaseline: 0, grossMin: 0, grossMax: 0 };
  }

  // netFtePrior[regionId][teamId][month] = net FTE from prior year (after savings)
  // Used as input for computing next year's baseline
  const netFtePrior = {};

  for (const year of [2026, 2027, 2028, 2029]) {
    const netFteThisYear = {};

    for (const region of regions) {
      if (!results.byRegion[region.id]) {
        results.byRegion[region.id] = { id: region.id, name: region.name, code: region.code, min: 0, max: 0, baseline: 0, preAiBaseline: 0, yearly: {} };
      }
      if (!results.byRegion[region.id].yearly[year]) {
        results.byRegion[region.id].yearly[year] = { min: 0, max: 0, baseline: 0, preAiBaseline: 0 };
      }
      if (!netFteThisYear[region.id]) netFteThisYear[region.id] = {};

      const rawTeamFtes = {};
      for (const team of teams) {
        if (!results.byTeam[team.id]) {
          results.byTeam[team.id] = { id: team.id, name: team.name, code: team.code, min: 0, max: 0, baseline: 0, yearly: {} };
        }
        if (!results.byTeam[team.id].yearly[year]) {
          results.byTeam[team.id].yearly[year] = { min: 0, max: 0, baseline: 0 };
        }
        if (!netFteThisYear[region.id][team.id]) netFteThisYear[region.id][team.id] = {};

        for (let month = 1; month <= 12; month++) {
          let rawFte;
          if (year === 2026) {
            rawFte = getRawFTE2026(team.id, region.id, month, scenario.baseline_version);
          } else {
            const priorNet = netFtePrior[region.id]?.[team.id]?.[month] ?? 0;
            const growth = getGrowthRate(region.id, team.id, year, scenario.baseline_version);
            rawFte = priorNet * (1 + growth / 100);
          }
          rawTeamFtes[team.id] = rawFte;
        }
      }

      for (const team of teams) {
        for (let month = 1; month <= 12; month++) {
          const monthKey = `${year}-${String(month).padStart(2, '0')}`;

          let rawFte;
          if (year === 2026) {
            rawFte = getRawFTE2026(team.id, region.id, month, scenario.baseline_version);
          } else {
            const priorNet = netFtePrior[region.id]?.[team.id]?.[month] ?? 0;
            const growth = getGrowthRate(region.id, team.id, year, scenario.baseline_version);
            rawFte = priorNet * (1 + growth / 100);
          }

          // Recompute rawTeamFtes for transfer calculation
          const allRawFtes = {};
          for (const t of teams) {
            if (year === 2026) {
              allRawFtes[t.id] = getRawFTE2026(t.id, region.id, month, scenario.baseline_version);
            } else {
              const pn = netFtePrior[region.id]?.[t.id]?.[month] ?? 0;
              const g = getGrowthRate(region.id, t.id, year, scenario.baseline_version);
              allRawFtes[t.id] = pn * (1 + g / 100);
            }
          }

          const netFte = applyTransfers(rawFte, team.id, region.id, allRawFtes);

          if (!results.monthly[monthKey]) results.monthly[monthKey] = { min: 0, max: 0, baseline: 0 };
          results.monthly[monthKey].baseline += netFte;

          const addBaseline = (obj, val) => { obj.baseline += val; };
          addBaseline(results.byRegion[region.id].yearly[year], netFte / 12);
          addBaseline(results.byRegion[region.id], netFte / 48);
          addBaseline(results.byTeam[team.id].yearly[year], netFte / 12);
          addBaseline(results.byTeam[team.id], netFte / 48);
          addBaseline(results.yearlyTotals[year], netFte / 12);
          results.totals.baseline += netFte / 48;

          let totalMinSaved = 0;
          let totalMaxSaved = 0;

          for (const step of leafSteps.filter(s => s.team_id === team.id)) {
            const allocFrac = stepAllocCache[step.id][region.id];
            const fteAllocated = netFte * allocFrac;

            if (!results.byStep[step.id]) {
              results.byStep[step.id] = { id: step.id, name: step.name, teamId: team.id, min: 0, max: 0, allocated: 0, yearly: {} };
            }
            if (!results.byStep[step.id].yearly[year]) {
              results.byStep[step.id].yearly[year] = { min: 0, max: 0, allocated: 0 };
            }
            results.byStep[step.id].allocated += fteAllocated / 48;
            results.byStep[step.id].yearly[year].allocated += fteAllocated / 12;

            for (const agentId of (stepAgents[step.id] || [])) {
              const curves = agentCurves[agentId];
              if (!curves) continue;

              if (!results.byAgent[agentId]) {
                results.byAgent[agentId] = {
                  id: agentId, name: curves.agent.name, status: curves.agent.status,
                  min: 0, max: 0, entitlement: 0, yearly: {}
                };
              }
              if (!results.byAgent[agentId].yearly[year]) {
                results.byAgent[agentId].yearly[year] = { min: 0, max: 0, entitlement: 0 };
              }
              results.byAgent[agentId].entitlement += fteAllocated / 48;
              results.byAgent[agentId].yearly[year].entitlement += fteAllocated / 12;

              const adoptPct = (curves.adoption[monthKey] || 0) / 100;
              const minAutoPct = (curves.min[monthKey] || 0) / 100;
              const maxAutoPct = (curves.max[monthKey] || 0) / 100;

              const savedMin = fteAllocated * adoptPct * minAutoPct;
              const savedMax = fteAllocated * adoptPct * maxAutoPct;

              totalMinSaved += savedMin;
              totalMaxSaved += savedMax;

              results.monthly[monthKey].min += savedMin;
              results.monthly[monthKey].max += savedMax;
              results.byRegion[region.id].min += savedMin / 48;
              results.byRegion[region.id].max += savedMax / 48;
              results.byRegion[region.id].yearly[year].min += savedMin / 12;
              results.byRegion[region.id].yearly[year].max += savedMax / 12;
              results.byTeam[team.id].min += savedMin / 48;
              results.byTeam[team.id].max += savedMax / 48;
              results.byTeam[team.id].yearly[year].min += savedMin / 12;
              results.byTeam[team.id].yearly[year].max += savedMax / 12;
              results.byStep[step.id].min += savedMin / 48;
              results.byStep[step.id].max += savedMax / 48;
              results.byStep[step.id].yearly[year].min += savedMin / 12;
              results.byStep[step.id].yearly[year].max += savedMax / 12;
              results.byAgent[agentId].min += savedMin / 48;
              results.byAgent[agentId].max += savedMax / 48;
              results.byAgent[agentId].yearly[year].min += savedMin / 12;
              results.byAgent[agentId].yearly[year].max += savedMax / 12;
              results.totals.min += savedMin / 48;
              results.totals.max += savedMax / 48;
              results.yearlyTotals[year].min += savedMin / 12;
              results.yearlyTotals[year].max += savedMax / 12;
            }
          }

          // Use max savings to compute net FTE for next year's baseline
          const avgSaved = (totalMinSaved + totalMaxSaved) / 2;
          if (!netFteThisYear[region.id][team.id]) netFteThisYear[region.id][team.id] = {};
          netFteThisYear[region.id][team.id][month] = rawFte - avgSaved;

          results.yearlyTotals[year].grossMin += totalMinSaved / 12;
          results.yearlyTotals[year].grossMax += totalMaxSaved / 12;
        }
      }
    }

    // Store this year's net FTE as prior for next year
    for (const rId in netFteThisYear) {
      if (!netFtePrior[rId]) netFtePrior[rId] = {};
      for (const tId in netFteThisYear[rId]) {
        if (!netFtePrior[rId][tId]) netFtePrior[rId][tId] = {};
        for (const m in netFteThisYear[rId][tId]) {
          netFtePrior[rId][tId][m] = netFteThisYear[rId][tId][m];
        }
      }
    }
  }

  // Compute net new savings (incremental year-over-year)
  let prevGrossMin = 0, prevGrossMax = 0;
  for (const year of [2026, 2027, 2028, 2029]) {
    const yt = results.yearlyTotals[year];
    yt.netNewMin = yt.grossMin - prevGrossMin;
    yt.netNewMax = yt.grossMax - prevGrossMax;
    prevGrossMin = yt.grossMin;
    prevGrossMax = yt.grossMax;
  }

  // Cumulative savings
  let cumulativeMin = 0, cumulativeMax = 0;
  for (const year of [2026, 2027, 2028, 2029]) {
    const yt = results.yearlyTotals[year];
    cumulativeMin += yt.netNewMin;
    cumulativeMax += yt.netNewMax;
    yt.cumulativeMin = cumulativeMin;
    yt.cumulativeMax = cumulativeMax;
  }

  return results;
}
