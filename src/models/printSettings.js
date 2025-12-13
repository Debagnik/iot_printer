/**
 * Print Settings Model
 * Manages print configuration options and defaults
 */

// Default print settings
const DEFAULT_SETTINGS = {
  paperType: 'Plain Paper',
  printQuality: 600,
  colorMode: 'Grayscale',
  paperSize: 'A4'
};

// Available options for each setting
const AVAILABLE_OPTIONS = {
  paperTypes: ['Plain Paper', 'Glossy'],
  printQualities: [600, 1200],
  colorModes: ['Color', 'Grayscale'],
  paperSizes: ['A4', 'Letter', 'Legal']
};

/**
 * Get default print settings
 * @returns {Object} Default settings object
 */
function getDefaults() {
  return { ...DEFAULT_SETTINGS };
}

/**
 * Get all available options
 * @returns {Object} Available options for each setting
 */
function getAvailableOptions() {
  return { ...AVAILABLE_OPTIONS };
}

/**
 * Validate print settings
 * @param {Object} settings - Settings to validate
 * @returns {Object} { isValid: boolean, errors: Array<string> }
 */
function validateSettings(settings) {
  const errors = [];

  if (!settings) {
    return {
      isValid: false,
      errors: ['Settings object is required']
    };
  }

  // Validate paperType
  if (settings.paperType !== undefined) {
    if (!AVAILABLE_OPTIONS.paperTypes.includes(settings.paperType)) {
      errors.push(`Invalid paper type: ${settings.paperType}. Must be one of: ${AVAILABLE_OPTIONS.paperTypes.join(', ')}`);
    }
  }

  // Validate printQuality
  if (settings.printQuality !== undefined) {
    const quality = parseInt(settings.printQuality, 10);
    if (!AVAILABLE_OPTIONS.printQualities.includes(quality)) {
      errors.push(`Invalid print quality: ${settings.printQuality}. Must be one of: ${AVAILABLE_OPTIONS.printQualities.join(', ')}`);
    }
  }

  // Validate colorMode
  if (settings.colorMode !== undefined) {
    if (!AVAILABLE_OPTIONS.colorModes.includes(settings.colorMode)) {
      errors.push(`Invalid color mode: ${settings.colorMode}. Must be one of: ${AVAILABLE_OPTIONS.colorModes.join(', ')}`);
    }
  }

  // Validate paperSize
  if (settings.paperSize !== undefined) {
    if (!AVAILABLE_OPTIONS.paperSizes.includes(settings.paperSize)) {
      errors.push(`Invalid paper size: ${settings.paperSize}. Must be one of: ${AVAILABLE_OPTIONS.paperSizes.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Apply defaults to settings
 * Fills in missing settings with defaults
 * @param {Object} settings - Partial settings object
 * @returns {Object} Complete settings with defaults applied
 */
function applyDefaults(settings) {
  return {
    paperType: settings.paperType || DEFAULT_SETTINGS.paperType,
    printQuality: settings.printQuality !== undefined ? parseInt(settings.printQuality, 10) : DEFAULT_SETTINGS.printQuality,
    colorMode: settings.colorMode || DEFAULT_SETTINGS.colorMode,
    paperSize: settings.paperSize || DEFAULT_SETTINGS.paperSize
  };
}

/**
 * Normalize settings (ensure correct types)
 * @param {Object} settings - Settings to normalize
 * @returns {Object} Normalized settings
 */
function normalizeSettings(settings) {
  return {
    paperType: String(settings.paperType || DEFAULT_SETTINGS.paperType),
    printQuality: parseInt(settings.printQuality || DEFAULT_SETTINGS.printQuality, 10),
    colorMode: String(settings.colorMode || DEFAULT_SETTINGS.colorMode),
    paperSize: String(settings.paperSize || DEFAULT_SETTINGS.paperSize)
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  AVAILABLE_OPTIONS,
  getDefaults,
  getAvailableOptions,
  validateSettings,
  applyDefaults,
  normalizeSettings
};
