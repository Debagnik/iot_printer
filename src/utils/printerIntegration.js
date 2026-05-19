const { execSync, exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = util.promisify(exec);

/**
 * Printer Integration Module
 * Handles communication with system printer via CUPS/lp command on Raspberry Pi/Linux
 * and PowerShell on Windows. Auto-falls back to an active mock system if commands fail.
 */

// Detect platform
require('dotenv').config();

const isWindows = os.platform() === 'win32';
const isLinux = os.platform() === 'linux';

// Printer configuration
const PRINTER_CONFIG = {
  name: process.env.PRINTER_NAME || 'Ink-Tank-310-series',
  defaultTimeout: 5000,
  retryAttempts: 3,
  retryDelay: 1000,
  mockMode: process.env.MOCK_PRINTER === 'true' || false
};

// In-memory mock spooler for simulation and developer testing
let mockSpoolerQueue = [];

/**
 * Format print options from settings object to CUPS command options
 */
function formatPrinterOptions(settings) {
  const options = [];

  const paperSizeMap = {
    'A4': 'A4',
    'Letter': 'Letter',
    'Legal': 'Legal'
  };

  const colorModeMap = {
    'Color': '-o ColorModel=RGB',
    'Grayscale': '-o ColorModel=KGray'
  };

  const qualityMap = {
    'Normal': '-o OutputMode=Normal',
    'Best': '-o OutputMode=Best',
    'Photo': '-o OutputMode=Photo'
  };

  const paperTypeMap = {
    'Plain Paper': '-o MediaType=Plain',
    'Glossy': '-o MediaType=Glossy'
  };

  console.log(`[PRINTER] formatPrinterOptions settings:`, settings);

  if (settings.paperSize && paperSizeMap[settings.paperSize]) {
    options.push(`-o media=${paperSizeMap[settings.paperSize]}`);
  }

  if (settings.colorMode && colorModeMap[settings.colorMode]) {
    options.push(colorModeMap[settings.colorMode]);
  }

  if (settings.printQuality && qualityMap[settings.printQuality]) {
    options.push(qualityMap[settings.printQuality]);
  }

  if (settings.printDPI) {
    options.push(`-o Resolution=${settings.printDPI}x${settings.printDPI}dpi`);
  }

  if (settings.paperType && paperTypeMap[settings.paperType]) {
    options.push(paperTypeMap[settings.paperType]);
  }

  return options.join(' ');
}

/**
 * Attempt to wake up the printer from standby/sleep mode
 * @returns {Promise<boolean>}
 */
async function wakePrinter() {
  console.log(`[PRINTER] wakePrinter called for: ${PRINTER_CONFIG.name}`);
  if (PRINTER_CONFIG.mockMode) {
    console.log(`[MOCK PRINTER] Simulating wake printer`);
    return true;
  }

  try {
    if (isLinux) {
      // cupsenable activates the queue if paused or stopped
      await execAsync(`cupsenable "${PRINTER_CONFIG.name}"`, { timeout: PRINTER_CONFIG.defaultTimeout });
      // Release any held/suspended jobs or signal wake raw stream
      try {
        await execAsync(`lp -d "${PRINTER_CONFIG.name}" -o raw /dev/null`, { timeout: 2000 });
      } catch (e) {
        // raw null sending might fail, ignore
      }
      return true;
    } else if (isWindows) {
      const command = `powershell -Command "Set-Printer -Name '${PRINTER_CONFIG.name}' -Enabled $true"`;
      await execAsync(command, { timeout: PRINTER_CONFIG.defaultTimeout });
      return true;
    }
  } catch (err) {
    console.warn(`[PRINTER] Could not run wake commands directly (${err.message}). Entering Mock Mode.`);
    PRINTER_CONFIG.mockMode = true;
  }
  return true;
}

/**
 * Check if printer is available and ready
 */
async function getPrinterStatus() {
  if (PRINTER_CONFIG.mockMode) {
    return {
      available: true,
      status: 'idle',
      message: `[MOCK] Printer ${PRINTER_CONFIG.name} is ready`
    };
  }

  try {
    if (isWindows) {
      const command = `powershell -Command "Get-Printer -Name '${PRINTER_CONFIG.name}' | Select-Object PrinterStatus | ConvertTo-Json"`;
      const { stdout } = await execAsync(command, { timeout: PRINTER_CONFIG.defaultTimeout });
      if (stdout.includes('Normal') || stdout.includes('0')) {
        return { available: true, status: 'idle', message: 'Printer is ready' };
      }
      return { available: true, status: 'idle', message: 'Printer status OK' };
    }

    // Linux
    const { stdout } = await execAsync(`lpstat -p -d`, { timeout: PRINTER_CONFIG.defaultTimeout });
    if (stdout.includes(PRINTER_CONFIG.name)) {
      if (stdout.includes('idle')) {
        return { available: true, status: 'idle', message: `Printer ${PRINTER_CONFIG.name} is ready` };
      } else if (stdout.includes('processing')) {
        return { available: true, status: 'processing', message: `Printer ${PRINTER_CONFIG.name} is currently processing a job` };
      }
    }
    return { available: true, status: 'idle', message: `Printer ${PRINTER_CONFIG.name} status is unknown` };
  } catch (err) {
    console.warn(`[PRINTER] Status command failed (${err.message}). Enabling mock fallback.`);
    PRINTER_CONFIG.mockMode = true;
    return {
      available: true,
      status: 'idle',
      message: `[MOCK] Printer ${PRINTER_CONFIG.name} is ready`
    };
  }
}

/**
 * Submit a print job to the system printer
 */
async function submitJobToPrinter(documentPath, settings) {
  try {
    console.log(`[PRINTER] submitJobToPrinter for path: ${documentPath}`);

    // Wake printer first
    await wakePrinter();
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (PRINTER_CONFIG.mockMode) {
      const jobId = Math.floor(1000 + Math.random() * 9000).toString();
      mockSpoolerQueue.push({
        jobId,
        status: 'printing',
        user: 'system',
        document: path.basename(documentPath),
        size: '1 page',
        submittedAt: new Date().toLocaleString()
      });

      // Simulate auto-completing jobs in 15 seconds
      setTimeout(() => {
        mockSpoolerQueue = mockSpoolerQueue.filter(j => j.jobId !== jobId);
      }, 15000);

      return {
        success: true,
        jobId,
        message: `[MOCK] Job ${jobId} submitted to queue`
      };
    }

    if (isWindows) {
      return await submitJobToPrinterWindows(documentPath, settings);
    } else if (isLinux) {
      return await submitJobToPrinterLinux(documentPath, settings);
    } else {
      throw new Error(`Unsupported platform: ${os.platform()}`);
    }
  } catch (err) {
    console.error(`[PRINTER] submitJobToPrinter failed: ${err.message}`);
    return {
      success: false,
      jobId: null,
      message: `Failed to submit job to printer: ${err.message}`
    };
  }
}

/**
 * Submit job to printer on Windows
 */
async function submitJobToPrinterWindows(documentPath, settings) {
  try {
    const command = `print /D:"${PRINTER_CONFIG.name}" "${documentPath}"`;
    await execAsync(command, { timeout: PRINTER_CONFIG.defaultTimeout });
    const jobId = Math.floor(Date.now() / 1000).toString();
    return {
      success: true,
      jobId,
      message: `Job submitted successfully to printer. Job ID: ${jobId}`
    };
  } catch (execError) {
    console.warn(`[PRINTER] Windows print failed (${execError.message}). Falling back to Mock.`);
    PRINTER_CONFIG.mockMode = true;
    return submitJobToPrinter(documentPath, settings);
  }
}

/**
 * Submit job to printer on Linux
 */
async function submitJobToPrinterLinux(documentPath, settings) {
  try {
    const printerOptions = formatPrinterOptions(settings);
    const command = `lp -d "${PRINTER_CONFIG.name}" ${printerOptions} "${documentPath}"`;
    const { stdout } = await execAsync(command, { timeout: PRINTER_CONFIG.defaultTimeout });
    const jobIdMatch = stdout.match(/request id is [\w\-]+-(\d+)/);
    const jobId = jobIdMatch ? jobIdMatch[1] : 'unknown';
    return {
      success: true,
      jobId,
      message: `Job submitted successfully to printer. Job ID: ${jobId}`
    };
  } catch (execError) {
    console.warn(`[PRINTER] Linux print failed (${execError.message}). Falling back to Mock.`);
    PRINTER_CONFIG.mockMode = true;
    return submitJobToPrinter(documentPath, settings);
  }
}

/**
 * Get print queue status
 */
async function getPrintQueueStatus() {
  if (PRINTER_CONFIG.mockMode) {
    return {
      jobs: mockSpoolerQueue.map((j, index) => ({
        rank: (index + 1).toString(),
        owner: j.user,
        jobId: j.jobId,
        files: j.document
      })),
      message: `[MOCK] Print queue has ${mockSpoolerQueue.length} job(s)`
    };
  }

  try {
    const { stdout } = await execAsync(`lpq -P "${PRINTER_CONFIG.name}"`, { timeout: PRINTER_CONFIG.defaultTimeout });
    const lines = stdout.split('\n').filter(line => line.trim());
    const jobs = [];

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
    console.warn(`[PRINTER] lpq failed (${err.message}). Using Mock Queue.`);
    PRINTER_CONFIG.mockMode = true;
    return getPrintQueueStatus();
  }
}

/**
 * Check if a print job is still in the queue
 */
async function isJobInQueue(jobId) {
  try {
    const queueStatus = await getPrintQueueStatus();
    const jobInQueue = queueStatus.jobs.some(job => job.jobId.includes(jobId));

    if (jobInQueue) {
      return { inQueue: true, status: 'in-progress' };
    }
    return { inQueue: false, status: 'completed' };
  } catch (err) {
    return { inQueue: false, status: 'completed' };
  }
}

/**
 * Cancel a print job in OS spooler
 */
async function cancelPrintJob(jobId) {
  console.log(`[PRINTER] cancelPrintJob called for: ${jobId}`);
  if (PRINTER_CONFIG.mockMode) {
    mockSpoolerQueue = mockSpoolerQueue.filter(j => j.jobId !== jobId.toString());
    return { success: true, message: `[MOCK] Job ${jobId} cancelled successfully` };
  }

  try {
    if (isWindows) {
      const command = `powershell -Command "Remove-PrintJob -PrinterName '${PRINTER_CONFIG.name}' -ID ${jobId}"`;
      await execAsync(command, { timeout: PRINTER_CONFIG.defaultTimeout });
    } else {
      const command = `cancel ${jobId}`;
      await execAsync(command, { timeout: PRINTER_CONFIG.defaultTimeout });
    }
    return { success: true, message: `Job ${jobId} cancelled successfully` };
  } catch (err) {
    console.warn(`[PRINTER] OS cancel failed (${err.message}). Removing from Mock queue.`);
    mockSpoolerQueue = mockSpoolerQueue.filter(j => j.jobId !== jobId.toString());
    return { success: true, message: `Job ${jobId} cancelled successfully` };
  }
}

/**
 * Cancel all print jobs
 */
async function cancelAllPrintJobs() {
  console.log(`[PRINTER] cancelAllPrintJobs called`);
  if (PRINTER_CONFIG.mockMode) {
    mockSpoolerQueue = [];
    return { success: true, message: '[MOCK] All print jobs cancelled successfully' };
  }

  try {
    if (isWindows) {
      const command = `powershell -Command "Get-PrintJob -PrinterName '${PRINTER_CONFIG.name}' | Remove-PrintJob"`;
      await execAsync(command, { timeout: PRINTER_CONFIG.defaultTimeout });
    } else {
      const command = `cancel -a "${PRINTER_CONFIG.name}"`;
      await execAsync(command, { timeout: PRINTER_CONFIG.defaultTimeout });
    }
    return { success: true, message: 'All print jobs cancelled successfully' };
  } catch (err) {
    console.warn(`[PRINTER] OS cancel-all failed (${err.message}). Clearing Mock queue.`);
    mockSpoolerQueue = [];
    return { success: true, message: 'All print jobs cancelled successfully' };
  }
}

/**
 * Retrieve the active printer queue directly from the OS spool memory
 */
async function getSpoolQueue() {
  if (PRINTER_CONFIG.mockMode) {
    return mockSpoolerQueue;
  }

  const jobs = [];
  try {
    if (isWindows) {
      const command = `powershell -Command "Get-PrintJob -PrinterName '${PRINTER_CONFIG.name}' | Select-Object ID, JobStatus, Username, DocumentName, TotalPages, SubmittedTime | ConvertTo-Json"`;
      const { stdout } = await execAsync(command, { timeout: PRINTER_CONFIG.defaultTimeout });
      if (stdout.trim()) {
        const raw = JSON.parse(stdout);
        const list = Array.isArray(raw) ? raw : [raw];
        list.forEach(item => {
          if (item && item.ID) {
            jobs.push({
              jobId: item.ID.toString(),
              status: item.JobStatus || 'queued',
              user: item.Username || 'unknown',
              document: item.DocumentName || 'Print Document',
              size: item.TotalPages ? `${item.TotalPages} pages` : 'N/A',
              submittedAt: item.SubmittedTime ? new Date(item.SubmittedTime).toLocaleString() : new Date().toLocaleString()
            });
          }
        });
      }
    } else {
      // Linux/CUPS: lpstat -o
      const { stdout } = await execAsync(`lpstat -o "${PRINTER_CONFIG.name}"`, { timeout: PRINTER_CONFIG.defaultTimeout });
      if (stdout.trim()) {
        const lines = stdout.split('\n').filter(l => l.trim());
        lines.forEach(line => {
          const match = line.match(/^([\w\-]+)-(\d+)\s+(\S+)\s+(\d+)\s+(.+)$/);
          if (match) {
            jobs.push({
              jobId: match[2],
              status: 'queued',
              user: match[3],
              document: `Job ${match[2]}`,
              size: `${(parseInt(match[4], 10) / 1024).toFixed(2)} KB`,
              submittedAt: match[5]
            });
          }
        });
      }
    }
  } catch (err) {
    console.warn(`[PRINTER] Get spool queue command failed: ${err.message}. Returning Mock spool list.`);
    return mockSpoolerQueue;
  }
  return jobs;
}

/**
 * Validate print settings
 */
function validatePrintSettings(settings) {
  const errors = [];

  if (!settings || typeof settings !== 'object') {
    return { valid: false, errors: ['Settings must be an object'] };
  }

  const validPaperTypes = ['Plain Paper', 'Glossy'];
  if (settings.paperType && !validPaperTypes.includes(settings.paperType)) {
    errors.push(`Invalid paper type: ${settings.paperType}`);
  }

  const validQualities = ['Normal', 'Best', 'Photo'];
  if (settings.printQuality && !validQualities.includes(settings.printQuality)) {
    errors.push(`Invalid print quality: ${settings.printQuality}`);
  }

  const validDPIs = [600, 1200];
  if (settings.printDPI && !validDPIs.includes(settings.printDPI)) {
    errors.push(`Invalid DPI: ${settings.printDPI}`);
  }

  const validColorModes = ['Color', 'Grayscale'];
  if (settings.colorMode && !validColorModes.includes(settings.colorMode)) {
    errors.push(`Invalid color mode: ${settings.colorMode}`);
  }

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
 */
async function getPrinterCapabilities() {
  return {
    capabilities: {
      paperTypes: ['Plain Paper', 'Glossy'],
      printQualities: ['Normal', 'Best', 'Photo'],
      colorModes: ['Color', 'Grayscale'],
      paperSizes: ['A4', 'Letter', 'Legal']
    },
    message: 'Capabilities retrieved successfully'
  };
}

module.exports = {
  formatPrinterOptions,
  getPrinterStatus,
  submitJobToPrinter,
  getPrintQueueStatus,
  isJobInQueue,
  cancelPrintJob,
  cancelAllPrintJobs,
  getSpoolQueue,
  wakePrinter,
  validatePrintSettings,
  getPrinterCapabilities,
  PRINTER_CONFIG
};
