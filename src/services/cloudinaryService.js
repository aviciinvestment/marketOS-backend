const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const isConfigured = () => Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

/**
 * Uploads a base64 data URI (e.g. data:image/png;base64,...) to Cloudinary and
 * returns the secure CDN URL. Images are resized/face-cropped to a square avatar
 * and stored under the 'marketos_avatars' folder.
 */
const uploadAvatar = async (dataUri) => {
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: 'marketos_avatars',
    resource_type: 'image',
    transformation: [
      { width: 512, height: 512, crop: 'fill', gravity: 'face' },
      { quality: 'auto:eco', fetch_format: 'auto' }
    ],
    overwrite: false
  });
  return result.secure_url;
};

module.exports = {
  uploadAvatar,
  isConfigured
};