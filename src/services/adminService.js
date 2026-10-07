const { pool } = require('../database/db');
const { memoryUserProfiles, getUserProfile } = require('../models/userProfileModel');
const { memoryComplaints, getPendingCount, getComplaintsList, updateStatus } = require('../models/supportModel');

// Real-time server interaction logs buffer (stores last 500 requests)
const serverLogs = [];
const addServerLog = (log) => {
  serverLogs.unshift(log);
  if (serverLogs.length > 500) serverLogs.pop();
};

const getLogs = (limit = 150) => {
  return serverLogs.slice(0, limit);
};

const clearLogs = () => {
  serverLogs.length = 0;
};

const recordTelemetry = (body, ip) => {
  const { type, message, userId, userEmail, status } = body || {};
  addServerLog({
    id: `telemetry-${Date.now()}`,
    timestamp: new Date().toISOString(),
    method: type || 'CLIENT_ISSUE',
    path: message || 'Client Reported Error',
    status: status || 401,
    durationMs: 0,
    userId: userEmail || userId || 'unknown',
    ip,
    isClientIssue: true
  });
  return { ok: true };
};

const getAdminStats = async (adminEmail) => {
  // 1. Unique users count from products / sales / sync_meta / user_profiles
  const userQuery = await pool.query(`
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM products
      UNION
      SELECT user_id FROM sales
      UNION
      SELECT user_id FROM expenses
      UNION
      SELECT user_id FROM sync_meta
      UNION
      SELECT user_id FROM user_profiles
    ) u
  `);
  const totalUsers = Math.max(1, userQuery.rows.length);

  // 2. HTTP Status breakdown
  const statusCounts = { 200: 0, 201: 0, 400: 0, 401: 0, 403: 0, 404: 0, 500: 0, other: 0 };
  serverLogs.forEach(l => {
    if (statusCounts[l.status] !== undefined) {
      statusCounts[l.status]++;
    } else {
      statusCounts.other++;
    }
  });

  // 3. User listings with full names, emails, phones, product count, and sales volumes
  const allUserIds = userQuery.rows.map(r => r.user_id);
  const userList = await Promise.all(allUserIds.map(async (uid) => {
    let name = '';
    let email = uid.includes('@') ? uid : '';
    let lastActive = new Date().toISOString();
    let productsCount = 0;
    let salesCount = 0;
    let totalVolume = 0;

    try {
      const pRes = await pool.query('SELECT name, email, last_active FROM user_profiles WHERE user_id = $1', [uid]);
      if (pRes.rows[0]) {
        name = pRes.rows[0].name || '';
        if (pRes.rows[0].email) email = pRes.rows[0].email;
        if (pRes.rows[0].last_active) lastActive = pRes.rows[0].last_active;
      }
    } catch (e) {
      const mem = memoryUserProfiles.get(uid);
      if (mem) {
        name = mem.name || '';
        if (mem.email) email = mem.email;
        if (mem.lastActive) lastActive = mem.lastActive;
      }
    }

    // Check if user has filed a complaint with a verified phone number
    let phone = '';
    try {
      const compR = await pool.query('SELECT phone_number, user_email FROM support_complaints WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [uid]);
      if (compR.rows[0]) {
        phone = compR.rows[0].phone_number;
        if (!email && compR.rows[0].user_email) email = compR.rows[0].user_email;
      }
    } catch {}

    // Calculate products count
    try {
      const prodR = await pool.query('SELECT COUNT(*) FROM products WHERE user_id = $1', [uid]);
      productsCount = parseInt(prodR.rows[0]?.count) || 0;
    } catch {}

    // Calculate sales count and volume
    try {
      const salesR = await pool.query('SELECT data FROM sales WHERE user_id = $1', [uid]);
      salesCount = salesR.rows.length;
      totalVolume = salesR.rows.reduce((sum, r) => sum + (Number(r.data?.price) || Number(r.data?.total) || 0), 0);
    } catch {}

    // Nicely format the name if still generic
    if (!name) {
      if (email && email.includes('@')) {
        const raw = email.split('@')[0];
        name = raw.replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      } else {
        name = `Merchant ${uid.slice(0, 6).toUpperCase()}`;
      }
    }

    return {
      userId: uid,
      name,
      email: email || 'Direct Store Account',
      phone,
      productsCount,
      salesCount,
      totalVolume,
      lastActive
    };
  }));

  // 4. Complaints counts
  const complaintsCount = await getPendingCount();

  return {
    adminEmail,
    totalUsers,
    userList,
    statusCounts,
    pendingComplaints: complaintsCount,
    serverUptimeSec: Math.floor(process.uptime()),
    serverTime: new Date().toISOString()
  };
};

module.exports = {
  serverLogs,
  addServerLog,
  getLogs,
  clearLogs,
  recordTelemetry,
  getAdminStats,
  getComplaintsList,
  updateStatus
};
