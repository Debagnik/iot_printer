const scannerIntegration = require('../utils/scannerIntegration');
const fs = require('fs');
const path = require('path');

/**
 * Display scanner page
 */
async function getScannerPage(req, res) {
  try {
    // Get list of scanned documents
    const scannedDocs = await scannerIntegration.getScannedDocuments(req.session.userId);

    res.render('scanner', {
      username: req.session.username,
      scannedDocuments: scannedDocs,
      error: null,
      success: null
    });
  } catch (err) {
    console.error('Scanner page error:', err);
    res.status(500).render('error', { error: 'Failed to load scanner page' });
  }
}

/**
 * Handle document scan request
 */
async function postScanDocument(req, res) {
  try {
    const { format } = req.body;

    // Validate format
    if (!format || !['pdf', 'png'].includes(format.toLowerCase())) {
      return res.render('scanner', {
        username: req.session.username,
        scannedDocuments: await scannerIntegration.getScannedDocuments(req.session.userId),
        error: 'Invalid format. Please select PDF or PNG',
        success: null
      });
    }

    console.log(`[SCANNER] Scanning document with format: ${format}`);

    // Scan document
    const scanResult = await scannerIntegration.scanDocument(format);

    if (!scanResult.success) {
      return res.render('scanner', {
        username: req.session.username,
        scannedDocuments: await scannerIntegration.getScannedDocuments(req.session.userId),
        error: scanResult.message,
        success: null
      });
    }

    // Get updated list of scanned documents
    const scannedDocs = await scannerIntegration.getScannedDocuments(req.session.userId);

    res.render('scanner', {
      username: req.session.username,
      scannedDocuments: scannedDocs,
      error: null,
      success: `Document scanned successfully! Saved as ${format.toUpperCase()}`
    });
  } catch (err) {
    console.error('Scan document error:', err);
    res.status(500).render('error', { error: `Scan failed: ${err.message}` });
  }
}

/**
 * Download scanned document
 */
async function downloadScannedDocument(req, res) {
  try {
    const { fileName } = req.params;

    if (!fileName) {
      return res.status(400).json({ error: 'File name required' });
    }

    // Get document
    const docResult = await scannerIntegration.getScannedDocument(fileName);

    if (!docResult.success) {
      return res.status(404).json({ error: docResult.message });
    }

    // Send file
    res.download(docResult.filePath, fileName, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
    });
  } catch (err) {
    console.error('Download scanned document error:', err);
    res.status(500).json({ error: 'Failed to download document' });
  }
}

/**
 * Delete scanned document
 */
async function deleteScannedDocument(req, res) {
  try {
    const { fileName } = req.params;

    if (!fileName) {
      return res.status(400).json({ error: 'File name required' });
    }

    // Validate file name
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return res.status(400).json({ error: 'Invalid file name' });
    }

    const filePath = path.join(scannerIntegration.SCANNER_CONFIG.scannedFilesDir, fileName);

    // Verify file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete file
    fs.unlinkSync(filePath);

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (err) {
    console.error('Delete scanned document error:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
}

module.exports = {
  getScannerPage,
  postScanDocument,
  downloadScannedDocument,
  deleteScannedDocument
};
