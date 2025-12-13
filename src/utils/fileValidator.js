/**
 * File validation utilities for upload handling
 */

// Supported file formats
const SUPPORTED_FORMATS = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/bmp': ['.bmp'],
  'image/tiff': ['.tiff', '.tif']
};

// Flatten supported extensions
const SUPPORTED_EXTENSIONS = Object.values(SUPPORTED_FORMATS).flat();

// Default file size limit: 50MB
const DEFAULT_FILE_SIZE_LIMIT = 50 * 1024 * 1024;

/**
 * Get all supported MIME types
 * @returns {Array<string>}
 */
function getSupportedMimeTypes() {
  return Object.keys(SUPPORTED_FORMATS);
}

/**
 * Get all supported file extensions
 * @returns {Array<string>}
 */
function getSupportedExtensions() {
  return SUPPORTED_EXTENSIONS;
}

/**
 * Validate file format by MIME type and extension
 * @param {string} filename - Original filename
 * @param {string} mimetype - MIME type from multer
 * @returns {boolean} - True if file format is supported
 */
function validateFileFormat(filename, mimetype) {
  // Check if MIME type is supported
  if (!getSupportedMimeTypes().includes(mimetype)) {
    return false;
  }

  // Get file extension
  const ext = getFileExtension(filename);
  
  // Check if extension matches MIME type
  const allowedExtensions = SUPPORTED_FORMATS[mimetype] || [];
  return allowedExtensions.includes(ext.toLowerCase());
}

/**
 * Validate file size
 * @param {number} fileSize - File size in bytes
 * @param {number} maxSize - Maximum allowed size in bytes (optional, defaults to DEFAULT_FILE_SIZE_LIMIT)
 * @returns {boolean} - True if file size is within limits
 */
function validateFileSize(fileSize, maxSize = DEFAULT_FILE_SIZE_LIMIT) {
  return fileSize > 0 && fileSize <= maxSize;
}

/**
 * Get file extension from filename
 * @param {string} filename - Filename
 * @returns {string} - File extension including dot (e.g., '.pdf')
 */
function getFileExtension(filename) {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) {
    return '';
  }
  return filename.substring(lastDot);
}

/**
 * Get file size limit in MB
 * @param {number} maxSize - Maximum size in bytes (optional)
 * @returns {number} - Size in MB
 */
function getFileSizeLimitMB(maxSize = DEFAULT_FILE_SIZE_LIMIT) {
  return Math.round(maxSize / (1024 * 1024));
}

module.exports = {
  SUPPORTED_FORMATS,
  SUPPORTED_EXTENSIONS,
  DEFAULT_FILE_SIZE_LIMIT,
  getSupportedMimeTypes,
  getSupportedExtensions,
  validateFileFormat,
  validateFileSize,
  getFileExtension,
  getFileSizeLimitMB
};
