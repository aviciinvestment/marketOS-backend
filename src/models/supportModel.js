const { pool } = require('../database/db');

// In-memory fallback for complaints if Postgres table is unreachable
const memoryComplaints = [];

const saveComplaint = async (item) => {
  try {
    await pool.query(
      `INSERT INTO support_complaints (id, user_id, user_email, phone_number, category, message, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [item.id, item.userId, item.userEmail, item.phoneNumber, item.category, item.message, item.status, item.createdAt]
    );
  } catch (err) {
    console.warn('Fallback to memory for complaint:', err.message);
    memoryComplaints.unshift(item);
  }
};

const getComplaintsList = async () => {
  try {
    const r = await pool.query(`SELECT * FROM support_complaints ORDER BY created_at DESC LIMIT 100`);
    const list = r.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      userEmail: row.user_email,
      phoneNumber: row.phone_number,
      category: row.category,
      message: row.message,
      status: row.status,
      createdAt: row.created_at
    }));
    return [...list, ...memoryComplaints];
  } catch (err) {
    return memoryComplaints;
  }
};

const updateStatus = async (id, status) => {
  try {
    await pool.query(`UPDATE support_complaints SET status = $1 WHERE id = $2`, [status || 'resolved', id]);
    const mem = memoryComplaints.find(c => c.id === id);
    if (mem) mem.status = status || 'resolved';
    return { ok: true, id, status };
  } catch (err) {
    const mem = memoryComplaints.find(c => c.id === id);
    if (mem) mem.status = status || 'resolved';
    return { ok: true, id, status };
  }
};

const getPendingCount = async () => {
  try {
    const cRes = await pool.query(`SELECT COUNT(*) FROM support_complaints WHERE status = 'pending'`);
    return parseInt(cRes.rows[0].count) || 0;
  } catch {
    return memoryComplaints.filter(c => c.status === 'pending').length;
  }
};

module.exports = {
  memoryComplaints,
  saveComplaint,
  getComplaintsList,
  updateStatus,
  getPendingCount
};
