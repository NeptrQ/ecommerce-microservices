require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const dns      = require('dns');

try { dns.setServers(['8.8.8.8', '8.8.4.4']); } catch (e) {}

const app        = express();
const PORT       = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';
const MONGO_URI  = process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce';

mongoose.connect(MONGO_URI)
  .then(() => console.log('Auth Service connected to MongoDB'))
  .catch(err => console.error('MongoDB Error:', err.message));

// ─── Shared User Schema ─────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name:     String,
  email:    { type: String, unique: true },
  password: String,
  role:     { type: String, default: 'customer' }
});
const User = mongoose.model('User', userSchema);
// ────────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// Middleware: verify JWT from Authorization header
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token provided' });

  try {
    const token   = authHeader.split(' ')[1];
    req.user      = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// POST /auth/verify  —  Validate a JWT token
app.post('/auth/verify', (req, res) => {
  const { token } = req.body;
  if (!token)
    return res.status(400).json({ error: 'Token is required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch {
    res.status(401).json({ valid: false, error: 'Invalid or expired token' });
  }
});

// GET /auth/profile  —  Get current user profile (requires valid JWT)
app.get('/auth/profile', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ service: 'Auth Service', status: 'UP' }));
app.listen(PORT, () => console.log(`Auth Service running on port ${PORT}`));
