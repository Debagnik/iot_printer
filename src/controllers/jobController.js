const PrintJob = require('../models/printJob');
const PrintSettings = require('../models/printSettings');
const fs = require('fs').promises;
const path = require('path');

/**
 * Display job submission page
 * Shows uploaded file and print settings for confirmation
 */
async function getSubmitJob(req, res) {
  try {
    // Check if file was uploaded
    if (!req.session.uploadedFile) {
      return res.render('error', {
        error: 'No file uploaded. Please upload a document first.'
      });
    }

    // Get current print settings or defaults
    const settings = req.session.printSettings || PrintSettings.getDefaults();

    res.render('submit-job', {
      username: req.session.username,
      uploadedFile: req.session.uploadedFile,
      settings,
      error: null,
      success: null
    });
  } catch (err) {
    console.error('Submit job page error:', err);
    res.status(500).render('error', { error: 'Failed to load job submission page' });
  }
}

/**
 * Handle job submission
 * Creates print job and submits to printer queue
 */
async function postSubmitJob(req, res) {
  try {
    // Validate session data
    if (!req.session.uploadedFile) {
      return res.render('error', {
        error: 'No file uploaded. Please upload a document first.'
      });
    }

    if (!req.session.userId) {
      return res.render('error', {
        error: 'User session invalid. Please log in again.'
      });
    }

    const uploadedFile = req.session.uploadedFile;
    const settings = req.session.printSettings || PrintSettings.getDefaults();

    // Create print job in database
    const jobResult = await PrintJob.createPrintJob({
      userId: req.session.userId,
      documentName: uploadedFile.originalName,
      documentPath: uploadedFile.path,
      paperType: settings.paperType,
      printQuality: settings.printQuality,
      colorMode: settings.colorMode,
      paperSize: settings.paperSize
    });

    const jobId = jobResult.jobId;

    // Submit job to printer queue
    const submissionResult = await PrintJob.submitJobToQueue(
      jobId,
      uploadedFile.path,
      settings
    );

    // Clear session data after successful submission
    req.session.uploadedFile = null;
    req.session.printSettings = null;

    // Render confirmation page
    res.render('job-confirmation', {
      username: req.session.username,
      jobId,
      documentName: uploadedFile.originalName,
      settings,
      submissionResult,
      error: null
    });
  } catch (err) {
    console.error('Job submission error:', err);
    res.status(500).render('error', { error: `Job submission failed: ${err.message}` });
  }
}

/**
 * Get job details
 */
async function getJobDetails(req, res) {
  try {
    const { jobId } = req.params;

    // Validate job ID
    if (!jobId || isNaN(jobId)) {
      return res.status(400).render('error', {
        error: 'Invalid job ID'
      });
    }

    // Get job from database
    const job = await PrintJob.getPrintJob(parseInt(jobId, 10));

    if (!job) {
      return res.status(404).render('error', {
        error: 'Job not found'
      });
    }

    // Verify user owns this job
    if (job.userId !== req.session.userId) {
      return res.status(403).render('error', {
        error: 'Access denied. You do not have permission to view this job.'
      });
    }

    res.render('job-details', {
      username: req.session.username,
      job
    });
  } catch (err) {
    console.error('Get job details error:', err);
    res.status(500).render('error', { error: 'Failed to retrieve job details' });
  }
}

/**
 * Display dashboard with job history
 * Shows user's print jobs in reverse chronological order
 */
async function getDashboard(req, res) {
  try {
    // Verify user is authenticated
    if (!req.session.userId) {
      return res.redirect('/login');
    }

    // Retrieve user's print jobs from database
    const jobs = await PrintJob.getUserPrintJobs(req.session.userId);

    // Jobs are already sorted in reverse chronological order by the database query
    res.render('dashboard', {
      username: req.session.username,
      jobs: jobs || []
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).render('error', { error: 'Failed to load dashboard' });
  }
}

/**
 * Update job status by checking printer queue
 * Called periodically to sync job status with printer
 */
async function updateJobStatus(req, res) {
  try {
    const { jobId } = req.params;

    if (!jobId || isNaN(jobId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    // Get job from database
    const job = await PrintJob.getPrintJob(parseInt(jobId, 10));

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Verify user owns this job
    if (job.userId !== req.session.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if job is still in printer queue
    const printerIntegration = require('../utils/printerIntegration');
    const statusCheck = await printerIntegration.isJobInQueue(job.id);

    // Update job status in database if it's completed
    if (!statusCheck.inQueue && job.status === 'in-progress') {
      await PrintJob.updateJobStatus(job.id, 'completed');
    }

    res.json({
      jobId: job.id,
      status: statusCheck.status,
      updated: !statusCheck.inQueue
    });
  } catch (err) {
    console.error('Update job status error:', err);
    res.status(500).json({ error: 'Failed to update job status' });
  }
}

/**
 * Manually trigger cleanup
 */
async function manualCleanup(req, res) {
  try {
    const cleanupService = require('../utils/cleanupService');
    const result = await cleanupService.runAllCleanup();

    res.json({
      success: true,
      message: result.message,
      details: {
        uploadedDocs: result.uploadedDocs,
        scannedDocs: result.scannedDocs,
        printJobs: result.printJobs
      }
    });
  } catch (err) {
    console.error('Manual cleanup error:', err);
    res.status(500).json({ error: 'Failed to run cleanup' });
  }
}

module.exports = {
  getSubmitJob,
  postSubmitJob,
  getJobDetails,
  getDashboard,
  updateJobStatus,
  manualCleanup
};
