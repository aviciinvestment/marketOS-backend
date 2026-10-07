const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

router.get('/admin/stats', adminController.getStats);
router.get('/admin/logs', adminController.getLogs);
router.delete('/admin/logs', adminController.clearLogs);
router.get('/admin/complaints', adminController.getComplaints);
router.patch('/admin/complaints/:id', adminController.updateComplaint);
router.post('/admin/telemetry', adminController.recordTelemetry);

module.exports = router;
