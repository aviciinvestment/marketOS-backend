const { pool } = require('../database/db');

const memoryUserProfiles = new Map();

const recordUserProfile = async (userId, name, email) => {
  if (!userId) return;
  const cleanName = (name && typeof name === 'string' && name.trim()) 
    ? name.trim() 
    : (email && typeof email === 'string' ? email.split('@')[0] : `Merchant-${userId.slice(0, 6)}`);
  const cleanEmail = (email && typeof email === 'string' && email.trim()) ? email.trim() : '';

  try {
    await pool.query(
      `INSERT INTO user_profiles (user_id, name, email, last_active)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE SET
         name = CASE WHEN EXCLUDED.name != '' THEN EXCLUDED.name ELSE user_profiles.name END,
         email = CASE WHEN EXCLUDED.email != '' THEN EXCLUDED.email ELSE user_profiles.email END,
         last_active = now()`,
      [userId, cleanName, cleanEmail]
    );
  } catch (err) {
    const existing = memoryUserProfiles.get(userId) || {};
    memoryUserProfiles.set(userId, {
      userId,
      name: cleanName || existing.name || 'Merchant',
      email: cleanEmail || existing.email || '',
      lastActive: new Date().toISOString()
    });
  }
};

const getUserProfile = async (userId) => {
  try {
    const res = await pool.query('SELECT name, email, last_active FROM user_profiles WHERE user_id = $1', [userId]);
    if (res.rows[0]) {
      return res.rows[0];
    }
  } catch (err) {
    const mem = memoryUserProfiles.get(userId);
    if (mem) {
      return {
        name: mem.name || '',
        email: mem.email || '',
        last_active: mem.lastActive || new Date().toISOString()
      };
    }
  }
  return null;
};

module.exports = {
  recordUserProfile,
  getUserProfile,
  memoryUserProfiles
};
