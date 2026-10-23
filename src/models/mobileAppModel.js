const { pool } = require('../database/db');

// In-memory fallback in case Postgres is offline / reconnecting
let memoryMobileAppSettings = {
  downloadUrl: '',
  title: 'Get the MarketOS Mobile App',
  subtitle: 'Download the mobile app for fast offline sales, barcode scanning, and multi-device sync.',
  enabled: true,
  updatedAt: new Date().toISOString()
};

const getMobileAppSettings = async () => {
  try {
    const res = await pool.query(
      'SELECT download_url, title, subtitle, enabled, updated_at FROM mobile_app_settings WHERE id = 1'
    );
    if (res.rows && res.rows[0]) {
      const row = res.rows[0];
      return {
        downloadUrl: row.download_url || '',
        title: row.title || 'Get the MarketOS Mobile App',
        subtitle: row.subtitle || 'Download the mobile app for fast offline sales, barcode scanning, and multi-device sync.',
        enabled: row.enabled !== false,
        updatedAt: row.updated_at || new Date().toISOString()
      };
    }
  } catch (err) {
    console.warn('[mobileAppModel.getMobileAppSettings] fallback to memory:', err.message);
  }
  return { ...memoryMobileAppSettings };
};

const updateMobileAppSettings = async ({ downloadUrl, title, subtitle, enabled }) => {
  const cleanUrl = typeof downloadUrl === 'string' ? downloadUrl.trim() : '';
  const cleanTitle = typeof title === 'string' && title.trim() 
    ? title.trim() 
    : 'Get the MarketOS Mobile App';
  const cleanSubtitle = typeof subtitle === 'string' && subtitle.trim() 
    ? subtitle.trim() 
    : 'Download the mobile app for fast offline sales, barcode scanning, and multi-device sync.';
  const isEnabled = enabled !== false;
  const now = new Date().toISOString();

  try {
    await pool.query(
      `INSERT INTO mobile_app_settings (id, download_url, title, subtitle, enabled, updated_at)
       VALUES (1, $1, $2, $3, $4, now())
       ON CONFLICT (id) DO UPDATE SET
         download_url = EXCLUDED.download_url,
         title = EXCLUDED.title,
         subtitle = EXCLUDED.subtitle,
         enabled = EXCLUDED.enabled,
         updated_at = now()`,
      [cleanUrl, cleanTitle, cleanSubtitle, isEnabled]
    );
  } catch (err) {
    console.warn('[mobileAppModel.updateMobileAppSettings] fallback to memory:', err.message);
  }

  memoryMobileAppSettings = {
    downloadUrl: cleanUrl,
    title: cleanTitle,
    subtitle: cleanSubtitle,
    enabled: isEnabled,
    updatedAt: now
  };

  return { ...memoryMobileAppSettings };
};

module.exports = {
  getMobileAppSettings,
  updateMobileAppSettings,
  memoryMobileAppSettings
};
