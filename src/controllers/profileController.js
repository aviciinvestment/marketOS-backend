const { uploadAvatar, isConfigured } = require('../services/cloudinaryService');
const { recordAvatarUrl, getUserProfile, recordUserProfile } = require('../models/userProfileModel');
const { validateMobile } = require('../utils/validation');

const getAvatarHandler = async (req, res) => {
  try {
    const userId = String((req.query && req.query.userId) || '').trim();
    if (!userId) return res.json({ url: '' });
    const profile = await getUserProfile(userId);
    return res.json({ url: (profile && profile.avatar_url) || '' });
  } catch (err) {
    console.error('Avatar fetch failed:', err);
    return res.json({ url: '' });
  }
};

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

const updateProfileHandler = async (req, res) => {
  try {
    const { userId, name, email, mobile } = req.body || {};
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId is required.' });
    }
    if (mobile != null && mobile !== '') {
      const mobileError = validateMobile(mobile);
      if (mobileError) {
        return res.status(400).json({ error: mobileError, message: mobileError, errors: { mobile: mobileError } });
      }
    }
    await recordUserProfile(userId, name, email, mobile);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Profile update failed:', err);
    return res.status(500).json({ error: 'Could not save profile details.' });
  }
};

module.exports = {
  getAvatarHandler,
  uploadAvatarHandler,
  updateProfileHandler,
};