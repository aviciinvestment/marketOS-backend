const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

router.get('/admin/stats', adminController.getStats);
router.get('/admin/logs', adminController.getLogs);
router.delete('/admin/logs', adminController.clearLogs);
router.get('/admin/complaints', adminController.getComplaints);
router.patch('/admin/complaints/:id', adminController.updateComplaint);
router.delete('/admin/users/:userId', adminController.deleteUser);
router.post('/admin/telemetry', adminController.recordTelemetry);
router.get('/admin/paywall', adminController.getPaywallOverview);
router.put('/admin/paywall', adminController.updatePaywallConfig);
router.get('/admin/mobile-app', adminController.getMobileAppConfig);
router.put('/admin/mobile-app', adminController.updateMobileAppConfig);
router.get('/mobile-app-link', adminController.getPublicMobileAppConfig);

module.exports = router;
