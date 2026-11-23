require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const dns      = require('dns');

try { dns.setServers(['8.8.8.8', '8.8.4.4']); } catch (e) {}

const app  = express();
const PORT = process.env.PORT || 5005;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce';

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

// POST /products  —  Create a new product
app.post('/products', async (req, res) => {
  try {
    const { name, description, price, quantity, category } = req.body;
    if (!name || price === undefined || quantity === undefined)
      return res.status(400).json({ error: 'name, price and quantity are required' });

    const product = await Product.create({ name, description, price, quantity, category });
    res.status(201).json({ message: 'Product created successfully', product });
  } catch (err) {
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
