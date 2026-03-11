import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { calculateScenario } from '../utils/calcEngine.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const scenarios = db.prepare('SELECT * FROM scenarios ORDER BY is_default DESC, name').all();
    res.json(scenarios.map(s => ({
      ...s,
      agent_set: JSON.parse(s.agent_set),
    })));
  } catch (err) {
    console.error('GET /scenarios error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/compare/:ids', (req, res) => {
  try {
    const ids = req.params.ids.split(',').filter(Boolean);
    const results = ids.map(id => {
      try {
        return calculateScenario(id);
      } catch (e) {
        return { error: e.message, scenario: { id } };
      }
    });
    res.json(results);
  } catch (err) {
    console.error('GET /scenarios/compare error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const scenario = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(req.params.id);
    if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

    const overrides = db.prepare('SELECT * FROM scenario_overrides WHERE scenario_id = ?').all(scenario.id);

    res.json({
      ...scenario,
      agent_set: JSON.parse(scenario.agent_set),
      overrides: overrides.map(o => ({ ...o, milestones: JSON.parse(o.milestones) })),
    });
  } catch (err) {
    console.error('GET /scenarios/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/calculate', (req, res) => {
  try {
    const results = calculateScenario(req.params.id);
    res.json(results);
  } catch (err) {
    console.error('GET /scenarios/:id/calculate error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, description, baseline_version = 'Budget 2026', agent_set = [], scope = 'global', is_default = 0 } = req.body;
    const id = uuidv4();
    db.prepare(`
      INSERT INTO scenarios (id, name, description, baseline_version, agent_set, scope, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, description || null, baseline_version, JSON.stringify(agent_set), scope, is_default ? 1 : 0);
    res.status(201).json({ id, name });
  } catch (err) {
    console.error('POST /scenarios error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { name, description, baseline_version, agent_set, scope, is_default } = req.body;
    const existing = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Scenario not found' });

    db.prepare(`
      UPDATE scenarios SET name=?, description=?, baseline_version=?, agent_set=?, scope=?, is_default=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      name ?? existing.name,
      description ?? existing.description,
      baseline_version ?? existing.baseline_version,
      agent_set ? JSON.stringify(agent_set) : existing.agent_set,
      scope ?? existing.scope,
      is_default !== undefined ? (is_default ? 1 : 0) : existing.is_default,
      req.params.id
    );
    res.json({ id: req.params.id, ...req.body });
  } catch (err) {
    console.error('PUT /scenarios/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM scenario_overrides WHERE scenario_id = ?').run(req.params.id);
    db.prepare('DELETE FROM scenarios WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /scenarios/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
