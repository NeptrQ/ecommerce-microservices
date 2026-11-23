require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const dns      = require('dns');

try { dns.setServers(['8.8.8.8', '8.8.4.4']); } catch (e) {}

const app  = express();
const PORT = process.env.PORT || 5004;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce';

mongoose.connect(MONGO_URI)
  .then(() => console.log('Order Service connected to MongoDB'))
  .catch(err => console.error('MongoDB Error:', err.message));

// ─── Order Schema ───────────────────────────────────────────────────
const orderItemSchema = new mongoose.Schema({
  productId:   { type: String, required: true },
  productName: { type: String, required: true },
  quantity:    { type: Number, required: true, min: 1 },
  price:       { type: Number, required: true }
});

const orderSchema = new mongoose.Schema({
  userId:     { type: String, required: true },
  customerName: { type: String, required: true },
  items:      { type: [orderItemSchema], required: true },
  totalPrice: { type: Number, required: true },
  status:     { type: String, enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'], default: 'pending' }
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);
// ────────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// GET /orders  —  List all orders
app.get('/orders', async (_req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json({ count: orders.length, orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /orders/:id  —  Get single order
app.get('/orders/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /orders  —  Create a new order
app.post('/orders', async (req, res) => {
  try {
    const { userId, customerName, items } = req.body;
    if (!userId || !customerName || !items || items.length === 0)
      return res.status(400).json({ error: 'userId, customerName and items are required' });

    const totalPrice = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const order = await Order.create({ userId, customerName, items, totalPrice });
    res.status(201).json({ message: 'Order placed successfully', order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /orders/:id  —  Update order status
app.put('/orders/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ message: 'Order status updated', order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /orders/:id  —  Cancel an order
app.delete('/orders/:id', async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled' },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ message: 'Order cancelled', order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ service: 'Order Service', status: 'UP' }));
app.listen(PORT, () => console.log(`Order Service running on port ${PORT}`));
