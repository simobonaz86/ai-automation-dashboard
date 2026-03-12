import { Router } from 'express';
import db from '../db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'ai-planner-secret-key-change-in-production';
const ALLOWED_DOMAIN = '@maersk.com';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error('POST /auth/login error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, email, name, role, is_active, created_at, last_login FROM users WHERE id = ?').get(decoded.id);
    if (!user || !user.is_active) return res.status(401).json({ error: 'User not found or deactivated' });

    res.json(user);
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('GET /auth/me error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/register', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
      if (decoded.role !== 'Admin') return res.status(403).json({ error: 'Only admins can create users' });
    } else {
      const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
      if (userCount.cnt > 0) return res.status(403).json({ error: 'Only admins can create users' });
    }

    const { email, password, name, role = 'Planner' } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail.endsWith(ALLOWED_DOMAIN)) {
      return res.status(400).json({ error: `Only ${ALLOWED_DOMAIN} email addresses are allowed` });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
      .run(id, normalizedEmail, hash, name || normalizedEmail.split('@')[0], role);

    res.status(201).json({ id, email: normalizedEmail, name, role });
  } catch (err) {
    console.error('POST /auth/register error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/users', (req, res) => {
  try {
    const users = db.prepare('SELECT id, email, name, role, is_active, created_at, last_login FROM users ORDER BY name').all();
    res.json(users);
  } catch (err) {
    console.error('GET /auth/users error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id', (req, res) => {
  try {
    const { name, role, is_active, password } = req.body;
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
    }

    db.prepare('UPDATE users SET name = ?, role = ?, is_active = ? WHERE id = ?')
      .run(name ?? existing.name, role ?? existing.role, is_active ?? existing.is_active, req.params.id);

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /auth/users/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
export { JWT_SECRET };
