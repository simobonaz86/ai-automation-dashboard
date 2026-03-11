import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { initializeDatabase } from './db.js';
import regionsRouter from './routes/regions.js';
import teamsRouter from './routes/teams.js';
import processStepsRouter from './routes/processSteps.js';
import agentsRouter from './routes/agents.js';
import baselinesRouter from './routes/baselines.js';
import scenariosRouter from './routes/scenarios.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

initializeDatabase();

app.use('/api/regions', regionsRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/process-steps', processStepsRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/baselines', baselinesRouter);
app.use('/api/scenarios', scenariosRouter);

app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

const clientDist = join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      message: 'AI Productivity Planner API is running',
      hint: 'Run "cd client && npm run build" to serve the frontend, or use "npm run dev" for development mode.',
      api: '/api',
    });
  });
}

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack || err.message || err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

app.listen(PORT, () => {
  console.log(`AI Productivity Planner API running on http://localhost:${PORT}`);
  if (!fs.existsSync(clientDist)) {
    console.log('  Frontend not built — run "cd client && npm run build" or use "npm run dev" for development.');
  }
});
