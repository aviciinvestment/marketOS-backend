const paywallService = require('../services/paywallService');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();

const isExemptEmail = (email) =>
  Boolean(email && ADMIN_EMAIL && String(email).toLowerCase() === ADMIN_EMAIL);

const getConfig = async (_req, res) => {
  try {
    const config = await paywallService.getConfig();
    res.json(config);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};

const getStatus = async (req, res) => {
  try {
    const { userId, email } = req.query || {};
    const status = await paywallService.getStatus(userId, { exempt: isExemptEmail(email) });
    res.json(status);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};

const initialize = async (req, res) => {
  const { userId, email, name, callbackUrl } = req.body || {};
  try {
    const data = await paywallService.initializePayment({ userId, email, name, callbackUrl, ip: req.ip });
    res.json({ ok: true, ...data });
  } catch (err) {
    console.error('[/api/paywall/initialize] error:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};

const verify = async (req, res) => {
  try {
    const result = await paywallService.verifyPayment(req.params.reference, req.ip);
    res.json(result);
  } catch (err) {
    console.error('[/api/paywall/verify] error:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};

// Tiny landing page shown after a mobile user completes payment in the browser,
// telling them to return to the app (where verification happens automatically).
const callback = (_req, res) => {
  res.set('Content-Type', 'text/html');
  res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Payment received · marketOS</title>
    <style>
      body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
        background:#020617; color:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
      .card { text-align:center; padding:40px 28px; max-width:360px; }
      .badge { width:64px; height:64px; border-radius:50%; background:rgba(16,185,129,.15);
        border:1px solid rgba(16,185,129,.4); display:flex; align-items:center; justify-content:center; margin:0 auto 20px; font-size:30px; }
      h1 { font-size:20px; margin:0 0 8px; }
      p { color:#94a3b8; font-size:14px; line-height:1.5; margin:0; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">✓</div>
      <h1>Payment received</h1>
      <p>You can now close this page and return to the marketOS app to unlock Insights.</p>
    </div>
  </body>
</html>`);
};

const webhook = async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    await paywallService.handleWebhook(req.rawBody, signature, req.ip);
    res.sendStatus(200);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};

const getAdminOverview = async (_req, res) => {
  try {
    const overview = await paywallService.getAdminOverview();
    res.json(overview);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};

const updateAdminConfig = async (req, res) => {
  try {
    const { enabled, amount, amountKobo, durationDays, currency } = req.body || {};
    const settings = await paywallService.updateConfig({ enabled, amount, amountKobo, durationDays, currency });
    res.json({ ok: true, settings });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};

module.exports = {
  getConfig,
  getStatus,
  initialize,
  verify,
  callback,
  webhook,
  getAdminOverview,
  updateAdminConfig
};
