import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'data', 'planner.db');

import fs from 'fs';
fs.mkdirSync(join(__dirname, '..', 'data'), { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'Planner' CHECK(role IN ('Admin','Planner','Programme Lead','Exec Sponsor','Read-Only')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS regions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      default_color TEXT
    );

    CREATE TABLE IF NOT EXISTS team_transfers (
      id TEXT PRIMARY KEY,
      source_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      target_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      region_id TEXT REFERENCES regions(id) ON DELETE CASCADE,
      transfer_pct REAL NOT NULL DEFAULT 0,
      UNIQUE(source_team_id, target_team_id, region_id)
    );

    CREATE TABLE IF NOT EXISTS process_steps (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES process_steps(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      is_automatable INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_custom INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS step_allocations (
      id TEXT PRIMARY KEY,
      step_id TEXT NOT NULL REFERENCES process_steps(id) ON DELETE CASCADE,
      region_id TEXT REFERENCES regions(id) ON DELETE CASCADE,
      allocation_pct REAL NOT NULL DEFAULT 0,
      effective_from TEXT,
      notes TEXT,
      UNIQUE(step_id, region_id)
    );

    CREATE TABLE IF NOT EXISTS fte_baselines (
      id TEXT PRIMARY KEY,
      region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      fte_value REAL NOT NULL DEFAULT 0,
      version TEXT NOT NULL DEFAULT 'Budget 2026',
      notes TEXT,
      UNIQUE(region_id, team_id, year, month, version)
    );

    CREATE TABLE IF NOT EXISTS ai_agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Planned','Active','Retired')),
      owner TEXT,
      launch_date TEXT,
      technology_tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_step_assignments (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
      step_id TEXT NOT NULL REFERENCES process_steps(id) ON DELETE CASCADE,
      region_id TEXT REFERENCES regions(id) ON DELETE CASCADE,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      UNIQUE(agent_id, step_id, region_id)
    );

    CREATE TABLE IF NOT EXISTS assumption_profiles (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
      region_id TEXT REFERENCES regions(id) ON DELETE CASCADE,
      metric TEXT NOT NULL CHECK(metric IN ('min_automation','max_automation','adoption')),
      launch_month TEXT NOT NULL,
      milestones TEXT NOT NULL DEFAULT '[]',
      interpolation TEXT NOT NULL DEFAULT 'linear' CHECK(interpolation IN ('linear','step','s_curve')),
      notes TEXT,
      UNIQUE(agent_id, region_id, metric)
    );

    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      baseline_version TEXT NOT NULL DEFAULT 'Budget 2026',
      agent_set TEXT NOT NULL DEFAULT '[]',
      scope TEXT NOT NULL DEFAULT 'global' CHECK(scope IN ('global','per_region')),
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS growth_rates (
      id TEXT PRIMARY KEY,
      region_id TEXT REFERENCES regions(id) ON DELETE CASCADE,
      team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      growth_pct REAL NOT NULL DEFAULT 0,
      version TEXT NOT NULL DEFAULT 'Budget 2026',
      UNIQUE(region_id, team_id, year, version)
    );

    CREATE TABLE IF NOT EXISTS scenario_overrides (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
      region_id TEXT REFERENCES regions(id) ON DELETE CASCADE,
      metric TEXT NOT NULL CHECK(metric IN ('min_automation','max_automation','adoption')),
      milestones TEXT NOT NULL DEFAULT '[]',
      interpolation TEXT NOT NULL DEFAULT 'linear',
      UNIQUE(scenario_id, agent_id, region_id, metric)
    );
  `);
}

export default db;
