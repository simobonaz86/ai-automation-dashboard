import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { interpolateMonthlyCurve } from '../utils/calcEngine.js';

const router = Router();

router.get('/', (req, res) => {
  const { status, team_id } = req.query;
  let agents;
  if (status) {
    agents = db.prepare('SELECT * FROM ai_agents WHERE status = ? ORDER BY name').all(status);
  } else {
    agents = db.prepare('SELECT * FROM ai_agents ORDER BY name').all();
  }

  agents = agents.map(a => {
    const assignments = db.prepare(`
      SELECT asa.*, ps.name as step_name, ps.team_id
      FROM agent_step_assignments asa
      JOIN process_steps ps ON ps.id = asa.step_id
      WHERE asa.agent_id = ?
    `).all(a.id);

    if (team_id && assignments.length > 0 && !assignments.some(asg => asg.team_id === team_id)) {
      return null;
    }

    return {
      ...a,
      technology_tags: JSON.parse(a.technology_tags || '[]'),
      assignments,
      assignment_count: assignments.filter(asg => asg.is_active).length,
    };
  }).filter(Boolean);

  res.json(agents);
});

router.get('/:id', (req, res) => {
  const agent = db.prepare('SELECT * FROM ai_agents WHERE id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const assignments = db.prepare(`
    SELECT asa.*, ps.name as step_name, ps.team_id, t.name as team_name
    FROM agent_step_assignments asa
    JOIN process_steps ps ON ps.id = asa.step_id
    JOIN teams t ON t.id = ps.team_id
    WHERE asa.agent_id = ?
  `).all(agent.id);

  const profiles = db.prepare('SELECT * FROM assumption_profiles WHERE agent_id = ?').all(agent.id);
  const profileData = {};
  for (const p of profiles) {
    const key = p.region_id ? `${p.metric}_${p.region_id}` : p.metric;
    profileData[key] = {
      ...p,
      milestones: JSON.parse(p.milestones),
      monthly_curve: interpolateMonthlyCurve(JSON.parse(p.milestones), p.launch_month, p.interpolation),
    };
  }

  res.json({
    ...agent,
    technology_tags: JSON.parse(agent.technology_tags || '[]'),
    assignments,
    profiles: profileData,
  });
});

router.post('/', (req, res) => {
  const { name, description, status = 'Draft', owner, launch_date, technology_tags = [] } = req.body;
  const id = uuidv4();
  db.prepare(`
    INSERT INTO ai_agents (id, name, description, status, owner, launch_date, technology_tags)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description || null, status, owner || null, launch_date || null, JSON.stringify(technology_tags));

  const launchMonth = launch_date || '2027-01-01';
  for (const metric of ['min_automation', 'max_automation', 'adoption']) {
    db.prepare(`
      INSERT INTO assumption_profiles (id, agent_id, region_id, metric, launch_month, milestones, interpolation)
      VALUES (?, ?, NULL, ?, ?, ?, 'linear')
    `).run(uuidv4(), id, metric, launchMonth, JSON.stringify([
      { year: 2026, q4_value: 0 },
      { year: 2027, q4_value: 0 },
      { year: 2028, q4_value: 0 },
      { year: 2029, q4_value: 0 },
    ]));
  }

  res.status(201).json({ id, name, status });
});

router.put('/:id', (req, res) => {
  const { name, description, status, owner, launch_date, technology_tags } = req.body;
  const existing = db.prepare('SELECT * FROM ai_agents WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Agent not found' });

  db.prepare(`
    UPDATE ai_agents SET name=?, description=?, status=?, owner=?, launch_date=?, technology_tags=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    name ?? existing.name,
    description ?? existing.description,
    status ?? existing.status,
    owner ?? existing.owner,
    launch_date ?? existing.launch_date,
    technology_tags ? JSON.stringify(technology_tags) : existing.technology_tags,
    req.params.id
  );
  res.json({ id: req.params.id, ...req.body });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM assumption_profiles WHERE agent_id = ?').run(req.params.id);
  db.prepare('DELETE FROM agent_step_assignments WHERE agent_id = ?').run(req.params.id);
  db.prepare('DELETE FROM ai_agents WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/clone', (req, res) => {
  const original = db.prepare('SELECT * FROM ai_agents WHERE id = ?').get(req.params.id);
  if (!original) return res.status(404).json({ error: 'Agent not found' });

  const newId = uuidv4();
  db.prepare(`
    INSERT INTO ai_agents (id, name, description, status, owner, launch_date, technology_tags)
    VALUES (?, ?, ?, 'Draft', ?, ?, ?)
  `).run(newId, `${original.name} (Copy)`, original.description, original.owner, original.launch_date, original.technology_tags);

  const profiles = db.prepare('SELECT * FROM assumption_profiles WHERE agent_id = ?').all(req.params.id);
  for (const p of profiles) {
    db.prepare(`
      INSERT INTO assumption_profiles (id, agent_id, region_id, metric, launch_month, milestones, interpolation)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), newId, p.region_id, p.metric, p.launch_month, p.milestones, p.interpolation);
  }

  const assignments = db.prepare('SELECT * FROM agent_step_assignments WHERE agent_id = ?').all(req.params.id);
  for (const a of assignments) {
    db.prepare(`
      INSERT INTO agent_step_assignments (id, agent_id, step_id, region_id, is_active, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), newId, a.step_id, a.region_id, a.is_active, a.notes);
  }

  res.status(201).json({ id: newId, name: `${original.name} (Copy)` });
});

router.put('/:id/assignments', (req, res) => {
  const { assignments } = req.body;
  db.prepare('DELETE FROM agent_step_assignments WHERE agent_id = ?').run(req.params.id);
  const insert = db.prepare('INSERT INTO agent_step_assignments (id, agent_id, step_id, region_id, is_active, notes) VALUES (?, ?, ?, ?, ?, ?)');
  for (const a of assignments) {
    insert.run(uuidv4(), req.params.id, a.step_id, a.region_id || null, a.is_active ?? 1, a.notes || null);
  }
  res.json({ ok: true });
});

router.put('/:id/profiles', (req, res) => {
  const { profiles } = req.body;
  db.prepare('DELETE FROM assumption_profiles WHERE agent_id = ?').run(req.params.id);
  const insert = db.prepare(`
    INSERT INTO assumption_profiles (id, agent_id, region_id, metric, launch_month, milestones, interpolation, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of profiles) {
    insert.run(
      uuidv4(), req.params.id, p.region_id || null,
      p.metric, p.launch_month, JSON.stringify(p.milestones),
      p.interpolation || 'linear', p.notes || null
    );
  }
  res.json({ ok: true });
});

router.get('/:id/curve', (req, res) => {
  const profiles = db.prepare('SELECT * FROM assumption_profiles WHERE agent_id = ? AND region_id IS NULL').all(req.params.id);
  const curves = {};
  for (const p of profiles) {
    curves[p.metric] = interpolateMonthlyCurve(JSON.parse(p.milestones), p.launch_month, p.interpolation);
  }
  res.json(curves);
});

export default router;
