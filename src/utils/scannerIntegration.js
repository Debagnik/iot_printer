const { execAsync } = require('util').promisify(require('child_process').exec);
const util = require('util');
const fs = require('fs');
const path = require('path');

const exec = util.promisify(require('child_process').exec);

/**
 * Scanner Integration Module
 * Handles communication with system scanner via SANE
 */

// Scanner configuration
const SCANNER_CONFIG = {
  name: 'Ink-Tank-310-series',
  defaultTimeout: 30000,
  scannedFilesDir: path.join(__dirname, '../../scanned_documents')
};

// Ensure scanned documents directory exists
if (!fs.existsSync(SCANNER_CONFIG.scannedFilesDir)) {
  fs.mkdirSync(SCANNER_CONFIG.scannedFilesDir, { recursive: true });
}

/**
 * Get available scanners
 * @returns {Promise<{scanners: Array, message: string}>}
 */
async function getAvailableScanners() {
  try {
    const { stdout } = await exec('scanimage -A', { timeout: SCANNER_CONFIG.defaultTimeout });
    
    console.log('[SCANNER] Available scanners:', stdout);
    
    return {
      scanners: stdout.split('\n').filter(line => line.includes('Device:')),
      message: 'Scanners retrieved successfully'
    };
  } catch (err) {
    console.error('[SCANNER] Error getting scanners:', err.message);
    return {
      scanners: [],
      message: `Failed to retrieve scanners: ${err.message}`
    };
  }
}

/**
 * Scan a document from the scanner
 * @param {string} format - Output format ('pdf' or 'png')
 * @returns {Promise<{success: boolean, filePath: string, fileName: string, message: string}>}
 */
async function scanDocument(format = 'pdf') {
  try {
    console.log(`[SCANNER] Starting scan with format: ${format}`);

    // Validate format
    if (!['pdf', 'png'].includes(format.toLowerCase())) {
      throw new Error('Invalid format. Must be pdf or png');
    }

    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 1E9);
    const fileName = `scanned_${timestamp}_${randomSuffix}`;
    
    // Scan to temporary PNG file first (supported by scanner)
    const tempPngPath = path.join(SCANNER_CONFIG.scannedFilesDir, `${fileName}_temp.png`);
    const finalPath = path.join(SCANNER_CONFIG.scannedFilesDir, `${fileName}.${format.toLowerCase()}`);

    console.log(`[SCANNER] Scanning to temporary file: ${tempPngPath}`);

    // Use scanimage to scan directly to PNG format
    const scanCommand = `scanimage --device-name="${SCANNER_CONFIG.name}" --format=png > "${tempPngPath}"`;
    
    try {
      await exec(scanCommand, { timeout: SCANNER_CONFIG.defaultTimeout });
      console.log('[SCANNER] Scan completed successfully');

      // Convert to desired format if needed
      if (format.toLowerCase() === 'pdf') {
        console.log('[SCANNER] Converting PNG to PDF');
        const convertCommand = `convert "${tempPngPath}" "${finalPath}"`;
        await exec(convertCommand, { timeout: SCANNER_CONFIG.defaultTimeout });
        
        // Remove temporary PNG file
        fs.unlinkSync(tempPngPath);
      } else if (format.toLowerCase() === 'png') {
        console.log('[SCANNER] Renaming PNG file');
        fs.renameSync(tempPngPath, finalPath);
      }

      console.log(`[SCANNER] Scan saved to: ${finalPath}`);

      return {
        success: true,
        filePath: finalPath,
        fileName: `${fileName}.${format.toLowerCase()}`,
        message: `Document scanned successfully and saved as ${format.toUpperCase()}`
      };
    } catch (scanError) {
      console.error('[SCANNER] Scan error:', scanError.message);
      
      // Clean up temporary file if it exists
      if (fs.existsSync(tempPngPath)) {
        try {
          fs.unlinkSync(tempPngPath);
        } catch (err) {
          console.error('[SCANNER] Error cleaning up temporary file:', err);
        }
      }

      if (scanError.message.includes('not found') || scanError.message.includes('not recognized')) {
        throw new Error('Scanner not found or SANE not installed');
      } else if (scanError.message.includes('Permission denied')) {
        throw new Error('Permission denied. User may not have access to scanner');
      } else if (scanError.message.includes('timeout')) {
        throw new Error('Scanner communication timeout');
      } else {
        throw new Error(`Scan failed: ${scanError.message}`);
      }
    }
  } catch (err) {
    console.error('[SCANNER] Error in scanDocument:', err.message);
    return {
      success: false,
      filePath: null,
      fileName: null,
      message: `Failed to scan document: ${err.message}`
    };
  }
}

/**
 * Get list of scanned documents for a user
 * @param {number} userId - User ID
 * @returns {Promise<Array>}
 */
async function getScannedDocuments(userId) {
  try {
    const files = fs.readdirSync(SCANNER_CONFIG.scannedFilesDir);
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const scannedDocs = files
      .map(file => {
        const filePath = path.join(SCANNER_CONFIG.scannedFilesDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        return {
          fileName: file,
          filePath,
          createdAt: new Date(stats.mtimeMs),
          expiresAt: new Date(stats.mtimeMs + oneDayMs),
          isExpired: age > oneDayMs,
          size: stats.size
        };
      })
      .filter(doc => !doc.isExpired)
      .sort((a, b) => b.createdAt - a.createdAt);

    return scannedDocs;
  } catch (err) {
    console.error('[SCANNER] Error getting scanned documents:', err.message);
    return [];
  }
}

/**
 * Delete expired scanned documents
 * @returns {Promise<{deleted: number, message: string}>}
 */
async function cleanupExpiredDocuments() {
  try {
    const files = fs.readdirSync(SCANNER_CONFIG.scannedFilesDir);
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    files.forEach(file => {
      const filePath = path.join(SCANNER_CONFIG.scannedFilesDir, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;

      if (age > oneDayMs) {
        try {
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`[SCANNER] Deleted expired file: ${file}`);
        } catch (err) {
          console.error(`[SCANNER] Error deleting file ${file}:`, err.message);
        }
      }
    });

    return {
      deleted: deletedCount,
      message: `Cleaned up ${deletedCount} expired document(s)`
    };
  } catch (err) {
    console.error('[SCANNER] Error cleaning up expired documents:', err.message);
    return {
      deleted: 0,
      message: `Failed to cleanup: ${err.message}`
    };
  }
}

/**
 * Download a scanned document
 * @param {string} fileName - File name to download
 * @returns {Promise<{success: boolean, filePath: string, message: string}>}
 */
async function getScannedDocument(fileName) {
  try {
    // Validate file name to prevent directory traversal
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      throw new Error('Invalid file name');
    }

    const filePath = path.join(SCANNER_CONFIG.scannedFilesDir, fileName);

    // Verify file exists and is within the scanned documents directory
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    const realPath = fs.realpathSync(filePath);
    const realDir = fs.realpathSync(SCANNER_CONFIG.scannedFilesDir);

    if (!realPath.startsWith(realDir)) {
      throw new Error('Invalid file path');
    }

    // Check if file is expired
    const stats = fs.statSync(filePath);
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const age = now - stats.mtimeMs;

    if (age > oneDayMs) {
      // Delete expired file
      fs.unlinkSync(filePath);
      throw new Error('File has expired and been deleted');
    }

    return {
      success: true,
      filePath,
      message: 'File ready for download'
    };
  } catch (err) {
    console.error('[SCANNER] Error getting scanned document:', err.message);
    return {
      success: false,
      filePath: null,
      message: `Failed to get document: ${err.message}`
    };
  }
}

module.exports = {
  getAvailableScanners,
  scanDocument,
  getScannedDocuments,
  cleanupExpiredDocuments,
  getScannedDocument,
  SCANNER_CONFIG
};
