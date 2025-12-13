const db = require('./database');
const printerIntegration = require('../utils/printerIntegration');
const path = require('path');

/**
 * PrintJob Model
 * Manages print job creation, submission, and tracking
 */

/**
 * Create a new print job
 * @param {Object} jobData - Job data
 * @param {number} jobData.userId - User ID
 * @param {string} jobData.documentName - Document name
 * @param {string} jobData.documentPath - Path to document file
 * @param {string} jobData.paperType - Paper type (Plain Paper, Glossy)
 * @param {number} jobData.printQuality - Print quality (600, 1200 DPI)
 * @param {string} jobData.colorMode - Color mode (Color, Grayscale)
 * @param {string} jobData.paperSize - Paper size (A4, Letter, Legal)
 * @returns {Promise<{id: number, jobId: number}>}
 */
async function createPrintJob(jobData) {
  const {
    userId,
    documentName,
    documentPath,
    paperType = 'Plain Paper',
    printQuality = 600,
    colorMode = 'Grayscale',
    paperSize = 'A4'
  } = jobData;

  // Validate required fields
  if (!userId || !documentName || !documentPath) {
    throw new Error('Missing required job data: userId, documentName, documentPath');
  }

  // Insert job into database
  const result = await db.insertPrintJob({
    userId,
    documentName,
    documentPath,
    paperType,
    printQuality,
    colorMode,
    paperSize,
    status: 'pending'
  });

  return {
    id: result.lastID,
    jobId: result.lastID
  };
}

/**
 * Submit a print job to the system print queue
 * Uses CUPS (lp command) on Linux/Ubuntu systems
 * @param {number} jobId - Job ID
 * @param {string} documentPath - Path to document file
 * @param {Object} settings - Print settings
 * @param {string} settings.paperType - Paper type
 * @param {number} settings.printQuality - Print quality (DPI)
 * @param {string} settings.colorMode - Color mode
 * @param {string} settings.paperSize - Paper size
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function submitJobToQueue(jobId, documentPath, settings) {
  try {
    // Validate job exists
    const job = await db.getPrintJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Validate print settings
    const validation = printerIntegration.validatePrintSettings(settings);
    if (!validation.valid) {
      throw new Error(`Invalid print settings: ${validation.errors.join(', ')}`);
    }

    // Submit to printer using printer integration module
    const result = await printerIntegration.submitJobToPrinter(documentPath, settings);

    if (result.success) {
      // Update job status to in-progress
      await db.updatePrintJobStatus(jobId, 'in-progress');
    } else {
      // If printer is not available, keep job as pending
      console.warn(`Printer submission failed for job ${jobId}:`, result.message);
    }

    return result;
  } catch (err) {
    throw new Error(`Job submission error: ${err.message}`);
  }
}



/**
 * Get a specific print job
 * @param {number} jobId - Job ID
 * @returns {Promise<Object|null>}
 */
async function getPrintJob(jobId) {
  return db.getPrintJob(jobId);
}

/**
 * Get all print jobs for a user
 * @param {number} userId - User ID
 * @returns {Promise<Array>}
 */
async function getUserPrintJobs(userId) {
  return db.getPrintJobs(userId);
}

/**
 * Update job status
 * @param {number} jobId - Job ID
 * @param {string} status - New status (pending, in-progress, completed, failed)
 * @returns {Promise<{lastID: number, changes: number}>}
 */
async function updateJobStatus(jobId, status) {
  const validStatuses = ['pending', 'in-progress', 'completed', 'failed'];
  
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
  }

  return db.updatePrintJobStatus(jobId, status);
}

/**
 * Mark job as completed
 * @param {number} jobId - Job ID
 * @returns {Promise<{lastID: number, changes: number}>}
 */
async function completeJob(jobId) {
  return db.completePrintJob(jobId);
}

module.exports = {
  createPrintJob,
  submitJobToQueue,
  getPrintJob,
  getUserPrintJobs,
  updateJobStatus,
  completeJob
};
