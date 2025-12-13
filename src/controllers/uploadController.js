const path = require('path');
const fs = require('fs').promises;
const fileValidator = require('../utils/fileValidator');

/**
 * Display upload page
 */
async function getUpload(req, res) {
  try {
    const supportedFormats = fileValidator.getSupportedExtensions().join(', ');
    const maxSizeMB = fileValidator.getFileSizeLimitMB();
    
    res.render('upload', {
      username: req.session.username,
      supportedFormats,
      maxSizeMB,
      error: null,
      success: null
    });
  } catch (err) {
    console.error('Upload page error:', err);
    res.status(500).render('error', { error: 'Failed to load upload page' });
  }
}

/**
 * Handle file upload
 */
async function postUpload(req, res) {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.render('upload', {
        username: req.session.username,
        supportedFormats: fileValidator.getSupportedExtensions().join(', '),
        maxSizeMB: fileValidator.getFileSizeLimitMB(),
        error: 'No file selected',
        success: null
      });
    }

    const { filename, mimetype, size, path: filePath } = req.file;

    // Validate file format
    if (!fileValidator.validateFileFormat(filename, mimetype)) {
      // Delete the uploaded file
      await fs.unlink(filePath);
      
      const supportedFormats = fileValidator.getSupportedExtensions().join(', ');
      return res.render('upload', {
        username: req.session.username,
        supportedFormats,
        maxSizeMB: fileValidator.getFileSizeLimitMB(),
        error: `Unsupported file format. Supported formats: ${supportedFormats}`,
        success: null
      });
    }

    // Validate file size
    if (!fileValidator.validateFileSize(size)) {
      // Delete the uploaded file
      await fs.unlink(filePath);
      
      const maxSizeMB = fileValidator.getFileSizeLimitMB();
      return res.render('upload', {
        username: req.session.username,
        supportedFormats: fileValidator.getSupportedExtensions().join(', '),
        maxSizeMB,
        error: `File size exceeds maximum limit of ${maxSizeMB}MB`,
        success: null
      });
    }

    // Store file information in session for next step (print configuration)
    req.session.uploadedFile = {
      filename,
      originalName: req.file.originalname,
      mimetype,
      size,
      path: filePath,
      uploadedAt: new Date().toISOString()
    };

    res.render('upload', {
      username: req.session.username,
      supportedFormats: fileValidator.getSupportedExtensions().join(', '),
      maxSizeMB: fileValidator.getFileSizeLimitMB(),
      error: null,
      success: `File "${req.file.originalname}" uploaded successfully. Proceed to configure print settings.`,
      uploadedFile: req.session.uploadedFile
    });
  } catch (err) {
    console.error('Upload error:', err);
    
    // Clean up uploaded file if it exists
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkErr) {
        console.error('Failed to delete uploaded file:', unlinkErr);
      }
    }

    res.status(500).render('error', { error: 'An error occurred during file upload' });
  }
}

module.exports = {
  getUpload,
  postUpload
};
