require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const dns      = require('dns');

try { dns.setServers(['8.8.8.8', '8.8.4.4']); } catch (e) {}

const app  = express();
const PORT = process.env.PORT || 5005;
const JWT_SECRET = process.env.JWT_SECRET;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('Product Service connected to MongoDB'))
  .catch(err => console.error('MongoDB Error:', err.message));

// ─── Product Schema ─────────────────────────────────────────────────
const productSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  price:       { type: Number, required: true, min: 0 },
  quantity:    { type: Number, required: true, min: 0 },
  category:    { type: String, default: 'General' }
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);
// ────────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

const authenticate = (req, res, next) => {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  if (!match) {
    return res.status(401).json({ error: 'Bearer token is required' });
  }

  let user;
  try {
    user = jwt.verify(match[1], JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (!user || typeof user !== 'object' || typeof user.id !== 'string' ||
      !['customer', 'admin'].includes(user.role)) {
    return res.status(401).json({ error: 'Invalid token claims' });
  }

  req.user = user;
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

app.use('/products', (req, res, next) => {
  if (req.method === 'GET') {
    return next();
  }
  authenticate(req, res, () => requireAdmin(req, res, next));
});

// GET /products  —  List all products
app.get('/products', async (_req, res) => {
  try {
    const products = await Product.find();
    res.json({ count: products.length, products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /products/:id  —  Get single product
app.get('/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /products — Create one or more products (admin only)
app.post('/products', async (req, res) => {
  try {
    // Support either a raw array in req.body or { products: [...] }
    const items = Array.isArray(req.body) ? req.body : req.body.products;

    if (Array.isArray(items)) {
      if (items.length === 0) {
        return res.status(400).json({ error: 'An array of products is required' });
      }

      const isInvalid = items.some(
        (item) => !item.name || item.price == null || item.quantity == null
      );
      if (isInvalid) {
        return res.status(400).json({
          error: 'Every product must include name, price, and quantity',
        });
      }

      const products = await Product.insertMany(items);
      return res.status(201).json({
        message: `${products.length} products created successfully`,
        products,
      });
    }

    const { name, description, price, quantity, category } = req.body;
    if (!name || price === undefined || quantity === undefined) {
      return res.status(400).json({ error: 'name, price and quantity are required' });
    }

    const product = await Product.create({ name, description, price, quantity, category });
    res.status(201).json({ message: 'Product created successfully', product });
  } catch (err) {
    if (err.name === 'ValidationError' || err.name === 'CastError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /products/:id  —  Update product
app.put('/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product updated successfully', product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /products/:id  —  Delete product
app.delete('/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted successfully', product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ service: 'Product Service', status: 'UP' }));
app.listen(PORT, () => console.log(`Product Service running on port ${PORT}`));
