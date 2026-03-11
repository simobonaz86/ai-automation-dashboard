import db from '../db.js';

/**
 * Interpolate monthly values from quarterly milestones.
 * milestones: [{ year, q4_value }] — Q4 (December) target for each year.
 * launchMonth: 'YYYY-MM-DD' — first month the value is non-zero.
 * interpolation: 'linear' | 'step' | 's_curve'
 * Returns: { 'YYYY-MM': value } for all 48 months (Jan 2026 – Dec 2029)
 */
export function interpolateMonthlyCurve(milestones, launchMonth, interpolation = 'linear') {
  const result = {};
  const launch = new Date(launchMonth);
  const launchIdx = (launch.getFullYear() - 2026) * 12 + launch.getMonth();

  const points = [];
  let prevValue = 0;
  for (const ms of milestones.sort((a, b) => a.year - b.year)) {
    const decIdx = (ms.year - 2026) * 12 + 11;
    points.push({ idx: decIdx, value: ms.q4_value });
  }

  for (let i = 0; i < 48; i++) {
    const year = 2026 + Math.floor(i / 12);
    const month = (i % 12) + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;

    if (i < launchIdx) {
      result[key] = 0;
      continue;
    }

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

      if (interpolation === 'step') {
        value = left.value;
      } else if (interpolation === 's_curve') {
        const s = progress * progress * (3 - 2 * progress);
        value = left.value + (right.value - left.value) * s;
      } else {
        value = left.value + (right.value - left.value) * progress;
      }
    }

    result[key] = Math.round(value * 100) / 100;
  }

  return result;
}

/**
 * Get the effective allocation % for a leaf step (product of all ancestor allocations / 100).
 * Returns fractional value (e.g., 0.301 for 43% of 70%).
 */
function getEffectiveAllocation(stepId, regionId) {
  let pct = 1.0;
  let currentId = stepId;

  while (currentId) {
    const alloc = db.prepare(`
      SELECT allocation_pct FROM step_allocations
      WHERE step_id = ? AND (region_id = ? OR region_id IS NULL)
      ORDER BY CASE WHEN region_id IS NOT NULL THEN 0 ELSE 1 END
      LIMIT 1
    `).get(currentId, regionId);

    if (alloc) {
      pct *= alloc.allocation_pct / 100;
    }

    const step = db.prepare('SELECT parent_id FROM process_steps WHERE id = ?').get(currentId);
    currentId = step ? step.parent_id : null;
  }

  return pct;
}

/**
 * Get net FTE for a team+region+month after cross-team transfers.
 */
function getNetFTE(teamId, regionId, year, month, version) {
  const raw = db.prepare(`
    SELECT fte_value FROM fte_baselines
    WHERE team_id = ? AND region_id = ? AND year = ? AND month = ? AND version = ?
  `).get(teamId, regionId, year, month, version);

  const rawFte = raw ? raw.fte_value : 0;

  const outbound = db.prepare(`
    SELECT COALESCE(SUM(transfer_pct), 0) as total_out FROM team_transfers
    WHERE source_team_id = ? AND region_id = ?
  `).get(teamId, regionId);

  const inbound = db.prepare(`
    SELECT tt.transfer_pct, fb.fte_value
    FROM team_transfers tt
    JOIN fte_baselines fb ON fb.team_id = tt.source_team_id AND fb.region_id = tt.region_id
      AND fb.year = ? AND fb.month = ? AND fb.version = ?
    WHERE tt.target_team_id = ? AND tt.region_id = ?
  `).all(year, month, version, teamId, regionId);

  let netFte = rawFte * (1 - (outbound.total_out || 0) / 100);
  for (const ib of inbound) {
    netFte += (ib.fte_value || 0) * (ib.transfer_pct / 100);
  }

  return netFte;
}

/**
 * Main calculation: compute FTE savings for a scenario.
 * Returns structured results by region, team, step, agent, and month.
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

  const results = {
    scenario: { id: scenario.id, name: scenario.name },
    byRegion: {},
    byTeam: {},
    byStep: {},
    byAgent: {},
    monthly: {},
    totals: { min: 0, max: 0, baseline: 0 },
    yearlyTotals: {},
  };

  for (let year = 2026; year <= 2029; year++) {
    results.yearlyTotals[year] = { min: 0, max: 0, baseline: 0 };
  }

  for (const region of regions) {
    results.byRegion[region.id] = {
      id: region.id, name: region.name, code: region.code,
      min: 0, max: 0, baseline: 0, yearly: {},
    };
    for (let y = 2026; y <= 2029; y++) {
      results.byRegion[region.id].yearly[y] = { min: 0, max: 0, baseline: 0 };
    }

    for (const team of teams) {
      const teamKey = `${region.id}_${team.id}`;
      if (!results.byTeam[team.id]) {
        results.byTeam[team.id] = { id: team.id, name: team.name, code: team.code, min: 0, max: 0, baseline: 0, yearly: {} };
        for (let y = 2026; y <= 2029; y++) results.byTeam[team.id].yearly[y] = { min: 0, max: 0, baseline: 0 };
      }

      for (let year = 2026; year <= 2029; year++) {
        for (let month = 1; month <= 12; month++) {
          const monthKey = `${year}-${String(month).padStart(2, '0')}`;
          const netFte = getNetFTE(team.id, region.id, year, month, scenario.baseline_version);

          if (!results.monthly[monthKey]) {
            results.monthly[monthKey] = { min: 0, max: 0, baseline: 0 };
          }
          results.monthly[monthKey].baseline += netFte;
          results.byRegion[region.id].baseline += netFte / 48;
          results.byRegion[region.id].yearly[year].baseline += netFte / 12;
          results.byTeam[team.id].baseline += netFte / 48;
          results.byTeam[team.id].yearly[year].baseline += netFte / 12;
          results.totals.baseline += netFte / 48;
          results.yearlyTotals[year].baseline += netFte / 12;

          for (const step of leafSteps.filter(s => s.team_id === team.id)) {
            const allocFrac = getEffectiveAllocation(step.id, region.id);
            const fteAllocated = netFte * allocFrac;

            if (!results.byStep[step.id]) {
              results.byStep[step.id] = {
                id: step.id, name: step.name, teamId: team.id,
                min: 0, max: 0, allocated: 0, yearly: {}
              };
              for (let y = 2026; y <= 2029; y++) results.byStep[step.id].yearly[y] = { min: 0, max: 0, allocated: 0 };
            }
            results.byStep[step.id].allocated += fteAllocated / 48;
            results.byStep[step.id].yearly[year].allocated += fteAllocated / 12;

            const assignments = db.prepare(`
              SELECT asa.agent_id FROM agent_step_assignments asa
              WHERE asa.step_id = ? AND asa.is_active = 1
              AND (asa.region_id IS NULL OR asa.region_id = ?)
              AND asa.agent_id IN (${agentSet.map(() => '?').join(',')})
            `).all(step.id, region.id, ...agentSet);

            for (const asgn of assignments) {
              const agentId = asgn.agent_id;

              if (!results.byAgent[agentId]) {
                const agent = db.prepare('SELECT * FROM ai_agents WHERE id = ?').get(agentId);
                results.byAgent[agentId] = {
                  id: agentId, name: agent.name, status: agent.status,
                  min: 0, max: 0, entitlement: 0, yearly: {}
                };
                for (let y = 2026; y <= 2029; y++) results.byAgent[agentId].yearly[y] = { min: 0, max: 0, entitlement: 0 };
              }
              results.byAgent[agentId].entitlement += fteAllocated / 48;
              results.byAgent[agentId].yearly[year].entitlement += fteAllocated / 12;

              const getProfile = (metric) => {
                const override = db.prepare(`
                  SELECT milestones, interpolation FROM scenario_overrides
                  WHERE scenario_id = ? AND agent_id = ? AND metric = ?
                  AND (region_id IS NULL OR region_id = ?)
                  ORDER BY CASE WHEN region_id IS NOT NULL THEN 0 ELSE 1 END LIMIT 1
                `).get(scenarioId, agentId, metric, region.id);

                if (override) return override;

                return db.prepare(`
                  SELECT milestones, launch_month, interpolation FROM assumption_profiles
                  WHERE agent_id = ? AND metric = ?
                  AND (region_id IS NULL OR region_id = ?)
                  ORDER BY CASE WHEN region_id IS NOT NULL THEN 0 ELSE 1 END LIMIT 1
                `).get(agentId, metric, region.id);
              };

              const minProfile = getProfile('min_automation');
              const maxProfile = getProfile('max_automation');
              const adoptProfile = getProfile('adoption');

              if (!minProfile || !maxProfile || !adoptProfile) continue;

              const launchMonth = minProfile.launch_month || adoptProfile.launch_month || '2026-01-01';
              const minCurve = interpolateMonthlyCurve(JSON.parse(minProfile.milestones), launchMonth, minProfile.interpolation);
              const maxCurve = interpolateMonthlyCurve(JSON.parse(maxProfile.milestones), launchMonth, maxProfile.interpolation);
              const adoptCurve = interpolateMonthlyCurve(JSON.parse(adoptProfile.milestones), launchMonth, adoptProfile.interpolation);

              const adoptPct = (adoptCurve[monthKey] || 0) / 100;
              const minAutoPct = (minCurve[monthKey] || 0) / 100;
              const maxAutoPct = (maxCurve[monthKey] || 0) / 100;

              const savedMin = fteAllocated * adoptPct * minAutoPct;
              const savedMax = fteAllocated * adoptPct * maxAutoPct;

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
        }
      }
    }
  }

  return results;
}
