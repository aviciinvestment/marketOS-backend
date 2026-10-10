const express = require('express');
const { getAvatarHandler, uploadAvatarHandler, updateProfileHandler } = require('../controllers/profileController');

const router = express.Router();

router.get('/avatar', getAvatarHandler);
router.post('/upload-avatar', uploadAvatarHandler);
router.post('/update', updateProfileHandler);

module.exports = router;