# AI Productivity Planner

Web application for modelling FTE productivity savings from AI agent deployment across CX and Operations functions. Replaces the Excel model (Landside_AI_Productivity_v8.xlsx) while preserving all calculation logic, adding a fully dynamic process library, agent registry, and scenario engine.

## Quick Start

**Important:** Make sure you are in the project root directory (where `package.json` is) before running any commands.

```bash
# 1. Install dependencies + seed database (one command)
npm run setup

# 2. Run in development mode (hot-reload on both server and client)
npm run dev
```

The app will be available at:
- **Frontend (dev):** http://localhost:5173
- **API server:** http://localhost:3001

### Production mode (single port)

```bash
npm run build
npm start
```

Then open http://localhost:3001.

### Step-by-step (if `npm run setup` fails)

```bash
npm install                        # root dependencies
npm install --prefix server        # server dependencies
npm install --prefix client        # client dependencies
npm run seed                       # seed the SQLite database
```

## Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 19 + Vite + Tailwind CSS 4 | SPA with routing, charts, forms |
| Backend | Express.js (Node.js) | REST API, calculation engine |
| Database | SQLite (via better-sqlite3) | Local file-based storage |
| Charts | Recharts | Line, bar, area, and pie charts |
| Icons | Lucide React | Modern icon library |

## Modules

### 1. Process Library (`/process-library`)
- Collapsible tree view of process steps grouped by team (CX, Ops)
- Add/edit/delete steps at any depth
- Inline allocation % editing with live validation (children must sum to 100%)
- Automatable flag for leaf steps eligible for AI agent assignment

### 2. Agent Registry (`/agents`)
- Create and manage AI agents with lifecycle status (Draft/Planned/Active/Retired)
- Assign agents to one or many process steps
- Ramp Builder: define quarterly milestones and see interpolated 48-month curves
- Three metrics per agent: Min Automation %, Max Automation %, Adoption %
- Clone agent functionality

### 3. FTE Baselines (`/baselines`)
- Spreadsheet-style grid for monthly headcount entry per region and team
- Clipboard paste support (copy from Excel/Sheets)
- Multiple named baseline versions (Budget, Reforecast, etc.)
- Year tabs with live row and column totals

### 4. Scenario Planner (`/scenarios`)
- Named scenarios combining agent selections with baseline versions
- Side-by-side comparison of up to 3 scenarios
- Per-scenario scope (global or per-region profiles)

### 5. Dashboard (`/dashboard`)
- Overview: total FTE baseline vs saved (Min/Max), yearly progression charts
- By Region: bar charts and detailed tables per region per year
- By Process Step: tree view with allocated FTE and savings
- Agent Entitlement: FTE pool per agent with savings breakdown
- Presentation Mode: full-screen, no editing controls

## Calculation Engine

Per scenario, per region, per month:
1. Resolve FTE Baseline from the selected version
2. Apply cross-team transfer percentages
3. Walk the process tree: multiply net FTE by effective allocation % (root to leaf)
4. Resolve agent assumptions (adoption %, min/max automation %) using milestone interpolation
5. Calculate FTE Saved Min = Allocated FTE x Adoption% x Min Automation%
6. Calculate FTE Saved Max = Allocated FTE x Adoption% x Max Automation%
7. Aggregate recursively from leaf to parent to team to region to global

## Seed Data

The database is pre-populated with data matching the Excel v8 model:
- **5 Regions:** Europe, North America, Latin America, Asia Pacific, IMEA
- **2 Teams:** CX (8 process steps), Ops (4 top-level + 5 EH sub-steps)
- **4 AI Agents:** Vendor Milestone Collection, Customer Comms, Dispute Handler, Chargeback Processor
- **FTE Baselines:** Budget 2026, monthly values for 2026-2029
- **1 Default Scenario:** Base Case 2026

## Project Structure

```
├── client/                  # React frontend
│   ├── src/
│   │   ├── pages/           # Page components (5 modules)
│   │   ├── components/      # Shared components (Modal, StatusBadge)
│   │   ├── api.js           # API client
│   │   ├── App.jsx          # Root component with routing
│   │   └── index.css        # Tailwind CSS + custom styles
│   └── vite.config.js
├── server/                  # Express backend
│   ├── src/
│   │   ├── routes/          # API route handlers
│   │   ├── utils/           # Calculation engine
│   │   ├── db.js            # SQLite database setup
│   │   ├── seed.js          # Database seed script
│   │   └── index.js         # Server entry point
│   └── data/                # SQLite database file (gitignored)
└── package.json             # Root workspace scripts
```
