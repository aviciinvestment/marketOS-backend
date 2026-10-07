const { saveComplaint } = require('../models/supportModel');
const { addServerLog } = require('./adminService');

const registerComplaint = async (data, ip) => {
  const { id, userId, email, phoneNumber, category, message, createdAt } = data || {};
  if (!phoneNumber || !message) {
    const err = new Error('Phone number and message are required');
    err.statusCode = 400;
    throw err;
  }

  const complaintId = id || `comp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const item = {
    id: complaintId,
    userId: userId || 'anonymous',
    userEmail: email || 'No email provided',
    phoneNumber,
    category: category || 'General',
    message,
    status: 'pending',
    createdAt: createdAt || new Date().toISOString()
  };

  await saveComplaint(item);

  // Also log to real-time server interaction log
  addServerLog({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    method: 'SUPPORT',
    path: '/api/support/complaint',
    status: 201,
    durationMs: 5,
    userId: item.userEmail,
    ip,
    detail: `Complaint lodged by ${phoneNumber} (${category})`
  });

  return { ok: true, id: complaintId, message: 'Complaint registered successfully' };
};

module.exports = {
  registerComplaint
};
