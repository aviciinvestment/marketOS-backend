const crypto = require('crypto');
const paywallModel = require('../models/paywallModel');
const { addServerLog } = require('./adminService');

const PAYSTACK_BASE_URL = (process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co').replace(/\/+$/, '');
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const BACKEND_PUBLIC_URL = (process.env.BACKEND_PUBLIC_URL || 'https://marketos-backend-ubk0.onrender.com').replace(/\/+$/, '');

const isConfigured = () => Boolean(PAYSTACK_SECRET_KEY);

const logPaywall = (fields) => {
  addServerLog({
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    timestamp: new Date().toISOString(),
    method: 'PAYSTACK',
    path: '/paywall',
    status: fields.status || 200,
    durationMs: 0,
    userId: fields.userId || 'anonymous',
    ip: fields.ip || 'server',
    ...fields
  });
};

const paystackRequest = async (path, { method = 'GET', body } = {}) => {
  if (!isConfigured()) {
    const err = new Error('Payment provider is not configured on the server.');
    err.statusCode = 503;
    throw err;
  }
  const res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  if (!res.ok || !json || json.status === false) {
    const message = (json && json.message) || `Payment provider error (${res.status})`;
    const err = new Error(message);
    err.statusCode = res.status >= 400 && res.status < 500 ? 400 : 502;
    throw err;
  }
  return json.data;
};

const generateReference = () =>
  `MKOS-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const getConfig = async () => {
  const s = await paywallModel.getSettings();
  return {
    enabled: s.enabled,
    amountKobo: s.amountKobo,
    amount: s.amountKobo / 100,
    durationDays: s.durationDays,
    currency: s.currency,
    configured: isConfigured()
  };
};

const getStatus = async (userId, { exempt = false } = {}) => {
  const settings = await paywallModel.getSettings();
  const config = {
    enabled: settings.enabled,
    amountKobo: settings.amountKobo,
    amount: settings.amountKobo / 100,
    durationDays: settings.durationDays,
    currency: settings.currency,
    configured: isConfigured()
  };

  if (exempt) {
    return { ...config, required: false, hasAccess: true, exempt: true, expiresAt: null };
  }

  if (!settings.enabled) {
    return { ...config, required: false, hasAccess: true, expiresAt: null };
  }

  const access = userId ? await paywallModel.getAccess(userId) : null;
  const active = Boolean(access && new Date(access.expiresAt).getTime() > Date.now());
  return {
    ...config,
    required: true,
    hasAccess: active,
    expiresAt: active ? access.expiresAt : null
  };
};

// Records a successful transaction and (idempotently) grants Insight access.
const fulfillPayment = async (reference, paymentData, { userId, email, durationDays, ip } = {}) => {
  let existing = await paywallModel.getPayment(reference);

  const resolvedUserId = userId || (paymentData?.metadata && paymentData.metadata.userId) || existing?.userId;
  const resolvedEmail = email || paymentData?.customer?.email || existing?.email;
  const days = Number(durationDays) || existing?.durationDays || (await paywallModel.getSettings()).durationDays;

  // Ensure a payment row exists so the atomic claim below is reliable even for
  // transactions that were not initialised by this server.
  if (!existing) {
    await paywallModel.createPayment({
      reference,
      userId: resolvedUserId,
      email: resolvedEmail,
      amountKobo: paymentData?.amount || 0,
      currency: paymentData?.currency || 'NGN',
      status: 'pending',
      durationDays: days,
      raw: paymentData || null
    });
    existing = await paywallModel.getPayment(reference);
  }

  // Only the first caller to flip status pending -> success is allowed to grant.
  const claimed = await paywallModel.claimPaymentSuccess(reference, {
    channel: paymentData?.channel || existing?.channel || 'paystack',
    paidAt: paymentData?.paid_at ? new Date(paymentData.paid_at) : new Date(),
    raw: paymentData || existing?.raw || null
  });

  const alreadyFulfilled = !claimed;

  let expiresAt = null;
  if (resolvedUserId) {
    if (alreadyFulfilled) {
      const access = await paywallModel.getAccess(resolvedUserId);
      expiresAt = access ? access.expiresAt : null;
    } else {
      const granted = await paywallModel.grantAccess({
        userId: resolvedUserId,
        email: resolvedEmail,
        reference,
        amountKobo: paymentData?.amount || existing?.amountKobo || 0,
        durationDays: days
      });
      expiresAt = granted.expiresAt;
    }
  }

  if (!alreadyFulfilled) {
    logPaywall({
      status: 200,
      userId: resolvedUserId || 'anonymous',
      ip,
      method: 'PAYMENT_SUCCESS',
      reference,
      amountKobo: paymentData?.amount || existing?.amountKobo || 0,
      expiresAt
    });
  }

  return { ok: true, reference, userId: resolvedUserId, expiresAt, alreadyFulfilled };
};

const initializePayment = async ({ userId, email, name, callbackUrl, ip }) => {
  if (!userId) {
    const err = new Error('userId is required');
    err.statusCode = 400;
    throw err;
  }
  if (!email) {
    const err = new Error('A valid email is required to start payment.');
    err.statusCode = 400;
    throw err;
  }

  const settings = await paywallModel.getSettings();
  if (!settings.enabled) {
    const err = new Error('Payments are currently disabled.');
    err.statusCode = 400;
    throw err;
  }
  if (settings.amountKobo <= 0) {
    const err = new Error('The Insight price is not set. Please contact support.');
    err.statusCode = 400;
    throw err;
  }

  const reference = generateReference();
  const resolvedCallback =
    callbackUrl && /^https?:\/\//i.test(callbackUrl) ? callbackUrl : `${BACKEND_PUBLIC_URL}/api/paywall/callback`;

  const data = await paystackRequest('/transaction/initialize', {
    method: 'POST',
    body: {
      email,
      amount: settings.amountKobo,
      currency: settings.currency,
      reference,
      callback_url: resolvedCallback,
      metadata: { userId, name: name || '', purpose: 'marketos_insight_access' }
    }
  });

  await paywallModel.createPayment({
    reference,
    userId,
    email,
    amountKobo: settings.amountKobo,
    currency: settings.currency,
    status: 'pending',
    authorizationUrl: data.authorization_url,
    accessCode: data.access_code,
    durationDays: settings.durationDays,
    raw: { status: 'initialized', reference }
  });

  logPaywall({ status: 200, userId, ip, method: 'PAYMENT_INIT', reference, amountKobo: settings.amountKobo });

  return {
    reference: data.reference || reference,
    authorizationUrl: data.authorization_url,
    accessCode: data.access_code,
    amountKobo: settings.amountKobo,
    amount: settings.amountKobo / 100,
    currency: settings.currency,
    durationDays: settings.durationDays
  };
};

const verifyPayment = async (reference, ip) => {
  if (!reference) {
    const err = new Error('reference is required');
    err.statusCode = 400;
    throw err;
  }

  const local = await paywallModel.getPayment(reference);

  // If we already fulfilled this reference, return the standing access immediately.
  if (local && local.status === 'success') {
    const access = local.userId ? await paywallModel.getAccess(local.userId) : null;
    return { success: true, reference, userId: local.userId, expiresAt: access ? access.expiresAt : local.paidAt };
  }

  const data = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
  const paid = data && data.status === 'success';

  if (!paid) {
    await paywallModel.updatePaymentStatus(reference, { status: (data && data.status) || 'failed', raw: data || null });
    return { success: false, reference, status: data?.status || 'failed' };
  }

  // Guard: the amount actually paid must cover the price recorded at init time.
  const expected = local?.amountKobo ?? 0;
  if (expected > 0 && Number(data.amount) < expected) {
    logPaywall({ status: 400, userId: local?.userId, ip, method: 'PAYMENT_AMOUNT_MISMATCH', reference, amountKobo: data.amount });
    const err = new Error('Payment amount did not match. Please contact support.');
    err.statusCode = 400;
    throw err;
  }

  const result = await fulfillPayment(reference, data, { ip });
  return { success: true, ...result };
};

const handleWebhook = async (rawBody, signature, ip) => {
  if (!isConfigured()) {
    const err = new Error('Webhook not configured');
    err.statusCode = 503;
    throw err;
  }
  if (!signature || !rawBody) {
    const err = new Error('Invalid webhook signature');
    err.statusCode = 400;
    throw err;
  }

  const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
  const expected = Buffer.from(hash);
  const provided = Buffer.from(String(signature));
  const valid = expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
  if (!valid) {
    logPaywall({ status: 401, method: 'WEBHOOK_INVALID_SIGNATURE', ip });
    const err = new Error('Invalid webhook signature');
    err.statusCode = 401;
    throw err;
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    const err = new Error('Invalid webhook payload');
    err.statusCode = 400;
    throw err;
  }

  if (event && event.event === 'charge.success' && event.data) {
    const data = event.data;
    await fulfillPayment(data.reference, data, {
      userId: data.metadata && data.metadata.userId,
      email: data.customer && data.customer.email,
      ip
    });
  }

  return { ok: true };
};

const getAdminOverview = async () => {
  const settings = await paywallModel.getSettings();
  const payments = await paywallModel.listPayments(100);
  const access = await paywallModel.listActiveAccess(200);
  const successful = payments.filter((p) => p.status === 'success');
  const revenueKobo = successful.reduce((acc, p) => acc + (Number(p.amountKobo) || 0), 0);
  return {
    settings: {
      enabled: settings.enabled,
      amountKobo: settings.amountKobo,
      amount: settings.amountKobo / 100,
      durationDays: settings.durationDays,
      currency: settings.currency,
      updatedAt: settings.updatedAt
    },
    configured: isConfigured(),
    stats: {
      totalPayments: payments.length,
      successfulPayments: successful.length,
      activeSubscribers: access.length,
      revenueKobo,
      revenue: revenueKobo / 100
    },
    payments,
    access
  };
};

const updateConfig = async ({ enabled, amount, amountKobo, durationDays, currency }) => {
  // `amount` is accepted in the major unit (e.g. Naira) and converted to kobo.
  let kobo = undefined;
  if (Number.isFinite(amountKobo)) kobo = Math.round(amountKobo);
  else if (Number.isFinite(amount)) kobo = Math.round(amount * 100);
  if (Number.isFinite(kobo) && kobo < 0) {
    const err = new Error('amount cannot be negative');
    err.statusCode = 400;
    throw err;
  }
  const updated = await paywallModel.updateSettings({
    enabled: typeof enabled === 'boolean' ? enabled : undefined,
    amountKobo: kobo,
    durationDays: Number.isFinite(durationDays) ? Math.max(1, Math.round(durationDays)) : undefined,
    currency: currency || undefined
  });
  return {
    enabled: updated.enabled,
    amountKobo: updated.amountKobo,
    amount: updated.amountKobo / 100,
    durationDays: updated.durationDays,
    currency: updated.currency,
    updatedAt: updated.updatedAt
  };
};

module.exports = {
  isConfigured,
  getConfig,
  getStatus,
  initializePayment,
  verifyPayment,
  handleWebhook,
  getAdminOverview,
  updateConfig
};
