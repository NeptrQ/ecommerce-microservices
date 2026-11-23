require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const requestLogger = require('../utils/logger');

const app = express();
const PORT = process.env.PORT || 5011;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}
// Service URLs - when in same pod, use localhost; cross-pod use K8s service name
const REGISTER_URL  = process.env.REGISTER_URL  || 'http://localhost:5003';
const LOGIN_URL     = process.env.LOGIN_URL      || 'http://localhost:5002';
const AUTH_URL      = process.env.AUTH_URL       || 'http://localhost:5001';
const ORDER_URL     = process.env.ORDER_URL      || 'http://order-service:5004';
const PRODUCT_URL   = process.env.PRODUCT_URL    || 'http://product-service:5005';

app.use(cors());
app.use(express.json());
app.use(requestLogger('gateway'));

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

// Helper: forward request to target service
const forward = (targetUrl) => async (req, res) => {
  try {
    const url = `${targetUrl}${req.path}`;
    const response = await axios({
      method: req.method,
      url,
      data: req.body,
      headers: { Authorization: req.headers.authorization || '' }
    });
    res.status(response.status).json(response.data);
  } catch (err) {
    const status = err.response ? err.response.status : 500;
    const data   = err.response ? err.response.data   : { error: err.message };
    res.status(status).json(data);
  }
};

// ─── Route Forwarding ───────────────────────────────────────────────
app.all('/register',           forward(REGISTER_URL));
app.all('/login',              forward(LOGIN_URL));
app.all('/auth/verify',        forward(AUTH_URL));
app.all('/auth/profile',       authenticate, forward(AUTH_URL));
app.get('/products',           forward(PRODUCT_URL));
app.get('/products/:id',       forward(PRODUCT_URL));
app.post('/products',          authenticate, requireAdmin, forward(PRODUCT_URL));
app.put('/products/:id',       authenticate, requireAdmin, forward(PRODUCT_URL));
app.delete('/products/:id',    authenticate, requireAdmin, forward(PRODUCT_URL));
app.get('/orders',             authenticate, forward(ORDER_URL));
app.post('/orders',            authenticate, forward(ORDER_URL));
app.get('/orders/:id',         authenticate, forward(ORDER_URL));
app.put('/orders/:id',         authenticate, requireAdmin, forward(ORDER_URL));
app.delete('/orders/:id',      authenticate, forward(ORDER_URL));
// ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ service: 'API Gateway', status: 'UP', port: PORT }));

app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));
