const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Service URLs - when in same pod, use localhost; cross-pod use K8s service name
const REGISTER_URL  = process.env.REGISTER_URL  || 'http://localhost:5003';
const LOGIN_URL     = process.env.LOGIN_URL      || 'http://localhost:5002';
const AUTH_URL      = process.env.AUTH_URL       || 'http://localhost:5001';
const ORDER_URL     = process.env.ORDER_URL      || 'http://order-service:5004';
const PRODUCT_URL   = process.env.PRODUCT_URL    || 'http://product-service:5005';

app.use(cors());
app.use(express.json());

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
app.all('/auth/profile',       forward(AUTH_URL));
app.all('/products',           forward(PRODUCT_URL));
app.all('/products/:id',       forward(PRODUCT_URL));
app.all('/orders',             forward(ORDER_URL));
app.all('/orders/:id',         forward(ORDER_URL));
// ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ service: 'API Gateway', status: 'UP', port: PORT }));

app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));
