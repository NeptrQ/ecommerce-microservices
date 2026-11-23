require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const cors     = require('cors');
const dns      = require('dns');

try { dns.setServers(['8.8.8.8', '8.8.4.4']); } catch (e) {}

const app  = express();
const PORT = process.env.PORT || 5003;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce';

mongoose.connect(MONGO_URI)
  .then(() => console.log('Register Service connected to MongoDB'))
  .catch(err => console.error('MongoDB Error:', err.message));

// ─── User Schema ────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role:     { type: String, enum: ['customer', 'admin'], default: 'customer' }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
// ────────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// POST /register  —  Create a new user account
app.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'name, email and password are required' });

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(409).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user   = await User.create({ name, email, password: hashed });

    res.status(201).json({
      message: 'User registered successfully',
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ service: 'Register Service', status: 'UP' }));
app.listen(PORT, () => console.log(`Register Service running on port ${PORT}`));
