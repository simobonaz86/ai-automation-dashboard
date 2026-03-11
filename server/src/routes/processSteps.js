import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

function buildTree(steps, allocations, parentId = null) {
  return steps
    .filter(s => s.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(s => {
      const allocs = allocations.filter(a => a.step_id === s.id);
      const globalAlloc = allocs.find(a => !a.region_id);
      const regionalAllocs = allocs.filter(a => a.region_id);
      const children = buildTree(steps, allocations, s.id);
      const hasChildren = children.length > 0;
      const assignmentCount = db.prepare(
        'SELECT COUNT(*) as cnt FROM agent_step_assignments WHERE step_id = ? AND is_active = 1'
      ).get(s.id).cnt;

      return {
        ...s,
        allocation_pct: globalAlloc ? globalAlloc.allocation_pct : 0,
        regional_allocations: regionalAllocs,
        children,
        has_children: hasChildren,
        agent_count: assignmentCount,
      };
    });
}

router.get('/', (req, res) => {
  try {
    const { team_id } = req.query;
    let steps;
    if (team_id) {
      steps = db.prepare('SELECT * FROM process_steps WHERE team_id = ?').all(team_id);
    } else {
      steps = db.prepare('SELECT * FROM process_steps').all();
    }
    const allocations = db.prepare('SELECT * FROM step_allocations').all();
    const tree = buildTree(steps, allocations);
    res.json(tree);
  } catch (err) {
    console.error('GET /process-steps error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/flat', (req, res) => {
  try {
    const steps = db.prepare(`
      SELECT ps.*, sa.allocation_pct as global_allocation
      FROM process_steps ps
      LEFT JOIN step_allocations sa ON sa.step_id = ps.id AND sa.region_id IS NULL
      ORDER BY ps.sort_order
    `).all();
    res.json(steps);
  } catch (err) {
    console.error('GET /process-steps/flat error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/automatable', (req, res) => {
  try {
    const steps = db.prepare(`
      SELECT ps.id, ps.name, ps.team_id, t.name as team_name, t.code as team_code
      FROM process_steps ps
      JOIN teams t ON t.id = ps.team_id
      WHERE ps.is_automatable = 1 AND ps.is_active = 1
      ORDER BY t.code, ps.sort_order
    `).all();
    res.json(steps);
  } catch (err) {
    console.error('GET /process-steps/automatable error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { team_id, parent_id, name, description, is_automatable = 0, is_custom = 0, sort_order = 0 } = req.body;
    const id = uuidv4();

    let effectiveTeamId = team_id;
    if (parent_id) {
      const parent = db.prepare('SELECT team_id FROM process_steps WHERE id = ?').get(parent_id);
      if (parent) effectiveTeamId = parent.team_id;
    }

    db.prepare(`
      INSERT INTO process_steps (id, team_id, parent_id, name, description, is_automatable, is_active, is_custom, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, effectiveTeamId, parent_id || null, name, description || null, is_automatable, is_custom, sort_order);

    db.prepare('INSERT INTO step_allocations (id, step_id, region_id, allocation_pct) VALUES (?, ?, NULL, 0)')
      .run(uuidv4(), id);

    const step = db.prepare('SELECT * FROM process_steps WHERE id = ?').get(id);
    res.status(201).json(step);
  } catch (err) {
    console.error('POST /process-steps error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/reorder', (req, res) => {
  try {
    const { items } = req.body;
    const update = db.prepare('UPDATE process_steps SET sort_order = ? WHERE id = ?');
    for (const item of (items || [])) {
      update.run(item.sort_order, item.id);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /process-steps/reorder error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { name, description, is_automatable, is_active, is_custom, sort_order, parent_id } = req.body;
    const existing = db.prepare('SELECT * FROM process_steps WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Step not found' });

    db.prepare(`
      UPDATE process_steps SET name=?, description=?, is_automatable=?, is_active=?, is_custom=?, sort_order=?, parent_id=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      name ?? existing.name,
      description ?? existing.description,
      is_automatable ?? existing.is_automatable,
      is_active ?? existing.is_active,
      is_custom ?? existing.is_custom,
      sort_order ?? existing.sort_order,
      parent_id !== undefined ? parent_id : existing.parent_id,
      req.params.id
    );
    res.json({ id: req.params.id, ...req.body });
  } catch (err) {
    console.error('PUT /process-steps/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM step_allocations WHERE step_id = ?').run(req.params.id);
    db.prepare('DELETE FROM process_steps WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /process-steps/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/allocations', (req, res) => {
  try {
    const { allocations } = req.body;
    db.prepare('DELETE FROM step_allocations WHERE step_id = ?').run(req.params.id);
    const insert = db.prepare('INSERT INTO step_allocations (id, step_id, region_id, allocation_pct, effective_from, notes) VALUES (?, ?, ?, ?, ?, ?)');
    for (const a of (allocations || [])) {
      insert.run(uuidv4(), req.params.id, a.region_id || null, a.allocation_pct, a.effective_from || null, a.notes || null);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /process-steps/:id/allocations error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
