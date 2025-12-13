const PrintSettings = require('../models/printSettings');

/**
 * Display print configuration page
 */
async function getConfig(req, res) {
  try {
    const options = PrintSettings.getAvailableOptions();
    const defaults = PrintSettings.getDefaults();

    res.render('configure', {
      options,
      defaults,
      error: null,
      success: null
    });
  } catch (err) {
    console.error('Config page error:', err);
    res.status(500).render('error', { error: 'Failed to load configuration page' });
  }
}

/**
 * Handle print configuration form submission
 */
async function postConfig(req, res) {
  try {
    const { paperType, printQuality, colorMode, paperSize } = req.body;

    // Create settings object from form data
    const settings = {
      paperType,
      printQuality,
      colorMode,
      paperSize
    };

    // Validate settings
    const validation = PrintSettings.validateSettings(settings);

    if (!validation.isValid) {
      const options = PrintSettings.getAvailableOptions();
      const defaults = PrintSettings.getDefaults();

      return res.render('configure', {
        options,
        defaults,
        error: validation.errors.join('; '),
        success: null
      });
    }

    // Normalize settings
    const normalizedSettings = PrintSettings.normalizeSettings(settings);

    // Store settings in session for use in job submission
    req.session.printSettings = normalizedSettings;

    const options = PrintSettings.getAvailableOptions();
    const defaults = PrintSettings.getDefaults();

    res.render('configure', {
      options,
      defaults,
      error: null,
      success: 'Print settings saved successfully'
    });
  } catch (err) {
    console.error('Config submission error:', err);
    const options = PrintSettings.getAvailableOptions();
    const defaults = PrintSettings.getDefaults();

    res.render('configure', {
      options,
      defaults,
      error: 'An error occurred while saving settings',
      success: null
    });
  }
}

/**
 * Get current print settings from session
 * @param {Object} req - Express request object
 * @returns {Object} Current print settings or defaults
 */
function getCurrentSettings(req) {
  if (req.session && req.session.printSettings) {
    return req.session.printSettings;
  }
  return PrintSettings.getDefaults();
}

module.exports = {
  getConfig,
  postConfig,
  getCurrentSettings
};
