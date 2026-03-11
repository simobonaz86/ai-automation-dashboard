import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (req, res) => {
  try {
    const regions = db.prepare('SELECT * FROM regions ORDER BY sort_order').all();
    res.json(regions);
  } catch (err) {
    console.error('GET /regions error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, code, is_active = 1, sort_order = 0 } = req.body;
    const id = uuidv4();
    db.prepare('INSERT INTO regions (id, name, code, is_active, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(id, name, code, is_active ? 1 : 0, sort_order);
    res.status(201).json({ id, name, code, is_active, sort_order });
  } catch (err) {
    console.error('POST /regions error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { name, code, is_active, sort_order } = req.body;
    db.prepare('UPDATE regions SET name=?, code=?, is_active=?, sort_order=? WHERE id=?')
      .run(name, code, is_active ? 1 : 0, sort_order ?? 0, req.params.id);
    res.json({ id: req.params.id, name, code, is_active, sort_order });
  } catch (err) {
    console.error('PUT /regions/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM regions WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /regions/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
