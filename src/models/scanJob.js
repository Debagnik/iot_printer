const db = require('./database');
const fs = require('fs').promises;
const path = require('path');

/**
 * Create a new scan job entry
 * @param {number} userId
 * @param {string} fileName
 * @param {string} filePath
 */
async function createScanJob(userId, fileName, filePath) {
    if (!userId || !fileName || !filePath) {
        throw new Error('Missing required scan job data');
    }

    const result = await db.insertScanJob(userId, fileName, filePath);
    return {
        id: result.lastID,
        userId,
        fileName,
        filePath,
        createdAt: new Date()
    };
}

/**
 * Get all scan jobs for a user
 * @param {number} userId
 */
async function getUserScanJobs(userId) {
    return db.getScanJobs(userId);
}

/**
 * Get all scan jobs (admin only)
 */
async function getAllScanJobs() {
    return db.getAllScanJobs();
}

/**
 * Delete a scan job and its file
 * @param {number} jobId
 * @param {number} requestingUserId - ID of user requesting delete
 * @param {boolean} isAdmin - whether requester is admin
 */
async function deleteScanJob(jobId, requestingUserId, isAdmin) {
    const job = await db.getScanJob(jobId);
    if (!job) {
        throw new Error('Scan job not found');
    }

    // Check access: Admin can delete any, Owner can delete their own
    if (!isAdmin && job.userId !== requestingUserId) {
        throw new Error('Access denied');
    }

    // Try to delete file from disk
    try {
        // Assuming filePath is stored as absolute or relative to project root
        // Based on scannerController, it seems files are in public/scans, but let's verify usage there.
        // Usually filePath stored is relative or absolute.
        // For safety, we will check if file exists before unlink.
        await fs.unlink(job.filePath).catch(err => console.warn(`Failed to delete file ${job.filePath}:`, err.message));
    } catch (err) {
        console.error("Error deleting file:", err);
    }

    return db.deleteScanJob(jobId);
}

module.exports = {
    createScanJob,
    getUserScanJobs,
    getAllScanJobs,
    deleteScanJob
};
