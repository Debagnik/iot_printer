const User = require('../models/user');
const db = require('../models/database');
const fs = require('fs').promises;
const path = require('path');

/**
 * Display admin dashboard
 */
async function getAdminDashboard(req, res) {
  try {
    const users = await User.getAllUsers();
    const jobs = await db.getAllPrintJobs();

    res.render('admin-dashboard', {
      username: req.session.username,
      userId: req.session.userId,
      users,
      jobs,
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
  setRegistrationStatus
};
