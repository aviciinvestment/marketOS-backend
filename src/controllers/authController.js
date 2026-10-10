const {
  validateSignup,
  validateSignin,
  validateForgotPassword,
} = require('../utils/validation');
const { addServerLog } = require('../services/adminService');

/**
 * Records a rejected auth attempt into the founder's Mission Control logs so
 * server-side validation is fully observable, then returns a 400 payload.
 */
const reject = (res, result, ip, path) => {
  addServerLog({
    id: `auth-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    timestamp: new Date().toISOString(),
    method: 'AUTH',
    path,
    status: 400,
    durationMs: 1,
    userId: 'auth-validation',
    ip,
    detail: `Validation rejected: ${result.message}`,
    isClientIssue: true,
  });
  return res.status(400).json({
    ok: false,
    valid: false,
    errors: result.errors,
    error: result.message,
    message: result.message,
  });
};

const validateSignupHandler = (req, res) => {
  const result = validateSignup(req.body || {});
  if (!result.valid) return reject(res, result, req.ip, '/api/auth/validate-signup');
  return res.json({ ok: true, valid: true, message: result.message });
};

const validateSigninHandler = (req, res) => {
  const result = validateSignin(req.body || {});
  if (!result.valid) return reject(res, result, req.ip, '/api/auth/validate-signin');
  return res.json({ ok: true, valid: true, message: result.message });
};

const forgotPasswordHandler = (req, res) => {
  const result = validateForgotPassword(req.body || {});
  if (!result.valid) return reject(res, result, req.ip, '/api/auth/forgot-password');
  return res.json({
    ok: true,
    valid: true,
    message: 'Email address accepted. A password reset link can now be sent.',
  });
};

module.exports = {
  validateSignupHandler,
  validateSigninHandler,
  forgotPasswordHandler,
};
