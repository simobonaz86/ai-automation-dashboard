import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (req, res) => {
  try {
    const teams = db.prepare('SELECT * FROM teams').all();
    const transfers = db.prepare('SELECT * FROM team_transfers').all();
    res.json(teams.map(t => ({
      ...t,
      transfers: transfers.filter(tr => tr.source_team_id === t.id),
    })));
  } catch (err) {
    console.error('GET /teams error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, code, default_color } = req.body;
    const id = uuidv4();
    db.prepare('INSERT INTO teams (id, name, code, default_color) VALUES (?, ?, ?, ?)')
      .run(id, name, code, default_color);
    res.status(201).json({ id, name, code, default_color });
  } catch (err) {
    console.error('POST /teams error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { name, code, default_color } = req.body;
    db.prepare('UPDATE teams SET name=?, code=?, default_color=? WHERE id=?')
      .run(name, code, default_color, req.params.id);
    res.json({ id: req.params.id, ...req.body });
  } catch (err) {
    console.error('PUT /teams/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const stepCount = db.prepare('SELECT COUNT(*) as cnt FROM process_steps WHERE team_id = ?').get(req.params.id);
    if (stepCount.cnt > 0) {
      return res.status(400).json({ error: `Cannot delete team: ${stepCount.cnt} process steps are assigned to it. Remove or reassign them first.` });
    }
    db.prepare('DELETE FROM team_transfers WHERE source_team_id = ? OR target_team_id = ?').run(req.params.id, req.params.id);
    db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /teams/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/transfers', (req, res) => {
  try {
    const { transfers } = req.body;
    db.prepare('DELETE FROM team_transfers WHERE source_team_id = ?').run(req.params.id);
    const insert = db.prepare('INSERT INTO team_transfers (id, source_team_id, target_team_id, region_id, transfer_pct) VALUES (?, ?, ?, ?, ?)');
    for (const t of (transfers || [])) {
      insert.run(uuidv4(), req.params.id, t.target_team_id, t.region_id, t.transfer_pct);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /teams/:id/transfers error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
