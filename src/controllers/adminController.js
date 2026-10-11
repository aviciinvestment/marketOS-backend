const adminService = require('../services/adminService');
const paywallController = require('./paywallController');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

const getStats = async (req, res) => {
  try {
    const stats = await adminService.getAdminStats(ADMIN_EMAIL);
    res.json(stats);
  } catch (err) {
    console.error('[/api/admin/stats] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

const getLogs = (_req, res) => {
  res.json({ logs: adminService.getLogs(150) });
};

const clearLogs = (_req, res) => {
  adminService.clearLogs();
  res.json({ ok: true, message: 'All server interaction logs cleared successfully' });
};

const getComplaints = async (_req, res) => {
  try {
    const complaints = await adminService.getComplaintsList();
    res.json({ complaints });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateComplaint = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  try {
    const result = await adminService.updateStatus(id, status);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await adminService.deleteUser(userId);
    res.json(result);
  } catch (err) {
    console.error('[/api/admin/users/:userId] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

const recordTelemetry = (req, res) => {
  const result = adminService.recordTelemetry(req.body, req.ip);
  res.json(result);
};

const getPaywallOverview = paywallController.getAdminOverview;
const updatePaywallConfig = paywallController.updateAdminConfig;

module.exports = {
  getStats,
  getLogs,
  clearLogs,
  getComplaints,
  updateComplaint,
  deleteUser,
  recordTelemetry,
  getPaywallOverview,
  updatePaywallConfig
};
