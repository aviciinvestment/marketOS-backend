const express = require('express');
const router = express.Router();
const paywallController = require('../controllers/paywallController');

// Paystack webhook — raw body is captured in server.js for signature checks.
router.post('/paywall/webhook', paywallController.webhook);
router.get('/paywall/callback', paywallController.callback);
router.get('/paywall/config', paywallController.getConfig);
router.get('/paywall/status', paywallController.getStatus);
router.post('/paywall/initialize', paywallController.initialize);
router.get('/paywall/verify/:reference', paywallController.verify);

module.exports = router;
