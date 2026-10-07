const { pool, TYPES } = require('../database/db');

// Ensure every record carries a timestamp we can compare during merges.
const stampRecord = (record, fallback) => {
  let t = Number(record.updatedAt);
  if (!t && record.timestamp) t = Number(record.timestamp) || Date.parse(record.timestamp);
  if (!t || isNaN(t)) t = fallback;
  return { ...record, updatedAt: t };
};

const upsertRecords = async (client, type, userId, records) => {
  for (const r of records || []) {
    if (!r || r.id == null) continue;
    const data = { ...stampRecord(r, Date.now()), id: r.id, userId };
    await client.query(
      `INSERT INTO ${type} (user_id, id, data) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, id) DO UPDATE
         SET data = EXCLUDED.data
         WHERE (COALESCE((${type}.data->>'updatedAt')::bigint, 0)) <
               (EXCLUDED.data->>'updatedAt')::bigint`,
      [userId, String(r.id), data]
    );
  }
};

const applyTombstones = async (client, type, userId, ids) => {
  for (const id of (ids || [])) {
    if (id == null) continue;
    await client.query(
      `DELETE FROM ${type} WHERE user_id = $1 AND id = $2`,
      [userId, String(id)]
    );
  }
};

// Per-device "pending data" flags. A device marks itself pending the moment it
// records anything locally; it clears itself once a full push reaches the DB.
// Other devices read these flags and warn the owner about unsynced data.
const setDeviceFlag = async (userId, deviceId, present) => {
  if (!userId || !deviceId) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (present) {
      await client.query(
        `INSERT INTO sync_meta (user_id, pending_devices) VALUES ($1, $2::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET
           pending_devices = CASE
             WHEN sync_meta.pending_devices @> $2::jsonb THEN sync_meta.pending_devices
             ELSE sync_meta.pending_devices || $2::jsonb
           END,
           updated_at = now()`,
        [userId, JSON.stringify([deviceId])]
      );
    } else {
      const existing = await client.query(
        'SELECT pending_devices FROM sync_meta WHERE user_id = $1',
        [userId]
      );
      let devices = existing.rows[0]?.pending_devices || [];
      devices = devices.filter((d) => d !== deviceId);
      await client.query(
        `INSERT INTO sync_meta (user_id, pending_devices, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (user_id) DO UPDATE SET pending_devices = $2::jsonb, updated_at = now()`,
        [userId, JSON.stringify(devices)]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const getMeta = async (userId) => {
  const r = await pool.query('SELECT pending_devices FROM sync_meta WHERE user_id = $1', [userId]);
  return { pendingDeviceIds: r.rows[0]?.pending_devices || [] };
};

const getUserRecords = async (type, userId) => {
  const r = await pool.query(
    `SELECT id, data FROM ${type} WHERE user_id = $1 AND COALESCE((data->>'deleted')::boolean, false) = false`,
    [userId]
  );
  return r.rows.map((row) => row.data);
};

module.exports = {
  TYPES,
  stampRecord,
  upsertRecords,
  applyTombstones,
  setDeviceFlag,
  getMeta,
  getUserRecords
};
