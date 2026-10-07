const express = require('express');
const router = express.Router();

const healthRoutes = require('./healthRoutes');
const syncRoutes = require('./syncRoutes');
const supportRoutes = require('./supportRoutes');
const adminRoutes = require('./adminRoutes');

// Mount routes under /api
router.use('/', healthRoutes);
router.use('/', syncRoutes);
router.use('/', supportRoutes);
router.use('/', adminRoutes);

module.exports = router;
