/**
 * Print Settings Model
 * Manages print configuration options and defaults
 */

// Print quality enum with DPI mapping
const PRINT_QUALITY = {
  NORMAL: 'Normal',
  BEST: 'Best',
  PHOTO: 'Photo'
};

// DPI mapping for each quality level
const QUALITY_DPI_MAP = {
  [PRINT_QUALITY.NORMAL]: 600,
  [PRINT_QUALITY.BEST]: 1200,
  [PRINT_QUALITY.PHOTO]: 1200
};

// Default print settings
const DEFAULT_SETTINGS = {
  paperType: 'Plain Paper',
  printQuality: PRINT_QUALITY.NORMAL,
  colorMode: 'Grayscale',
  paperSize: 'A4',
  doubleSided: false,
  numCopies: 1
};

// Available options for each setting
const AVAILABLE_OPTIONS = {
  paperTypes: ['Plain Paper', 'Glossy'],
  printQualities: [PRINT_QUALITY.NORMAL, PRINT_QUALITY.BEST, PRINT_QUALITY.PHOTO],
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
    if (!AVAILABLE_OPTIONS.printQualities.includes(settings.printQuality)) {
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

  // Validate numCopies
  if (settings.numCopies !== undefined) {
    const copies = parseInt(settings.numCopies, 10);
    if (isNaN(copies) || copies < 1 || copies > 99) {
      errors.push(`Invalid number of copies: ${settings.numCopies}. Must be between 1 and 99`);
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
    printQuality: settings.printQuality || DEFAULT_SETTINGS.printQuality,
    colorMode: settings.colorMode || DEFAULT_SETTINGS.colorMode,
    paperSize: settings.paperSize || DEFAULT_SETTINGS.paperSize,
    doubleSided: settings.doubleSided !== undefined ? settings.doubleSided : DEFAULT_SETTINGS.doubleSided,
    numCopies: settings.numCopies || DEFAULT_SETTINGS.numCopies
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
    printQuality: String(settings.printQuality || DEFAULT_SETTINGS.printQuality),
    colorMode: String(settings.colorMode || DEFAULT_SETTINGS.colorMode),
    paperSize: String(settings.paperSize || DEFAULT_SETTINGS.paperSize),
    doubleSided: settings.doubleSided === 'on' || settings.doubleSided === true || settings.doubleSided === 'true',
    numCopies: parseInt(settings.numCopies, 10) || DEFAULT_SETTINGS.numCopies
  };
}

module.exports = {
  PRINT_QUALITY,
  QUALITY_DPI_MAP,
  DEFAULT_SETTINGS,
  AVAILABLE_OPTIONS,
  getDefaults,
  getAvailableOptions,
  validateSettings,
  applyDefaults,
  normalizeSettings
};
