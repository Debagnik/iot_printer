const fs = require('fs');
const path = require('path');
const db = require('../models/database');

/**
 * Cleanup Service
 * Handles automatic cleanup of old files and database records
 */

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const SCANNED_DOCS_DIR = path.join(__dirname, '../../scanned_documents');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Clean up old uploaded documents (older than 1 day)
 * @returns {Promise<{deleted: number, message: string}>}
 */
async function cleanupUploadedDocuments() {
  try {
    console.log('[CLEANUP] Starting cleanup of uploaded documents');
    
    if (!fs.existsSync(UPLOADS_DIR)) {
      console.log('[CLEANUP] Uploads directory does not exist');
      return { deleted: 0, message: 'Uploads directory does not exist' };
    }

    const files = fs.readdirSync(UPLOADS_DIR);
    const now = Date.now();
    let deletedCount = 0;

    files.forEach(file => {
      const filePath = path.join(UPLOADS_DIR, file);
      
      try {
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > ONE_DAY_MS) {
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`[CLEANUP] Deleted old uploaded file: ${file}`);
        }
      } catch (err) {
        console.error(`[CLEANUP] Error processing file ${file}:`, err.message);
      }
    });

    console.log(`[CLEANUP] Cleanup of uploaded documents completed. Deleted: ${deletedCount}`);
    return {
      deleted: deletedCount,
      message: `Cleaned up ${deletedCount} old uploaded document(s)`
    };
  } catch (err) {
    console.error('[CLEANUP] Error cleaning up uploaded documents:', err.message);
    return {
      deleted: 0,
      message: `Failed to cleanup uploaded documents: ${err.message}`
    };
  }
}

/**
 * Clean up old scanned documents (older than 1 day)
 * @returns {Promise<{deleted: number, message: string}>}
 */
async function cleanupScannedDocuments() {
  try {
    console.log('[CLEANUP] Starting cleanup of scanned documents');
    
    if (!fs.existsSync(SCANNED_DOCS_DIR)) {
      console.log('[CLEANUP] Scanned documents directory does not exist');
      return { deleted: 0, message: 'Scanned documents directory does not exist' };
    }

    const files = fs.readdirSync(SCANNED_DOCS_DIR);
    const now = Date.now();
    let deletedCount = 0;

    files.forEach(file => {
      const filePath = path.join(SCANNED_DOCS_DIR, file);
      
      try {
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > ONE_DAY_MS) {
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`[CLEANUP] Deleted old scanned document: ${file}`);
        }
      } catch (err) {
        console.error(`[CLEANUP] Error processing file ${file}:`, err.message);
      }
    });

    console.log(`[CLEANUP] Cleanup of scanned documents completed. Deleted: ${deletedCount}`);
    return {
      deleted: deletedCount,
      message: `Cleaned up ${deletedCount} old scanned document(s)`
    };
  } catch (err) {
    console.error('[CLEANUP] Error cleaning up scanned documents:', err.message);
    return {
      deleted: 0,
      message: `Failed to cleanup scanned documents: ${err.message}`
    };
  }
}

/**
 * Clean up old print jobs from database (older than 1 day)
 * @returns {Promise<{deleted: number, message: string}>}
 */
async function cleanupOldPrintJobs() {
  try {
    console.log('[CLEANUP] Starting cleanup of old print jobs from database');
    
    const oneDayAgo = new Date(Date.now() - ONE_DAY_MS).toISOString();
    
    // Delete print jobs older than 1 day
    const result = await new Promise((resolve, reject) => {
      db.db.run(
        'DELETE FROM PrintJob WHERE submittedAt < ?',
        [oneDayAgo],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });

    console.log(`[CLEANUP] Cleanup of print jobs completed. Deleted: ${result}`);
    return {
      deleted: result,
      message: `Cleaned up ${result} old print job(s) from database`
    };
  } catch (err) {
    console.error('[CLEANUP] Error cleaning up print jobs:', err.message);
    return {
      deleted: 0,
      message: `Failed to cleanup print jobs: ${err.message}`
    };
  }
}

/**
 * Run all cleanup tasks
 * @returns {Promise<{uploadedDocs: number, scannedDocs: number, printJobs: number, message: string}>}
 */
async function runAllCleanup() {
  try {
    console.log('[CLEANUP] ========== STARTING DAILY CLEANUP ==========');
    
    const uploadResult = await cleanupUploadedDocuments();
    const scannedResult = await cleanupScannedDocuments();
    const jobsResult = await cleanupOldPrintJobs();

    const summary = {
      uploadedDocs: uploadResult.deleted,
      scannedDocs: scannedResult.deleted,
      printJobs: jobsResult.deleted,
      message: `Cleanup completed: ${uploadResult.deleted} uploaded docs, ${scannedResult.deleted} scanned docs, ${jobsResult.deleted} print jobs removed`
    };

    console.log('[CLEANUP] ========== DAILY CLEANUP COMPLETED ==========');
    console.log('[CLEANUP] Summary:', summary);

    return summary;
  } catch (err) {
    console.error('[CLEANUP] Error running cleanup:', err.message);
    return {
      uploadedDocs: 0,
      scannedDocs: 0,
      printJobs: 0,
      message: `Cleanup failed: ${err.message}`
    };
  }
}

/**
 * Schedule daily cleanup at end of day (11:59 PM)
 */
function scheduleDailyCleanup() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 0, 0);

  const timeUntilCleanup = tomorrow.getTime() - now.getTime();

  console.log(`[CLEANUP] Daily cleanup scheduled for ${tomorrow.toLocaleString()}`);
  console.log(`[CLEANUP] Time until next cleanup: ${Math.floor(timeUntilCleanup / 1000 / 60)} minutes`);

  setTimeout(() => {
    runAllCleanup();
    // Schedule again for the next day
    setInterval(runAllCleanup, 24 * 60 * 60 * 1000);
  }, timeUntilCleanup);
}

module.exports = {
  cleanupUploadedDocuments,
  cleanupScannedDocuments,
  cleanupOldPrintJobs,
  runAllCleanup,
  scheduleDailyCleanup
};
