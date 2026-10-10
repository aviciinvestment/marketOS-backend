const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Server-side validation for the sign-up / sign-in / password-reset forms.
router.post('/validate-signup', authController.validateSignupHandler);
router.post('/validate-signin', authController.validateSigninHandler);
router.post('/forgot-password', authController.forgotPasswordHandler);

module.exports = router;
