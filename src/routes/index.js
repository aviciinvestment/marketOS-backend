const express = require('express');
const router = express.Router();

const healthRoutes = require('./healthRoutes');
const syncRoutes = require('./syncRoutes');
const supportRoutes = require('./supportRoutes');
const adminRoutes = require('./adminRoutes');
const profileRoutes = require('./profileRoutes');
const authRoutes = require('./authRoutes');
const paywallRoutes = require('./paywallRoutes');

// Mount routes under /api
router.use('/', healthRoutes);
router.use('/', syncRoutes);
router.use('/', supportRoutes);
router.use('/', adminRoutes);
router.use('/', paywallRoutes);
router.use('/profile', profileRoutes);
router.use('/auth', authRoutes);

module.exports = router;
