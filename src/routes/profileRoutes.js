const express = require('express');
const { getAvatarHandler, uploadAvatarHandler } = require('../controllers/profileController');

const router = express.Router();

router.get('/avatar', getAvatarHandler);
router.post('/upload-avatar', uploadAvatarHandler);

module.exports = router;