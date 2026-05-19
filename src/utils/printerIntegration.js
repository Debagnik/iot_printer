const { execSync, exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = util.promisify(exec);

/**
 * Printer Integration Module
 * Handles communication with system printer via CUPS/lp command on Raspberry Pi/Linux
 * and via PowerShell on Windows
 */

require('dotenv').config();

const isWindows = os.platform() === 'win32';
const isLinux = os.platform() === 'linux';

const PRINTER_CONFIG = {
  name: process.env.PRINTER_NAME || 'Ink-Tank-310-series',
  defaultTimeout: 5000,
  retryAttempts: 3,
  retryDelay: 1000,
  wakeWaitMs: 2000
};

/**
 * Format print options from settings object to CUPS command options
 */
function formatPrinterOptions(settings) {
  const options = [];
  const paperSizeMap = { 'A4': 'A4', 'Letter': 'Letter', 'Legal': 'Legal' };
  const colorModeMap = { 'Color': '-o ColorModel=RGB', 'Grayscale': '-o ColorModel=KGray' };
  const qualityMap = { 'Normal': '-o OutputMode=Normal', 'Best': '-o OutputMode=Best', 'Photo': '-o OutputMode=Photo' };
  const paperTypeMap = { 'Plain Paper': '-o MediaType=Plain', 'Glossy': '-o MediaType=Glossy' };

  console.log(`[PRINTER] formatPrinterOptions input:`, settings);

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

  const result = options.join(' ');
  console.log(`[PRINTER] Formatted options: ${result}`);
  return result;
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wake the printer from sleep/standby mode
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function wakePrinter() {
  try {
    console.log('[PRINTER] Attempting to wake printer...');

    if (isLinux) {
      // Re-enable the CUPS queue in case it's paused/stopped
      try {
        await execAsync(`cupsenable ${PRINTER_CONFIG.name}`, { timeout: PRINTER_CONFIG.defaultTimeout });
        console.log('[PRINTER] cupsenable executed');
      } catch (e) {
        console.log('[PRINTER] cupsenable note:', e.message);
      }

      // Accept jobs on the queue
      try {
        await execAsync(`cupsaccept ${PRINTER_CONFIG.name}`, { timeout: PRINTER_CONFIG.defaultTimeout });
        console.log('[PRINTER] cupsaccept executed');
      } catch (e) {
        console.log('[PRINTER] cupsaccept note:', e.message);
      }

      // Send a zero-byte job to trigger USB wake
      try {
        await execAsync(`lp -d ${PRINTER_CONFIG.name} -o raw /dev/null 2>/dev/null`, { timeout: PRINTER_CONFIG.defaultTimeout });
        console.log('[PRINTER] Wake signal sent via lp');
      } catch (e) {
        console.log('[PRINTER] Wake signal note:', e.message);
      }
    } else if (isWindows) {
      // On Windows, try to set the printer to online via PowerShell
      try {
        const psCmd = `powershell -Command "Set-Printer -Name '${PRINTER_CONFIG.name}' -Enabled $true" 2>$null`;
        await execAsync(psCmd, { timeout: PRINTER_CONFIG.defaultTimeout });
        console.log('[PRINTER] Windows Set-Printer executed');
      } catch (e) {
        console.log('[PRINTER] Windows wake note:', e.message);
      }
    }

    // Wait for the printer to wake up
    await sleep(PRINTER_CONFIG.wakeWaitMs);

    return { success: true, message: 'Wake signal sent to printer' };
  } catch (err) {
    console.error('[PRINTER] Wake error:', err.message);
    return { success: false, message: `Failed to wake printer: ${err.message}` };
  }
}

/**
 * Check if printer is available and ready (cross-platform)
 */
async function getPrinterStatus() {
  try {
    if (isWindows) {
      return await getPrinterStatusWindows();
    }
    // Linux/CUPS path
    const { stdout } = await execAsync(`lpstat -p -d`, { timeout: PRINTER_CONFIG.defaultTimeout });

    if (stdout.includes(PRINTER_CONFIG.name)) {
      if (stdout.includes('idle')) {
        return { available: true, status: 'idle', message: `Printer ${PRINTER_CONFIG.name} is ready` };
      } else if (stdout.includes('processing')) {
        return { available: true, status: 'processing', message: `Printer ${PRINTER_CONFIG.name} is currently processing a job` };
      } else if (stdout.match(/disabled|stopped|sleeping|paused/i)) {
        return { available: true, status: 'sleeping', message: `Printer ${PRINTER_CONFIG.name} is sleeping or disabled` };
      } else {
        return { available: true, status: 'unknown', message: `Printer ${PRINTER_CONFIG.name} status is unknown` };
      }
    } else {
      return { available: false, status: 'not_found', message: `Printer ${PRINTER_CONFIG.name} not found` };
    }
  } catch (err) {
    try {
      await execAsync(`lpstat -p`, { timeout: PRINTER_CONFIG.defaultTimeout });
      return { available: false, status: 'not_configured', message: 'CUPS is running but printer is not configured' };
    } catch (innerErr) {
      return { available: false, status: 'cups_unavailable', message: 'CUPS service is not available or not running' };
    }
  }
}

/**
 * Windows printer status check via PowerShell
 */
async function getPrinterStatusWindows() {
  try {
    const psCmd = `powershell -Command "Get-Printer -Name '${PRINTER_CONFIG.name}' | Select-Object -Property PrinterStatus | ConvertTo-Json"`;
    const { stdout } = await execAsync(psCmd, { timeout: PRINTER_CONFIG.defaultTimeout });
    const data = JSON.parse(stdout.trim());
    const status = data.PrinterStatus || 0;
    // PrinterStatus: 0=Normal/Idle, 1=Paused, 3=Offline, etc.
    if (status === 0) {
      return { available: true, status: 'idle', message: `Printer ${PRINTER_CONFIG.name} is ready` };
    } else if (status === 1) {
      return { available: true, status: 'sleeping', message: `Printer ${PRINTER_CONFIG.name} is paused` };
    } else {
      return { available: true, status: 'sleeping', message: `Printer ${PRINTER_CONFIG.name} status code: ${status}` };
    }
  } catch (err) {
    return { available: false, status: 'not_found', message: `Printer ${PRINTER_CONFIG.name} not found: ${err.message}` };
  }
}

/**
 * Submit a print job (cross-platform) with automatic wake
 */
async function submitJobToPrinter(documentPath, settings) {
  try {
    console.log(`[PRINTER] submitJobToPrinter called with path: ${documentPath}`);

    if (!fs.existsSync(documentPath)) {
      throw new Error(`Document file not found: ${documentPath}`);
    }
    if (!settings || typeof settings !== 'object') {
      throw new Error('Invalid print settings');
    }

    // Check printer status and wake if needed
    const status = await getPrinterStatus();
    console.log(`[PRINTER] Status before submit:`, status);

    if (status.status === 'sleeping' || status.status === 'not_found') {
      console.log('[PRINTER] Printer appears to be sleeping/offline, attempting wake...');
      await wakePrinter();
      // Re-check after wake
      const statusAfterWake = await getPrinterStatus();
      console.log('[PRINTER] Status after wake:', statusAfterWake);
    }

    if (isWindows) {
      return await submitJobToPrinterWindows(documentPath, settings);
    } else if (isLinux) {
      return await submitJobToPrinterLinux(documentPath, settings);
    } else {
      throw new Error(`Unsupported platform: ${os.platform()}`);
    }
  } catch (err) {
    console.error(`[PRINTER] Error in submitJobToPrinter: ${err.message}`);
    return { success: false, jobId: null, message: `Failed to submit job to printer: ${err.message}` };
  }
}

async function submitJobToPrinterWindows(documentPath, settings) {
  try {
    const command = `print /D:"${PRINTER_CONFIG.name}" "${documentPath}"`;
    const { stdout, stderr } = await execAsync(command, { timeout: PRINTER_CONFIG.defaultTimeout });
    const jobId = Math.floor(Date.now() / 1000).toString();
    return { success: true, jobId, message: `Job submitted successfully. Job ID: ${jobId}` };
  } catch (execError) {
    if (execError.message.includes('not found') || execError.message.includes('not recognized')) {
      throw new Error('Printer not found or print command not available');
    } else if (execError.message.includes('Access denied')) {
      throw new Error('Permission denied');
    } else if (execError.message.includes('timeout')) {
      throw new Error('Printer communication timeout');
    }
    throw new Error(`Printer submission failed: ${execError.message}`);
  }
}

async function submitJobToPrinterLinux(documentPath, settings) {
  try {
    const printerOptions = formatPrinterOptions(settings);
    const command = `lp -d ${PRINTER_CONFIG.name} ${printerOptions} "${documentPath}"`;
    console.log(`[PRINTER] Executing command: ${command}`);

    const { stdout, stderr } = await execAsync(command, { timeout: PRINTER_CONFIG.defaultTimeout });
    console.log(`[PRINTER] Command stdout: ${stdout}`);

    const jobIdMatch = stdout.match(/request id is [\w\-]+\-(\d+)/);
    const jobId = jobIdMatch ? jobIdMatch[1] : 'unknown';
    return { success: true, jobId, message: `Job submitted successfully. Job ID: ${jobId}` };
  } catch (execError) {
    if (execError.message.includes('No such file or directory')) {
      throw new Error('Printer not found or CUPS not installed');
    } else if (execError.message.includes('Permission denied')) {
      throw new Error('Permission denied');
    } else if (execError.message.includes('timeout')) {
      throw new Error('Printer communication timeout');
    }
    throw new Error(`Printer submission failed: ${execError.message}`);
  }
}

/**
 * Get print queue status from OS spooler (cross-platform)
 */
async function getSpoolQueue() {
  try {
    if (isWindows) {
      return await getSpoolQueueWindows();
    }
    return await getSpoolQueueLinux();
  } catch (err) {
    console.error('[PRINTER] getSpoolQueue error:', err.message);
    return { jobs: [], message: `Failed to retrieve spool queue: ${err.message}` };
  }
}

async function getSpoolQueueLinux() {
  try {
    const { stdout } = await execAsync(`lpstat -o ${PRINTER_CONFIG.name}`, { timeout: PRINTER_CONFIG.defaultTimeout });
    const lines = stdout.split('\n').filter(line => line.trim());
    const jobs = lines.map(line => {
      // Format: "PrinterName-123  username  1024  Mon 19 May 2025 12:00:00"
      const parts = line.split(/\s+/);
      const jobFullId = parts[0] || '';
      const idMatch = jobFullId.match(/-(\d+)$/);
      return {
        spoolJobId: jobFullId,
        jobId: idMatch ? idMatch[1] : jobFullId,
        owner: parts[1] || 'unknown',
        size: parts[2] || '0',
        submitted: parts.slice(3).join(' ')
      };
    });
    return { jobs, message: `Spool queue has ${jobs.length} job(s)` };
  } catch (err) {
    return { jobs: [], message: `Spool queue empty or unavailable` };
  }
}

async function getSpoolQueueWindows() {
  try {
    const psCmd = `powershell -Command "Get-PrintJob -PrinterName '${PRINTER_CONFIG.name}' | Select-Object Id,JobStatus,DocumentName,UserName,SubmittedTime,Size | ConvertTo-Json -Compress"`;
    const { stdout } = await execAsync(psCmd, { timeout: PRINTER_CONFIG.defaultTimeout });
    const trimmed = stdout.trim();
    if (!trimmed || trimmed === '') {
      return { jobs: [], message: 'Spool queue is empty' };
    }
    let parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) parsed = [parsed];
    const jobs = parsed.map(j => ({
      spoolJobId: String(j.Id),
      jobId: String(j.Id),
      owner: j.UserName || 'unknown',
      size: String(j.Size || 0),
      submitted: j.SubmittedTime || '',
      documentName: j.DocumentName || '',
      status: j.JobStatus || ''
    }));
    return { jobs, message: `Spool queue has ${jobs.length} job(s)` };
  } catch (err) {
    return { jobs: [], message: `Spool queue empty or unavailable` };
  }
}

/**
 * Legacy CUPS queue status (kept for backward compatibility)
 */
async function getPrintQueueStatus() {
  return getSpoolQueue();
}

/**
 * Check if a print job is still in the queue
 */
async function isJobInQueue(jobId) {
  try {
    const queueStatus = await getSpoolQueue();
    const jobInQueue = queueStatus.jobs.some(job =>
      job.jobId.includes(String(jobId)) || job.spoolJobId.includes(String(jobId))
    );
    return { inQueue: jobInQueue, status: jobInQueue ? 'in-progress' : 'completed' };
  } catch (err) {
    console.error(`[PRINTER] Error checking job status: ${err.message}`);
    return { inQueue: false, status: 'completed' };
  }
}

/**
 * Cancel a print job (cross-platform)
 */
async function cancelPrintJob(jobId) {
  try {
    if (!jobId) throw new Error('Job ID is required');

    if (isWindows) {
      return await cancelPrintJobWindows(jobId);
    }
    // Linux
    const command = `cancel ${PRINTER_CONFIG.name}-${jobId}`;
    await execAsync(command, { timeout: PRINTER_CONFIG.defaultTimeout });
    return { success: true, message: `Job ${jobId} cancelled successfully` };
  } catch (err) {
    return { success: false, message: `Failed to cancel job: ${err.message}` };
  }
}

async function cancelPrintJobWindows(jobId) {
  try {
    const psCmd = `powershell -Command "Remove-PrintJob -PrinterName '${PRINTER_CONFIG.name}' -ID ${jobId} -ErrorAction Stop"`;
    await execAsync(psCmd, { timeout: PRINTER_CONFIG.defaultTimeout });
    return { success: true, message: `Job ${jobId} cancelled successfully` };
  } catch (err) {
    return { success: false, message: `Failed to cancel job on Windows: ${err.message}` };
  }
}

/**
 * Cancel all print jobs (cross-platform)
 */
async function cancelAllPrintJobs() {
  try {
    if (isWindows) {
      const psCmd = `powershell -Command "Get-PrintJob -PrinterName '${PRINTER_CONFIG.name}' | Remove-PrintJob -ErrorAction SilentlyContinue"`;
      await execAsync(psCmd, { timeout: PRINTER_CONFIG.defaultTimeout });
      return { success: true, message: 'All print jobs cancelled' };
    }
    // Linux
    await execAsync(`cancel -a ${PRINTER_CONFIG.name}`, { timeout: PRINTER_CONFIG.defaultTimeout });
    return { success: true, message: 'All print jobs cancelled' };
  } catch (err) {
    return { success: false, message: `Failed to cancel all jobs: ${err.message}` };
  }
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
  return { valid: errors.length === 0, errors };
}

/**
 * Get printer capabilities
 */
async function getPrinterCapabilities() {
  const defaultCaps = {
    paperTypes: ['Plain Paper', 'Glossy'],
    printQualities: [600, 1200],
    colorModes: ['Color', 'Grayscale'],
    paperSizes: ['A4', 'Letter', 'Legal']
  };
  try {
    await execAsync(`lpoptions -p ${PRINTER_CONFIG.name} -l`, { timeout: PRINTER_CONFIG.defaultTimeout });
    return { capabilities: defaultCaps, message: 'Printer capabilities retrieved successfully' };
  } catch (err) {
    return { capabilities: defaultCaps, message: 'Using default capabilities' };
  }
}

module.exports = {
  formatPrinterOptions,
  getPrinterStatus,
  submitJobToPrinter,
  getPrintQueueStatus,
  getSpoolQueue,
  isJobInQueue,
  cancelPrintJob,
  cancelAllPrintJobs,
  wakePrinter,
  validatePrintSettings,
  getPrinterCapabilities,
  PRINTER_CONFIG
};
