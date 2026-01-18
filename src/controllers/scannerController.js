const scannerIntegration = require('../utils/scannerIntegration');
const ScanJob = require('../models/scanJob');
const path = require('path');
const fs = require('fs');

/**
 * Display scanner page
 */
async function getScannerPage(req, res) {
  try {
    // Get list of scanned documents from DB
    const scannedDocs = await ScanJob.getUserScanJobs(req.session.userId);
    const enrichedDocs = await ScanJob.enrichScanJobs(scannedDocs);

    res.render('scanner', {
      username: req.session.username,
      scannedDocuments: enrichedDocs,
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
      const scannedDocs = await ScanJob.getUserScanJobs(req.session.userId);
      const enrichedDocs = await ScanJob.enrichScanJobs(scannedDocs);
      return res.render('scanner', {
        username: req.session.username,
        scannedDocuments: enrichedDocs,
        error: 'Invalid format. Please select PDF or PNG',
        success: null
      });
    }

    console.log(`[SCANNER] Scanning document with format: ${format}`);

    // Scan document
    const scanResult = await scannerIntegration.scanDocument(format);

    if (!scanResult.success) {
      const scannedDocs = await ScanJob.getUserScanJobs(req.session.userId);
      const enrichedDocs = await ScanJob.enrichScanJobs(scannedDocs);
      return res.render('scanner', {
        username: req.session.username,
        scannedDocuments: enrichedDocs,
        error: scanResult.message,
        success: null
      });
    }

    // Save to DB
    await ScanJob.createScanJob(req.session.userId, scanResult.fileName, scanResult.filePath);

    // Get updated list of scanned documents
    const scannedDocs = await ScanJob.getUserScanJobs(req.session.userId);
    const enrichedDocs = await ScanJob.enrichScanJobs(scannedDocs);

    res.render('scanner', {
      username: req.session.username,
      scannedDocuments: enrichedDocs,
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
    // For now, simpler to just rely on fileName matching a record for this user, 
    // but strict DB lookup is better.
    // However, existing integration relies on filenames. 
    // Let's rely on physical file presence verified by DB record for ownership.

    // Check ownership via DB
    const jobs = await ScanJob.getUserScanJobs(req.session.userId);
    const job = jobs.find(j => j.fileName === fileName);

    if (!job) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }

    const filePath = job.filePath; // assuming absolute or relative correct path

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File missing from disk' });
    }

    res.download(filePath, fileName, (err) => {
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

    // Find job by filename and user
    const jobs = await ScanJob.getUserScanJobs(req.session.userId);
    const job = jobs.find(j => j.fileName === fileName);

    if (!job) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await ScanJob.deleteScanJob(job.id, req.session.userId, false);

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
