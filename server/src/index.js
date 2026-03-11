import express from 'express';
import cors from 'cors';
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

const clientDist = join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(join(clientDist, 'index.html'));
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`AI Productivity Planner API running on http://localhost:${PORT}`);
});
