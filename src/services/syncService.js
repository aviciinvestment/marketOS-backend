const { pool, TYPES } = require('../database/db');
const { upsertRecords, applyTombstones, setDeviceFlag, getMeta, getUserRecords, getTombstones } = require('../models/syncModel');
const { recordUserProfile } = require('../models/userProfileModel');

const processSync = async ({ userId, userEmail, userName, deviceId, products, sales, expenses, deleted }) => {
  if (!userId) {
    const err = new Error('userId is required');
    err.statusCode = 400;
    throw err;
  }

  recordUserProfile(userId, userName, userEmail).catch(() => {});
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const del = deleted || {};
    for (const type of TYPES) {
      const list = { products, sales, expenses }[type];
      await upsertRecords(client, type, userId, list);
      await applyTombstones(client, type, userId, del[type], deviceId);
    }
    await client.query('COMMIT');

    if (deviceId) {
      setDeviceFlag(userId, deviceId, false).catch(() => {});
    }

    return { ok: true, serverTime: Date.now() };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const pullUserData = async (userId, name, email) => {
  if (!userId) {
    return { products: [], sales: [], expenses: [], tombstones: {}, meta: { pendingDeviceIds: [] } };
  }

  if (name || email) {
    recordUserProfile(userId, name, email).catch(() => {});
  }

  const out = {};
  for (const type of TYPES) {
    out[type] = await getUserRecords(type, userId);
  }
  const tombstones = await getTombstones(userId);
  const meta = await getMeta(userId);
  return { ...out, tombstones, meta };
};

const markDevicePending = async (userId, deviceId) => {
  await setDeviceFlag(userId, deviceId, true);
  return { ok: true };
};

const clearDevicePending = async (userId, deviceId) => {
  await setDeviceFlag(userId, deviceId, false);
  return { ok: true };
};

module.exports = {
  processSync,
  pullUserData,
  markDevicePending,
  clearDevicePending
};
