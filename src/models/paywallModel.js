const { pool } = require('../database/db');

// In-memory fallback so the paywall never hard-crashes the app if Postgres has
// a hiccup. Reads degrade gracefully; writes still prefer the DB.
const memorySettings = {
  enabled: true,
  amountKobo: 500000,
  durationDays: 30,
  currency: 'NGN',
  updatedAt: new Date().toISOString()
};
const memoryPayments = new Map();
const memoryAccess = new Map();

const DEFAULT_SETTINGS = {
  enabled: true,
  amount_kobo: 500000,
  duration_days: 30,
  currency: 'NGN'
};

const getSettings = async () => {
  try {
    const res = await pool.query(
      'SELECT enabled, amount_kobo, duration_days, currency, updated_at FROM paywall_settings WHERE id = 1'
    );
    if (res.rows[0]) {
      const row = res.rows[0];
      return {
        enabled: row.enabled !== false,
        amountKobo: Number(row.amount_kobo),
        durationDays: Number(row.duration_days),
        currency: row.currency || 'NGN',
        updatedAt: row.updated_at
      };
    }
  } catch (err) {
    // fall through to memory
  }
  return { ...memorySettings };
};

const updateSettings = async ({ enabled, amountKobo, durationDays, currency }) => {
  const next = {
    enabled: typeof enabled === 'boolean' ? enabled : undefined,
    amountKobo: Number.isFinite(amountKobo) ? Math.max(0, Math.round(amountKobo)) : undefined,
    durationDays: Number.isFinite(durationDays) ? Math.max(1, Math.round(durationDays)) : undefined,
    currency: currency || undefined
  };

  try {
    const res = await pool.query(
      `UPDATE paywall_settings SET
         enabled = COALESCE($1, enabled),
         amount_kobo = COALESCE($2, amount_kobo),
         duration_days = COALESCE($3, duration_days),
         currency = COALESCE($4, currency),
         updated_at = now()
       WHERE id = 1
       RETURNING enabled, amount_kobo, duration_days, currency, updated_at`,
      [next.enabled, next.amountKobo, next.durationDays, next.currency]
    );
    if (res.rows[0]) {
      const row = res.rows[0];
      return {
        enabled: row.enabled !== false,
        amountKobo: Number(row.amount_kobo),
        durationDays: Number(row.duration_days),
        currency: row.currency || 'NGN',
        updatedAt: row.updated_at
      };
    }
  } catch (err) {
    // fall through to memory
  }

  if (next.enabled !== undefined) memorySettings.enabled = next.enabled;
  if (next.amountKobo !== undefined) memorySettings.amountKobo = next.amountKobo;
  if (next.durationDays !== undefined) memorySettings.durationDays = next.durationDays;
  if (next.currency) memorySettings.currency = next.currency;
  memorySettings.updatedAt = new Date().toISOString();
  return { ...memorySettings };
};

const createPayment = async (payment) => {
  const record = {
    reference: payment.reference,
    userId: payment.userId || null,
    email: payment.email || null,
    amountKobo: Number(payment.amountKobo) || 0,
    currency: payment.currency || 'NGN',
    status: payment.status || 'pending',
    authorizationUrl: payment.authorizationUrl || null,
    accessCode: payment.accessCode || null,
    durationDays: payment.durationDays || null,
    createdAt: new Date().toISOString(),
    paidAt: null,
    raw: payment.raw || null
  };
  memoryPayments.set(record.reference, record);
  try {
    await pool.query(
      `INSERT INTO payments
         (reference, user_id, email, amount_kobo, currency, status, authorization_url, access_code, duration_days, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (reference) DO UPDATE SET
         status = EXCLUDED.status,
         authorization_url = EXCLUDED.authorization_url,
         access_code = EXCLUDED.access_code,
         raw = EXCLUDED.raw`,
      [
        record.reference,
        record.userId,
        record.email,
        record.amountKobo,
        record.currency,
        record.status,
        record.authorizationUrl,
        record.accessCode,
        record.durationDays,
        record.raw ? JSON.stringify(record.raw) : null
      ]
    );
  } catch (err) {
    // memory already updated
  }
  return record;
};

const getPayment = async (reference) => {
  try {
    const res = await pool.query('SELECT * FROM payments WHERE reference = $1', [reference]);
    if (res.rows[0]) {
      const row = res.rows[0];
      return {
        reference: row.reference,
        userId: row.user_id,
        email: row.email,
        amountKobo: Number(row.amount_kobo),
        currency: row.currency,
        status: row.status,
        channel: row.channel,
        authorizationUrl: row.authorization_url,
        accessCode: row.access_code,
        durationDays: row.duration_days,
        paidAt: row.paid_at,
        createdAt: row.created_at,
        raw: row.raw
      };
    }
  } catch (err) {
    // fall through
  }
  return memoryPayments.get(reference) || null;
};

const updatePaymentStatus = async (reference, patch) => {
  const mem = memoryPayments.get(reference) || {};
  const merged = { ...mem, ...patch };
  memoryPayments.set(reference, merged);
  try {
    await pool.query(
      `UPDATE payments SET
         status = COALESCE($2, status),
         channel = COALESCE($3, channel),
         paid_at = COALESCE($4, paid_at),
         raw = COALESCE($5, raw)
       WHERE reference = $1`,
      [
        reference,
        patch.status || null,
        patch.channel || null,
        patch.paidAt || null,
        patch.raw ? JSON.stringify(patch.raw) : null
      ]
    );
  } catch (err) {
    // memory already updated
  }
  return merged;
};

// Atomically transitions a payment to `success`. Returns true only for the call
// that actually performs the transition — this guarantees a single grant even
// if the webhook and the client verify race each other.
const claimPaymentSuccess = async (reference, patch = {}) => {
  const mem = memoryPayments.get(reference);
  let claimedMem = false;
  if (mem && mem.status !== 'success') {
    memoryPayments.set(reference, { ...mem, ...patch, status: 'success' });
    claimedMem = true;
  }
  try {
    const res = await pool.query(
      `UPDATE payments SET
         status = 'success',
         channel = COALESCE($2, channel),
         paid_at = COALESCE($3, paid_at),
         raw = COALESCE($4, raw)
       WHERE reference = $1 AND status <> 'success'
       RETURNING reference`,
      [
        reference,
        patch.channel || null,
        patch.paidAt || null,
        patch.raw ? JSON.stringify(patch.raw) : null
      ]
    );
    return res.rowCount > 0;
  } catch (err) {
    return claimedMem;
  }
};

const listPayments = async (limit = 100) => {
  try {
    const res = await pool.query(
      `SELECT reference, user_id, email, amount_kobo, currency, status, channel, paid_at, created_at
       FROM payments ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return res.rows.map((row) => ({
      reference: row.reference,
      userId: row.user_id,
      email: row.email,
      amountKobo: Number(row.amount_kobo),
      currency: row.currency,
      status: row.status,
      channel: row.channel,
      paidAt: row.paid_at,
      createdAt: row.created_at
    }));
  } catch (err) {
    return Array.from(memoryPayments.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }
};

const grantAccess = async ({ userId, email, reference, amountKobo, durationDays }) => {
  const days = Math.max(1, Math.round(Number(durationDays) || 30));
  let expiresAt;
  try {
    const res = await pool.query(
      `INSERT INTO insight_access (user_id, email, reference, amount_kobo, paid_at, expires_at)
       VALUES ($1, $2, $3, $4, now(), now() + ($5 || ' days')::interval)
       ON CONFLICT (user_id) DO UPDATE SET
         email = EXCLUDED.email,
         reference = EXCLUDED.reference,
         amount_kobo = EXCLUDED.amount_kobo,
         paid_at = now(),
         expires_at = GREATEST(insight_access.expires_at, now()) + ($5 || ' days')::interval
       RETURNING expires_at`,
      [userId, email || null, reference || null, Number(amountKobo) || 0, days]
    );
    expiresAt = res.rows[0]?.expires_at;
  } catch (err) {
    // fall through
  }
  const iso = expiresAt ? new Date(expiresAt).toISOString() : new Date(Date.now() + days * 86400000).toISOString();
  memoryAccess.set(userId, {
    userId,
    email: email || null,
    reference: reference || null,
    amountKobo: Number(amountKobo) || 0,
    paidAt: new Date().toISOString(),
    expiresAt: iso
  });
  return { userId, expiresAt: iso };
};

const getAccess = async (userId) => {
  if (!userId) return null;
  try {
    const res = await pool.query(
      'SELECT user_id, email, reference, amount_kobo, paid_at, expires_at FROM insight_access WHERE user_id = $1',
      [userId]
    );
    if (res.rows[0]) {
      const row = res.rows[0];
      return {
        userId: row.user_id,
        email: row.email,
        reference: row.reference,
        amountKobo: Number(row.amount_kobo),
        paidAt: row.paid_at,
        expiresAt: row.expires_at
      };
    }
  } catch (err) {
    // fall through
  }
  return memoryAccess.get(userId) || null;
};

const listActiveAccess = async (limit = 200) => {
  try {
    const res = await pool.query(
      `SELECT user_id, email, reference, amount_kobo, paid_at, expires_at
       FROM insight_access WHERE expires_at > now()
       ORDER BY expires_at DESC LIMIT $1`,
      [limit]
    );
    return res.rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      reference: row.reference,
      amountKobo: Number(row.amount_kobo),
      paidAt: row.paid_at,
      expiresAt: row.expires_at
    }));
  } catch (err) {
    return Array.from(memoryAccess.values()).filter((a) => new Date(a.expiresAt).getTime() > Date.now());
  }
};

module.exports = {
  getSettings,
  updateSettings,
  createPayment,
  getPayment,
  updatePaymentStatus,
  claimPaymentSuccess,
  listPayments,
  grantAccess,
  getAccess,
  listActiveAccess,
  DEFAULT_SETTINGS,
  memorySettings
};
