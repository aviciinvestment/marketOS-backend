const syncService = require('../services/syncService');

const sync = async (req, res) => {
  try {
    const result = await syncService.processSync(req.body || {});
    res.json(result);
  } catch (err) {
    console.error('[/api/sync] error:', err.message);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: err.message });
  }
};

const getData = async (req, res) => {
  const { userId, name, email } = req.query;
  try {
    const data = await syncService.pullUserData(userId, name, email);
    res.json(data);
  } catch (err) {
    console.error('[/api/data] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

const flagPending = async (req, res) => {
  const { userId, deviceId } = req.body || {};
  try {
    const result = await syncService.markDevicePending(userId, deviceId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const flagClear = async (req, res) => {
  const { userId, deviceId } = req.body || {};
  try {
    const result = await syncService.clearDevicePending(userId, deviceId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  sync,
  getData,
  flagPending,
  flagClear
};
