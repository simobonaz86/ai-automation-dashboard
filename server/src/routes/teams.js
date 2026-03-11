import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (req, res) => {
  const teams = db.prepare('SELECT * FROM teams').all();
  const transfers = db.prepare('SELECT * FROM team_transfers').all();
  res.json(teams.map(t => ({
    ...t,
    transfers: transfers.filter(tr => tr.source_team_id === t.id),
  })));
});

router.post('/', (req, res) => {
  const { name, code, default_color } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO teams (id, name, code, default_color) VALUES (?, ?, ?, ?)')
    .run(id, name, code, default_color);
  res.status(201).json({ id, name, code, default_color });
});

router.put('/:id', (req, res) => {
  const { name, code, default_color } = req.body;
  db.prepare('UPDATE teams SET name=?, code=?, default_color=? WHERE id=?')
    .run(name, code, default_color, req.params.id);
  res.json({ id: req.params.id, ...req.body });
});

router.put('/:id/transfers', (req, res) => {
  const { transfers } = req.body;
  db.prepare('DELETE FROM team_transfers WHERE source_team_id = ?').run(req.params.id);
  const insert = db.prepare('INSERT INTO team_transfers (id, source_team_id, target_team_id, region_id, transfer_pct) VALUES (?, ?, ?, ?, ?)');
  for (const t of transfers) {
    insert.run(uuidv4(), req.params.id, t.target_team_id, t.region_id, t.transfer_pct);
  }
  res.json({ ok: true });
});

export default router;
