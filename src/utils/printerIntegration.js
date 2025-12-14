const { execSync, exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = util.promisify(exec);

/**
 * Printer Integration Module
 * Handles communication with system printer via CUPS/lp command on Raspberry Pi/Linux
 */

// Detect platform
const isWindows = os.platform() === 'win32';
const isLinux = os.platform() === 'linux';

// Printer configuration
const PRINTER_CONFIG = {
  name: 'Ink-Tank-310-series',
  defaultTimeout: 5000,
  retryAttempts: 3,
  retryDelay: 1000
};

/**
 * Format print options from settings object to CUPS command options
 * @param {Object} settings - Print settings
 * @param {string} settings.paperType - Paper type (Plain Paper, Glossy)
 * @param {number} settings.printQuality - Print quality (600, 1200 DPI)
 * @param {string} settings.colorMode - Color mode (Color, Grayscale)
 * @param {string} settings.paperSize - Paper size (A4, Letter, Legal)
 * @returns {string} Formatted printer options string
 */
function formatPrinterOptions(settings) {
  const options = [];

  // Paper size mapping to CUPS options
  const paperSizeMap = {
    'A4': 'A4',
    'Letter': 'Letter',
    'Legal': 'Legal'
  };

  // Color mode mapping to CUPS options
  const colorModeMap = {
    'Color': '-o ColorModel=RGB',
    'Grayscale': '-o ColorModel=Gray'
  };

  // DPI mapping to CUPS options
  const dpiMap = {
    600: '-o Resolution=600x600dpi',
    1200: '-o Resolution=1200x1200dpi'
  };

  // Paper type mapping to CUPS options
  const paperTypeMap = {
    'Plain Paper': '-o MediaType=Plain',
    'Glossy': '-o MediaType=Glossy'
  };

  console.log(`[PRINTER] formatPrinterOptions input:`, settings);
  console.log(`[PRINTER] printQuality type: ${typeof settings.printQuality}, value: ${settings.printQuality}`);

  // Add paper size
  if (settings.paperSize && paperSizeMap[settings.paperSize]) {
    options.push(`-o media=${paperSizeMap[settings.paperSize]}`);
  }

  // Add color mode
  if (settings.colorMode && colorModeMap[settings.colorMode]) {
    console.log(`[PRINTER] Adding color mode: ${settings.colorMode} -> ${colorModeMap[settings.colorMode]}`);
    options.push(colorModeMap[settings.colorMode]);
  } else {
    console.log(`[PRINTER] Color mode not found: ${settings.colorMode}`);
  }

  // Add DPI
  if (settings.printQuality && dpiMap[settings.printQuality]) {
    console.log(`[PRINTER] Adding DPI: ${settings.printQuality} -> ${dpiMap[settings.printQuality]}`);
    options.push(dpiMap[settings.printQuality]);
  } else {
    console.log(`[PRINTER] DPI not found: ${settings.printQuality}`);
  }

  // Add paper type
  if (settings.paperType && paperTypeMap[settings.paperType]) {
    options.push(paperTypeMap[settings.paperType]);
  }

  const result = options.join(' ');
  console.log(`[PRINTER] Formatted options: ${result}`);
  return result;
}

/**
 * Check if printer is available and ready
 * @returns {Promise<{available: boolean, status: string, message: string}>}
 */
async function getPrinterStatus() {
  try {
    // Try to get printer status using lpstat command
    const { stdout } = await execAsync(`lpstat -p -d`, { timeout: PRINTER_CONFIG.defaultTimeout });

    // Check if our printer is in the output
    if (stdout.includes(PRINTER_CONFIG.name)) {
      // Check if printer is idle or busy
      if (stdout.includes('idle')) {
        return {
          available: true,
          status: 'idle',
          message: `Printer ${PRINTER_CONFIG.name} is ready`
        };
      } else if (stdout.includes('processing')) {
        return {
          available: true,
          status: 'processing',
          message: `Printer ${PRINTER_CONFIG.name} is currently processing a job`
        };
      } else {
        return {
          available: true,
          status: 'unknown',
          message: `Printer ${PRINTER_CONFIG.name} status is unknown`
        };
      }
    } else {
      return {
        available: false,
        status: 'not_found',
        message: `Printer ${PRINTER_CONFIG.name} not found`
      };
    }
  } catch (err) {
    // If lpstat fails, try a simpler check
    try {
      await execAsync(`lpstat -p`, { timeout: PRINTER_CONFIG.defaultTimeout });
      return {
        available: false,
        status: 'not_configured',
        message: 'CUPS is running but printer is not configured'
      };
    } catch (innerErr) {
      return {
        available: false,
        status: 'cups_unavailable',
        message: 'CUPS service is not available or not running'
      };
    }
  }
}

/**
 * Submit a print job to the system printer
 * Supports both Windows (using print command) and Linux (using lp command)
 * @param {string} documentPath - Path to document file
 * @param {Object} settings - Print settings
 * @param {string} settings.paperType - Paper type
 * @param {number} settings.printQuality - Print quality (DPI)
 * @param {string} settings.colorMode - Color mode
 * @param {string} settings.paperSize - Paper size
 * @returns {Promise<{success: boolean, jobId: string, message: string}>}
 */
async function submitJobToPrinter(documentPath, settings) {
  try {
    console.log(`[PRINTER] submitJobToPrinter called with path: ${documentPath}`);
    console.log(`[PRINTER] Platform detected: ${os.platform()}`);
    
    // Validate document exists
    if (!fs.existsSync(documentPath)) {
      console.error(`[PRINTER] Document file not found: ${documentPath}`);
      throw new Error(`Document file not found: ${documentPath}`);
    }

    console.log(`[PRINTER] Document file exists`);

    // Validate settings
    if (!settings || typeof settings !== 'object') {
      console.error(`[PRINTER] Invalid print settings`);
      throw new Error('Invalid print settings');
    }

    console.log(`[PRINTER] Settings validated`);

    // Use platform-specific submission
    if (isWindows) {
      console.log(`[PRINTER] Using Windows submission`);
      return await submitJobToPrinterWindows(documentPath, settings);
    } else if (isLinux) {
      console.log(`[PRINTER] Using Linux submission`);
      return await submitJobToPrinterLinux(documentPath, settings);
    } else {
      console.error(`[PRINTER] Unsupported platform: ${os.platform()}`);
      throw new Error(`Unsupported platform: ${os.platform()}`);
    }
  } catch (err) {
    console.error(`[PRINTER] Error in submitJobToPrinter: ${err.message}`);
    return {
      success: false,
      jobId: null,
      message: `Failed to submit job to printer: ${err.message}`
    };
  }
}

/**
 * Submit job to printer on Windows using print command
 * @private
 */
async function submitJobToPrinterWindows(documentPath, settings) {
  try {
    // Windows print command: print /D:printerName filename
    // Note: Windows print command has limited options compared to CUPS
    const command = `print /D:"${PRINTER_CONFIG.name}" "${documentPath}"`;

    try {
      // Execute print command
      const { stdout, stderr } = await execAsync(command, { timeout: PRINTER_CONFIG.defaultTimeout });

      // Generate a job ID based on timestamp
      const jobId = Math.floor(Date.now() / 1000).toString();

      return {
        success: true,
        jobId,
        message: `Job submitted successfully to printer. Job ID: ${jobId}`
      };
    } catch (execError) {
      // Handle specific error cases
      if (execError.message.includes('not found') || execError.message.includes('not recognized')) {
        throw new Error('Printer not found or print command not available');
      } else if (execError.message.includes('Access denied')) {
        throw new Error('Permission denied. User may not have access to printer');
      } else if (execError.message.includes('timeout')) {
        throw new Error('Printer communication timeout');
      } else {
        throw new Error(`Printer submission failed: ${execError.message}`);
      }
    }
  } catch (err) {
    throw err;
  }
}

/**
 * Submit job to printer on Linux using lp command
 * @private
 */
async function submitJobToPrinterLinux(documentPath, settings) {
  try {
    console.log(`[PRINTER] Attempting to submit job: ${documentPath}`);
    
    // Format printer options for CUPS
    const printerOptions = formatPrinterOptions(settings);
    console.log(`[PRINTER] Formatted options: ${printerOptions}`);

    // Build lp command
    const command = `lp -d ${PRINTER_CONFIG.name} ${printerOptions} "${documentPath}"`;
    console.log(`[PRINTER] Executing command: ${command}`);

    try {
      // Execute lp command
      const { stdout, stderr } = await execAsync(command, { timeout: PRINTER_CONFIG.defaultTimeout });

      console.log(`[PRINTER] Command stdout: ${stdout}`);
      if (stderr) {
        console.log(`[PRINTER] Command stderr: ${stderr}`);
      }

      // Parse job ID from output (typically "request id is Ink-Tank-310-series-123 (1 file(s))")
      const jobIdMatch = stdout.match(/request id is [\w\-]+-(\d+)/);
      const jobId = jobIdMatch ? jobIdMatch[1] : 'unknown';

      console.log(`[PRINTER] Job submitted successfully with ID: ${jobId}`);

      return {
        success: true,
        jobId,
        message: `Job submitted successfully to printer. Job ID: ${jobId}`
      };
    } catch (execError) {
      console.error(`[PRINTER] Command execution error: ${execError.message}`);
      
      // Handle specific error cases
      if (execError.message.includes('No such file or directory')) {
        throw new Error('Printer not found or CUPS not installed');
      } else if (execError.message.includes('Permission denied')) {
        throw new Error('Permission denied. User may not have access to printer');
      } else if (execError.message.includes('timeout')) {
        throw new Error('Printer communication timeout');
      } else {
        throw new Error(`Printer submission failed: ${execError.message}`);
      }
    }
  } catch (err) {
    console.error(`[PRINTER] Error in submitJobToPrinterLinux: ${err.message}`);
    throw err;
  }
}

/**
 * Get print queue status
 * @returns {Promise<{jobs: Array, message: string}>}
 */
async function getPrintQueueStatus() {
  try {
    const { stdout } = await execAsync(`lpq -P ${PRINTER_CONFIG.name}`, { timeout: PRINTER_CONFIG.defaultTimeout });

    // Parse queue output
    const lines = stdout.split('\n').filter(line => line.trim());
    const jobs = [];

    // Skip header line and parse job entries
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length >= 3) {
        jobs.push({
          rank: parts[0],
          owner: parts[1],
          jobId: parts[2],
          files: parts.slice(3).join(' ')
        });
      }
    }

    return {
      jobs,
      message: `Print queue has ${jobs.length} job(s)`
    };
  } catch (err) {
    return {
      jobs: [],
      message: `Failed to retrieve print queue: ${err.message}`
    };
  }
}

/**
 * Cancel a print job
 * @param {string} jobId - Job ID to cancel
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function cancelPrintJob(jobId) {
  try {
    if (!jobId) {
      throw new Error('Job ID is required');
    }

    const command = `cancel ${PRINTER_CONFIG.name}-${jobId}`;
    await execAsync(command, { timeout: PRINTER_CONFIG.defaultTimeout });

    return {
      success: true,
      message: `Job ${jobId} cancelled successfully`
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to cancel job: ${err.message}`
    };
  }
}

/**
 * Validate print settings
 * @param {Object} settings - Settings to validate
 * @returns {{valid: boolean, errors: Array<string>}}
 */
function validatePrintSettings(settings) {
  const errors = [];

  if (!settings || typeof settings !== 'object') {
    return {
      valid: false,
      errors: ['Settings must be an object']
    };
  }

  // Validate paper type
  const validPaperTypes = ['Plain Paper', 'Glossy'];
  if (settings.paperType && !validPaperTypes.includes(settings.paperType)) {
    errors.push(`Invalid paper type: ${settings.paperType}`);
  }

  // Validate print quality
  const validQualities = [600, 1200];
  if (settings.printQuality && !validQualities.includes(parseInt(settings.printQuality, 10))) {
    errors.push(`Invalid print quality: ${settings.printQuality}`);
  }

  // Validate color mode
  const validColorModes = ['Color', 'Grayscale'];
  if (settings.colorMode && !validColorModes.includes(settings.colorMode)) {
    errors.push(`Invalid color mode: ${settings.colorMode}`);
  }

  // Validate paper size
  const validPaperSizes = ['A4', 'Letter', 'Legal'];
  if (settings.paperSize && !validPaperSizes.includes(settings.paperSize)) {
    errors.push(`Invalid paper size: ${settings.paperSize}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get printer capabilities
 * @returns {Promise<{capabilities: Object, message: string}>}
 */
async function getPrinterCapabilities() {
  try {
    const { stdout } = await execAsync(`lpoptions -p ${PRINTER_CONFIG.name} -l`, { timeout: PRINTER_CONFIG.defaultTimeout });

    return {
      capabilities: {
        paperTypes: ['Plain Paper', 'Glossy'],
        printQualities: [600, 1200],
        colorModes: ['Color', 'Grayscale'],
        paperSizes: ['A4', 'Letter', 'Legal']
      },
      message: 'Printer capabilities retrieved successfully'
    };
  } catch (err) {
    return {
      capabilities: {
        paperTypes: ['Plain Paper', 'Glossy'],
        printQualities: [600, 1200],
        colorModes: ['Color', 'Grayscale'],
        paperSizes: ['A4', 'Letter', 'Legal']
      },
      message: 'Using default capabilities'
    };
  }
}

module.exports = {
  formatPrinterOptions,
  getPrinterStatus,
  submitJobToPrinter,
  getPrintQueueStatus,
  cancelPrintJob,
  validatePrintSettings,
  getPrinterCapabilities,
  PRINTER_CONFIG
};
