require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const { initDB } = require('./src/database/db');
const { addServerLog } = require('./src/services/adminService');
const apiRoutes = require('./src/routes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Request Logging Middleware to capture 200, 401, 500 in real-time
app.use((req, res, next) => {
  // Don't clutter logs with admin polling every 3 seconds
  if (req.path.startsWith('/api/admin/')) {
    return next();
  }
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    addServerLog({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs: duration,
      userId: req.body?.userId || req.query?.userId || req.headers['x-user-id'] || 'anonymous',
      ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress
    });
  });
  next();
});

// Initialize database schema
initDB();

// Mount all API routes
app.use('/api', apiRoutes);

// Compatibility cron keeps a heartbeat in the logs; the real syncing happens
// synchronously inside /api/sync so the UI gets an immediate acknowledgment.
cron.schedule('*/30 * * * * *', () => {
  console.log('[Job] heartbeat');
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MarketOS backend running on http://0.0.0.0:${PORT}`);
});

module.exports = app;