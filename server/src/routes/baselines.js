import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/versions', (req, res) => {
  try {
    const versions = db.prepare('SELECT DISTINCT version FROM fte_baselines ORDER BY version').all();
    res.json(versions.map(v => v.version));
  } catch (err) {
    console.error('GET /baselines/versions error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/grid', (req, res) => {
  try {
    const { version = 'Budget 2026' } = req.query;
    const regions = db.prepare('SELECT * FROM regions WHERE is_active = 1 ORDER BY sort_order').all();
    const teams = db.prepare('SELECT * FROM teams').all();
    const baselines = db.prepare('SELECT * FROM fte_baselines WHERE version = ? AND year = 2026 ORDER BY month').all(version);

    const grid = [];
    for (const region of regions) {
      for (const team of teams) {
        const row = {
          region_id: region.id,
          region_name: region.name,
          region_code: region.code,
          team_id: team.id,
          team_name: team.name,
          team_code: team.code,
          months: {},
        };
        const teamRegionBaselines = baselines.filter(b => b.region_id === region.id && b.team_id === team.id);
        for (const b of teamRegionBaselines) {
          row.months[`2026-${String(b.month).padStart(2, '0')}`] = b.fte_value;
        }
        grid.push(row);
      }
    }
    res.json(grid);
  } catch (err) {
    console.error('GET /baselines/grid error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/bulk', (req, res) => {
  try {
    const { updates, version = 'Budget 2026' } = req.body;
    const upsert = db.prepare(`
      INSERT INTO fte_baselines (id, region_id, team_id, year, month, fte_value, version)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(region_id, team_id, year, month, version)
      DO UPDATE SET fte_value = excluded.fte_value
    `);
    const transaction = db.transaction(() => {
      for (const u of (updates || [])) {
        upsert.run(uuidv4(), u.region_id, u.team_id, u.year || 2026, u.month, u.fte_value, version);
      }
    });
    transaction();
    res.json({ ok: true, updated: (updates || []).length });
  } catch (err) {
    console.error('PUT /baselines/bulk error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Growth rates
router.get('/growth', (req, res) => {
  try {
    const { version = 'Budget 2026' } = req.query;
    const regions = db.prepare('SELECT * FROM regions WHERE is_active = 1 ORDER BY sort_order').all();
    const rates = db.prepare('SELECT * FROM growth_rates WHERE version = ?').all(version);

    const result = {};
    for (const year of [2027, 2028, 2029]) {
      const globalRate = rates.find(r => r.region_id === null && r.team_id === null && r.year === year);
      result[year] = {
        global: globalRate ? globalRate.growth_pct : 0,
        byRegion: {},
      };
      for (const region of regions) {
        const regionRate = rates.find(r => r.region_id === region.id && r.team_id === null && r.year === year);
        result[year].byRegion[region.id] = {
          region_code: region.code,
          region_name: region.name,
          growth_pct: regionRate !== undefined ? regionRate.growth_pct : null,
        };
      }
    }
    res.json(result);
  } catch (err) {
    console.error('GET /baselines/growth error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/growth', (req, res) => {
  try {
    const { rates, version = 'Budget 2026' } = req.body;
    db.prepare('DELETE FROM growth_rates WHERE version = ?').run(version);
    const insert = db.prepare(
      'INSERT INTO growth_rates (id, region_id, team_id, year, growth_pct, version) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const transaction = db.transaction(() => {
      for (const r of (rates || [])) {
        insert.run(uuidv4(), r.region_id || null, r.team_id || null, r.year, r.growth_pct, version);
      }
    });
    transaction();
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /baselines/growth error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/version', (req, res) => {
  try {
    const { source_version, new_version } = req.body;
    const existing = db.prepare('SELECT COUNT(*) as cnt FROM fte_baselines WHERE version = ?').get(new_version);
    if (existing.cnt > 0) return res.status(400).json({ error: 'Version already exists' });

    const rows = db.prepare('SELECT * FROM fte_baselines WHERE version = ?').all(source_version);
    const insert = db.prepare('INSERT INTO fte_baselines (id, region_id, team_id, year, month, fte_value, version, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const growthRows = db.prepare('SELECT * FROM growth_rates WHERE version = ?').all(source_version);
    const insertGrowth = db.prepare('INSERT INTO growth_rates (id, region_id, team_id, year, growth_pct, version) VALUES (?, ?, ?, ?, ?, ?)');
    const transaction = db.transaction(() => {
      for (const r of rows) insert.run(uuidv4(), r.region_id, r.team_id, r.year, r.month, r.fte_value, new_version, r.notes);
      for (const g of growthRows) insertGrowth.run(uuidv4(), g.region_id, g.team_id, g.year, g.growth_pct, new_version);
    });
    transaction();
    res.status(201).json({ ok: true, version: new_version, rows: rows.length });
  } catch (err) {
    console.error('POST /baselines/version error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
