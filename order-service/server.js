require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const dns      = require('dns');

try { dns.setServers(['8.8.8.8', '8.8.4.4']); } catch (e) {}

const app  = express();
const PORT = process.env.PORT || 5004;
const JWT_SECRET = process.env.JWT_SECRET;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

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

app.use('/orders', authenticate, (req, res, next) => {
  if (req.method === 'PUT') {
    return requireAdmin(req, res, next);
  }
  next();
});

// Customers see only their own orders; admins can see all orders.
app.get('/orders', async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { userId: req.user.id };
    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json({ count: orders.length, orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customers can read only their own orders.
app.get('/orders/:id', async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== 'admin') {
      filter.userId = req.user.id;
    }
    const order = await Order.findOne(filter);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /orders — Create an order for the authenticated user.
app.post('/orders', async (req, res) => {
  try {
    const { customerName, items } = req.body;
    const orderCustomerName = req.user.name || customerName;
    if (!orderCustomerName || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'customerName and items are required' });
    }

    const totalPrice = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const order = await Order.create({
      userId: req.user.id,
      customerName: orderCustomerName,
      items,
      totalPrice
    });
    res.status(201).json({ message: 'Order placed successfully', order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /orders/:id — Update order status (admin only).
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

// Customers may cancel their own order; admins may cancel any order.
app.delete('/orders/:id', async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== 'admin') {
      filter.userId = req.user.id;
    }
    const order = await Order.findOneAndUpdate(filter, { status: 'cancelled' }, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ message: 'Order cancelled', order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ service: 'Order Service', status: 'UP' }));
app.listen(PORT, () => console.log(`Order Service running on port ${PORT}`));
