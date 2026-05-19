const User = require('../models/user');
const db = require('../models/database');
const ScanJob = require('../models/scanJob');
const fs = require('fs').promises;
const path = require('path');

/**
 * Display admin dashboard
 */
async function getAdminDashboard(req, res) {
  try {
    const users = await User.getAllUsers();
    const jobs = await db.getAllPrintJobs();
    const rawScans = await ScanJob.getAllScanJobs();
    const scans = await ScanJob.enrichScanJobs(rawScans);

    res.render('admin-dashboard', {
      username: req.session.username,
      userId: req.session.userId,
      users,
      jobs,
      scans,
      error: null,
      success: null
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).render('error', { error: 'Failed to load admin dashboard' });
  }
}

/**
 * Get all users (API)
 */
async function getAllUsers(req, res) {
  try {
    const users = await User.getAllUsers();
    res.json({ success: true, users });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Create a new user (admin only)
 */
async function createUser(req, res) {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password required' });
    }

    const newUser = await User.createUser(username, password, role || User.USER_ROLE.USER);

    res.json({ success: true, user: newUser });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * Delete a user (admin only)
 */
async function deleteUser(req, res) {
  try {
    const { userId } = req.params;

    if (!userId || isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }

    // Prevent deleting self
    if (parseInt(userId, 10) === req.session.userId) {
      return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
    }

    await User.deleteUser(parseInt(userId, 10));

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Update user role (admin only)
 */
async function updateUserRole(req, res) {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!userId || isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }

    if (!role) {
      return res.status(400).json({ success: false, error: 'Role required' });
    }

    await User.updateUserRole(parseInt(userId, 10), role);

    res.json({ success: true, message: 'User role updated successfully' });
  } catch (err) {
    console.error('Update user role error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * Reset user password (admin only)
 */
async function resetUserPassword(req, res) {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!userId || isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    await User.resetUserPassword(parseInt(userId, 10), newPassword);

    res.json({ success: true, message: 'User password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Get all print jobs (admin only)
 */
async function getAllPrintJobs(req, res) {
  try {
    const jobs = await db.getAllPrintJobs();
    res.json({ success: true, jobs });
  } catch (err) {
    console.error('Get all jobs error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Delete a print job (admin only)
 */
async function deletePrintJob(req, res) {
  try {
    const { jobId } = req.params;

    if (!jobId || isNaN(jobId)) {
      return res.status(400).json({ success: false, error: 'Invalid job ID' });
    }

    const job = await db.getPrintJob(parseInt(jobId, 10));

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    // Delete associated file if it exists
    try {
      await fs.unlink(job.documentPath);
    } catch (fileErr) {
      console.warn(`Could not delete file: ${job.documentPath}`, fileErr.message);
    }

    await db.deletePrintJob(parseInt(jobId, 10));

    res.json({ success: true, message: 'Print job deleted successfully' });
  } catch (err) {
    console.error('Delete job error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}


/**
 * Get all scan jobs (admin only)
 */
async function getAllScanJobs(req, res) {
  try {
    const scans = await ScanJob.getAllScanJobs();
    const enrichedScans = await ScanJob.enrichScanJobs(scans);
    res.json({ success: true, scans: enrichedScans });
  } catch (err) {
    console.error('Get all scans error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Delete a scan job (admin only)
 */
async function deleteScanJob(req, res) {
  try {
    const { scanId } = req.params;

    // Check rights - Admin is calling
    await ScanJob.deleteScanJob(scanId, req.session.userId, true);

    res.json({ success: true, message: 'Scan job deleted successfully' });
  } catch (err) {
    console.error('Delete scan error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Clean up local job files (admin only)
 */
async function cleanupJobFiles(req, res) {
  try {
    const uploadDir = path.join(__dirname, '../../uploads');
    const scannedDir = path.join(__dirname, '../../scanned_documents');

    let deletedCount = 0;

    // Clean uploads directory
    try {
      const uploadFiles = await fs.readdir(uploadDir);
      for (const file of uploadFiles) {
        const filePath = path.join(uploadDir, file);
        await fs.unlink(filePath);
        deletedCount++;
      }
    } catch (err) {
      console.warn('Error cleaning uploads directory:', err.message);
    }

    // Clean scanned documents directory
    try {
      const scannedFiles = await fs.readdir(scannedDir);
      for (const file of scannedFiles) {
        const filePath = path.join(scannedDir, file);
        await fs.unlink(filePath);
        deletedCount++;
      }
    } catch (err) {
      console.warn('Error cleaning scanned documents directory:', err.message);
    }

    res.json({ success: true, message: `Cleaned up ${deletedCount} files` });
  } catch (err) {
    console.error('Cleanup error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Toggle user enabled status (admin only)
 */
async function toggleUserEnabled(req, res) {
  try {
    const { userId } = req.params;
    const { enabled } = req.body;

    if (!userId || isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Enabled must be a boolean' });
    }

    // Prevent disabling self
    if (parseInt(userId, 10) === req.session.userId && !enabled) {
      return res.status(400).json({ success: false, error: 'Cannot disable your own account' });
    }

    await User.setUserEnabled(parseInt(userId, 10), enabled);

    res.json({ success: true, message: `User ${enabled ? 'enabled' : 'disabled'} successfully` });
  } catch (err) {
    console.error('Toggle user enabled error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Get registration status (admin only)
 */
async function getRegistrationStatus(req, res) {
  try {
    const enabled = await User.isRegistrationEnabled();
    res.json({ success: true, registrationEnabled: enabled });
  } catch (err) {
    console.error('Get registration status error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Set registration status (admin only)
 */
async function setRegistrationStatus(req, res) {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Enabled must be a boolean' });
    }

    await User.setRegistrationEnabled(enabled);

    res.json({ success: true, message: `User registration ${enabled ? 'enabled' : 'disabled'}` });
  } catch (err) {
    console.error('Set registration status error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Display admin print queue page
 */
async function getAdminPrintQueue(req, res) {
  try {
    const printerIntegration = require('../utils/printerIntegration');
    const jobs = await db.getAllPrintJobs();
    const spoolQueue = await printerIntegration.getSpoolQueue();
    const printerStatus = await printerIntegration.getPrinterStatus();

    // Filter active jobs (pending/in-progress)
    const activeJobs = jobs.filter(j => j.status === 'pending' || j.status === 'in-progress');

    res.render('admin-print-queue', {
      username: req.session.username,
      userId: req.session.userId,
      activeJobs,
      allJobs: jobs,
      spoolJobs: spoolQueue.jobs,
      printerStatus,
      error: null,
      success: null
    });
  } catch (err) {
    console.error('Admin print queue error:', err);
    res.status(500).render('error', { error: 'Failed to load print queue' });
  }
}

/**
 * Get live spool queue data (API)
 */
async function getSpoolQueueApi(req, res) {
  try {
    const printerIntegration = require('../utils/printerIntegration');
    const spoolQueue = await printerIntegration.getSpoolQueue();
    const printerStatus = await printerIntegration.getPrinterStatus();
    const jobs = await db.getAllPrintJobs();
    const activeJobs = jobs.filter(j => j.status === 'pending' || j.status === 'in-progress');

    res.json({ success: true, spoolJobs: spoolQueue.jobs, activeJobs, printerStatus });
  } catch (err) {
    console.error('Spool queue API error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Cancel a single print job (admin, no ownership check)
 */
async function cancelPrintJobAdmin(req, res) {
  try {
    const { jobId } = req.params;
    if (!jobId || isNaN(jobId)) {
      return res.status(400).json({ success: false, error: 'Invalid job ID' });
    }

    const printerIntegration = require('../utils/printerIntegration');
    const cancelResult = await printerIntegration.cancelPrintJob(jobId);
    console.log(`[ADMIN] Cancel result for job ${jobId}:`, cancelResult);

    // Update DB status
    await db.updatePrintJobStatus(parseInt(jobId, 10), 'cancelled');

    res.json({ success: true, message: `Job ${jobId} cancelled` });
  } catch (err) {
    console.error('Admin cancel job error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Cancel all print jobs (admin)
 */
async function cancelAllPrintJobsAdmin(req, res) {
  try {
    const printerIntegration = require('../utils/printerIntegration');
    const cancelResult = await printerIntegration.cancelAllPrintJobs();
    console.log('[ADMIN] Cancel all result:', cancelResult);

    // Update all active jobs in DB
    const jobs = await db.getAllPrintJobs();
    for (const job of jobs) {
      if (job.status === 'pending' || job.status === 'in-progress') {
        await db.updatePrintJobStatus(job.id, 'cancelled');
      }
    }

    res.json({ success: true, message: 'All print jobs cancelled' });
  } catch (err) {
    console.error('Admin cancel all error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getAdminDashboard,
  getAllUsers,
  createUser,
  deleteUser,
  updateUserRole,
  resetUserPassword,
  getAllPrintJobs,
  deletePrintJob,
  cleanupJobFiles,
  toggleUserEnabled,
  getRegistrationStatus,
  setRegistrationStatus,
  getAllScanJobs,
  deleteScanJob,
  getAdminPrintQueue,
  getSpoolQueueApi,
  cancelPrintJobAdmin,
  cancelAllPrintJobsAdmin
};
