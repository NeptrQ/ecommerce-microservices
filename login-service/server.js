require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const dns      = require('dns');

try { dns.setServers(['8.8.8.8', '8.8.4.4']); } catch (e) {}

const app       = express();
const PORT      = process.env.PORT || 5002;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce';

mongoose.connect(MONGO_URI)
  .then(() => console.log('Login Service connected to MongoDB'))
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

// POST /login  —  Authenticate user and return JWT
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email and password are required' });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ error: 'Invalid password' });

    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ service: 'Login Service', status: 'UP' }));
app.listen(PORT, () => console.log(`Login Service running on port ${PORT}`));
