const { uploadAvatar, isConfigured } = require('../services/cloudinaryService');
const { recordAvatarUrl } = require('../models/userProfileModel');

const uploadAvatarHandler = async (req, res) => {
  try {
    const { image, userId } = req.body || {};
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'A valid image data URL is required.' });
    }
    if (!isConfigured()) {
      return res.status(503).json({ error: 'Cloudinary is not configured on the server.' });
    }
    const url = await uploadAvatar(image);
    if (userId && typeof userId === 'string') {
      try {
        await recordAvatarUrl(userId, url);
      } catch (err) {
        console.error('Failed to persist avatar url', err);
      }
    }
    return res.json({ url });
  } catch (err) {
    console.error('Avatar upload failed:', err);
    return res.status(500).json({ error: 'Image upload failed. Please try again.' });
  }
};

module.exports = {
  uploadAvatarHandler
};