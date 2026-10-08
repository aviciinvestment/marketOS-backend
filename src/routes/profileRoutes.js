const express = require('express');
const { uploadAvatarHandler } = require('../controllers/profileController');

const router = express.Router();

router.post('/upload-avatar', uploadAvatarHandler);

module.exports = router;