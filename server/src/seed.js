import db, { initializeDatabase } from './db.js';
import { v4 as uuidv4 } from 'uuid';

initializeDatabase();

const existing = db.prepare('SELECT COUNT(*) as cnt FROM regions').get();
if (existing.cnt > 0) {
  console.log('Database already seeded. Delete server/data/planner.db to re-seed.');
  process.exit(0);
}

const regionIds = {};
const regions = [
  { name: 'Europe', code: 'EU', sort_order: 1 },
  { name: 'North America', code: 'NA', sort_order: 2 },
  { name: 'Latin America', code: 'LATAM', sort_order: 3 },
  { name: 'Asia Pacific', code: 'APAC', sort_order: 4 },
  { name: 'IMEA', code: 'IMEA', sort_order: 5 },
];
const insertRegion = db.prepare('INSERT INTO regions (id, name, code, is_active, sort_order) VALUES (?, ?, ?, 1, ?)');
for (const r of regions) {
  const id = uuidv4();
  regionIds[r.code] = id;
  insertRegion.run(id, r.name, r.code, r.sort_order);
}

const teamIds = {};
const teams = [
  { name: 'Customer Experience (CX)', code: 'CX', default_color: '#7c3aed' },
  { name: 'Operations (Ops)', code: 'OPS', default_color: '#0891b2' },
];
const insertTeam = db.prepare('INSERT INTO teams (id, name, code, default_color) VALUES (?, ?, ?, ?)');
for (const t of teams) {
  const id = uuidv4();
  teamIds[t.code] = id;
  insertTeam.run(id, t.name, t.code, t.default_color);
}

const insertTransfer = db.prepare('INSERT INTO team_transfers (id, source_team_id, target_team_id, region_id, transfer_pct) VALUES (?, ?, ?, ?, ?)');
const cxToOpsTransfers = { EU: 10, NA: 10, LATAM: 10, APAC: 10, IMEA: 10 };
const opsToCxTransfers = { EU: 0, NA: 0, LATAM: 0, APAC: 0, IMEA: 0 };
for (const [code, pct] of Object.entries(cxToOpsTransfers)) {
  insertTransfer.run(uuidv4(), teamIds.CX, teamIds.OPS, regionIds[code], pct);
}
for (const [code, pct] of Object.entries(opsToCxTransfers)) {
  insertTransfer.run(uuidv4(), teamIds.OPS, teamIds.CX, regionIds[code], pct);
}

const stepIds = {};
const insertStep = db.prepare(
  'INSERT INTO process_steps (id, team_id, parent_id, name, description, is_automatable, is_active, is_custom, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)'
);
const insertAlloc = db.prepare(
  'INSERT INTO step_allocations (id, step_id, region_id, allocation_pct, notes) VALUES (?, ?, ?, ?, ?)'
);

function addStep(teamCode, parentKey, name, sortOrder, isAutomatable = 0, isCustom = 0) {
  const key = name.replace(/[^a-zA-Z0-9]/g, '_');
  const id = uuidv4();
  stepIds[key] = id;
  const parentId = parentKey ? stepIds[parentKey] : null;
  insertStep.run(id, teamIds[teamCode], parentId, name, null, isAutomatable, isCustom, sortOrder);
  return key;
}

function setAlloc(stepKey, regionCode, pct) {
  const regionId = regionCode ? regionIds[regionCode] : null;
  insertAlloc.run(uuidv4(), stepIds[stepKey], regionId, pct, null);
}

// CX Process Steps
const cxBooking = addStep('CX', null, 'Booking', 1);
const cxDocumentation = addStep('CX', null, 'Documentation', 2);
const cxTracking = addStep('CX', null, 'Tracking & Tracing', 3);
const cxCustomerService = addStep('CX', null, 'Customer Service', 4);
const cxFinancial = addStep('CX', null, 'Financial', 5);
const cxQuoting = addStep('CX', null, 'Quoting', 6);
const cxPricing = addStep('CX', null, 'Pricing', 7);
const cxOther = addStep('CX', null, 'Other CX', 8, 0, 1);

// CX allocations (global defaults from Excel Cat_Alloc)
setAlloc(cxBooking, null, 25);
setAlloc(cxDocumentation, null, 15);
setAlloc(cxTracking, null, 15);
setAlloc(cxCustomerService, null, 15);
setAlloc(cxFinancial, null, 10);
setAlloc(cxQuoting, null, 10);
setAlloc(cxPricing, null, 5);
setAlloc(cxOther, null, 5);

// OPS top-level steps
const opsEH = addStep('OPS', null, 'Exception Handling', 1);
const opsIC = addStep('OPS', null, 'Import Clearance', 2);
const opsOpt = addStep('OPS', null, 'Optimisation', 3);
const opsOther = addStep('OPS', null, 'Other Ops', 4, 0, 1);

// OPS top-level allocations
setAlloc(opsEH, null, 70);
setAlloc(opsIC, null, 20);
setAlloc(opsOpt, null, 10);
setAlloc(opsOther, null, 0);

// EH sub-steps (leaf, automatable)
const ehVendor = addStep('OPS', 'Exception_Handling', 'Vendor Comms (Milestone Chasing)', 1, 1);
const ehCustomer = addStep('OPS', 'Exception_Handling', 'Customer Comms', 2, 1);
const ehDispute = addStep('OPS', 'Exception_Handling', 'Dispute Handling', 3, 1);
const ehChargebacks = addStep('OPS', 'Exception_Handling', 'Chargebacks', 4, 1);
const ehOther = addStep('OPS', 'Exception_Handling', 'Other EH', 5, 1, 1);

// EH sub-step allocations (global)
setAlloc(ehVendor, null, 43);
setAlloc(ehCustomer, null, 21);
setAlloc(ehDispute, null, 7);
setAlloc(ehChargebacks, null, 7);
setAlloc(ehOther, null, 22);

// AI Agents — the 4 known EH agents
const agentIds = {};
const insertAgent = db.prepare(
  'INSERT INTO ai_agents (id, name, description, status, owner, launch_date, technology_tags) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
const insertAssignment = db.prepare(
  'INSERT INTO agent_step_assignments (id, agent_id, step_id, region_id, is_active) VALUES (?, ?, ?, ?, 1)'
);
const insertProfile = db.prepare(
  'INSERT INTO assumption_profiles (id, agent_id, region_id, metric, launch_month, milestones, interpolation) VALUES (?, ?, ?, ?, ?, ?, ?)'
);

function addAgent(name, desc, stepKey, launchDate, minMilestones, maxMilestones, adoptionMilestones) {
  const id = uuidv4();
  agentIds[name] = id;
  insertAgent.run(id, name, desc, 'Active', 'AI Programme Team', launchDate, JSON.stringify(['LLM']));
  insertAssignment.run(uuidv4(), id, stepIds[stepKey], null);
  insertProfile.run(uuidv4(), id, null, 'min_automation', launchDate, JSON.stringify(minMilestones), 'linear');
  insertProfile.run(uuidv4(), id, null, 'max_automation', launchDate, JSON.stringify(maxMilestones), 'linear');
  insertProfile.run(uuidv4(), id, null, 'adoption', launchDate, JSON.stringify(adoptionMilestones), 'linear');
  return id;
}

addAgent(
  'Vendor Milestone Collection',
  'Automates vendor communication for milestone chasing in exception handling',
  'Vendor_Comms__Milestone_Chasing_',
  '2026-06-01',
  [{ year: 2026, q4_value: 0 }, { year: 2027, q4_value: 0 }, { year: 2028, q4_value: 50 }, { year: 2029, q4_value: 50 }],
  [{ year: 2026, q4_value: 5 }, { year: 2027, q4_value: 25 }, { year: 2028, q4_value: 50 }, { year: 2029, q4_value: 50 }],
  [{ year: 2026, q4_value: 10 }, { year: 2027, q4_value: 50 }, { year: 2028, q4_value: 75 }, { year: 2029, q4_value: 75 }]
);

addAgent(
  'Customer Comms Automation',
  'Automates customer communication processes in exception handling',
  'Customer_Comms',
  '2026-06-01',
  [{ year: 2026, q4_value: 10 }, { year: 2027, q4_value: 50 }, { year: 2028, q4_value: 90 }, { year: 2029, q4_value: 90 }],
  [{ year: 2026, q4_value: 5 }, { year: 2027, q4_value: 25 }, { year: 2028, q4_value: 50 }, { year: 2029, q4_value: 50 }],
  [{ year: 2026, q4_value: 5 }, { year: 2027, q4_value: 25 }, { year: 2028, q4_value: 50 }, { year: 2029, q4_value: 50 }]
);

addAgent(
  'Dispute Handler',
  'Automates dispute handling processes in exception handling',
  'Dispute_Handling',
  '2026-06-01',
  [{ year: 2026, q4_value: 10 }, { year: 2027, q4_value: 50 }, { year: 2028, q4_value: 90 }, { year: 2029, q4_value: 90 }],
  [{ year: 2026, q4_value: 5 }, { year: 2027, q4_value: 30 }, { year: 2028, q4_value: 60 }, { year: 2029, q4_value: 60 }],
  [{ year: 2026, q4_value: 15 }, { year: 2027, q4_value: 50 }, { year: 2028, q4_value: 90 }, { year: 2029, q4_value: 90 }]
);

addAgent(
  'Chargeback Processor',
  'Automates chargeback processing in exception handling',
  'Chargebacks',
  '2026-06-01',
  [{ year: 2026, q4_value: 15 }, { year: 2027, q4_value: 50 }, { year: 2028, q4_value: 90 }, { year: 2029, q4_value: 90 }],
  [{ year: 2026, q4_value: 10 }, { year: 2027, q4_value: 50 }, { year: 2028, q4_value: 90 }, { year: 2029, q4_value: 90 }],
  [{ year: 2026, q4_value: 5 }, { year: 2027, q4_value: 10 }, { year: 2028, q4_value: 20 }, { year: 2029, q4_value: 20 }]
);

// FTE Baselines — representative data from Key_Inputs
const insertBaseline = db.prepare(
  'INSERT INTO fte_baselines (id, region_id, team_id, year, month, fte_value, version) VALUES (?, ?, ?, ?, ?, ?, ?)'
);

const baselineFTE = {
  EU:    { CX: 350, OPS: 420 },
  NA:    { CX: 280, OPS: 310 },
  LATAM: { CX: 180, OPS: 200 },
  APAC:  { CX: 220, OPS: 250 },
  IMEA:  { CX: 150, OPS: 170 },
};

const yearlyGrowth = { 2026: 1.0, 2027: 1.02, 2028: 1.04, 2029: 1.05 };

for (const [regionCode, teams2] of Object.entries(baselineFTE)) {
  for (const [teamCode, baseFte] of Object.entries(teams2)) {
    for (const year of [2026, 2027, 2028, 2029]) {
      for (let month = 1; month <= 12; month++) {
        const fte = Math.round(baseFte * yearlyGrowth[year] * 10) / 10;
        insertBaseline.run(
          uuidv4(), regionIds[regionCode], teamIds[teamCode],
          year, month, fte, 'Budget 2026'
        );
      }
    }
  }
}

// Default Scenario
const scenarioId = uuidv4();
db.prepare(
  'INSERT INTO scenarios (id, name, description, baseline_version, agent_set, scope, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)'
).run(
  scenarioId,
  'Base Case 2026',
  'Default scenario with all active EH agents using Budget 2026 baseline',
  'Budget 2026',
  JSON.stringify(Object.values(agentIds)),
  'global',
  1
);

console.log('Database seeded successfully.');
console.log(`  Regions: ${regions.length}`);
console.log(`  Teams: ${teams.length}`);
console.log(`  Process Steps: ${Object.keys(stepIds).length}`);
console.log(`  AI Agents: ${Object.keys(agentIds).length}`);
console.log(`  FTE Baseline records: ${Object.keys(baselineFTE).length * 2 * 4 * 12}`);
console.log(`  Scenarios: 1`);
