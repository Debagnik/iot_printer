require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./models/database');
const cleanupService = require('./utils/cleanupService');
const authController = require('./controllers/authController');
const uploadController = require('./controllers/uploadController');
const configController = require('./controllers/configController');
const jobController = require('./controllers/jobController');
const scannerController = require('./controllers/scannerController');
const adminController = require('./controllers/adminController');
const upload = require('./middleware/multerConfig');
const { requireAuth, requireGuest } = require('./middleware/auth');
const { requireAdmin } = require('./middleware/adminAuth');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Session management
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false'),
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.set("trust proxy", 1);

// Routes
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

// Authentication routes
app.get('/login', requireGuest, authController.getLogin);
app.post('/login', requireGuest, authController.postLogin);
app.get('/register', requireGuest, authController.getRegister);
app.post('/register', requireGuest, authController.postRegister);
app.get('/logout', authController.logout);

// Protected routes
app.get('/dashboard', requireAuth, jobController.getDashboard);

// Upload routes
app.get('/upload', requireAuth, uploadController.getUpload);
app.post('/upload', requireAuth, upload.single('document'), uploadController.postUpload);

// Configuration routes
app.get('/configure', requireAuth, configController.getConfig);
app.post('/configure', requireAuth, configController.postConfig);

// Job submission routes
app.get('/submit-job', requireAuth, jobController.getSubmitJob);
app.post('/submit-job/confirm-flip', requireAuth, jobController.postConfirmFlip);
app.post('/submit-job', requireAuth, jobController.postSubmitJob);
app.get('/job/:jobId', requireAuth, jobController.getJobDetails);
app.get('/api/job/:jobId/status', requireAuth, jobController.updateJobStatus);
app.post('/api/cleanup', requireAuth, jobController.manualCleanup);

// Scanner routes
app.get('/scanner', requireAuth, scannerController.getScannerPage);
app.post('/scanner', requireAuth, scannerController.postScanDocument);
app.get('/scanner/download/:fileName', requireAuth, scannerController.downloadScannedDocument);
app.delete('/scanner/delete/:fileName', requireAuth, scannerController.deleteScannedDocument);

// Admin routes
app.get('/admin', requireAuth, requireAdmin, adminController.getAdminDashboard);
app.get('/api/admin/users', requireAuth, requireAdmin, adminController.getAllUsers);
app.post('/api/admin/users', requireAuth, requireAdmin, adminController.createUser);
app.delete('/api/admin/users/:userId', requireAuth, requireAdmin, adminController.deleteUser);
app.put('/api/admin/users/:userId/role', requireAuth, requireAdmin, adminController.updateUserRole);
app.post('/api/admin/users/:userId/reset-password', requireAuth, requireAdmin, adminController.resetUserPassword);
app.put('/api/admin/users/:userId/enabled', requireAuth, requireAdmin, adminController.toggleUserEnabled);
app.get('/api/admin/registration', requireAuth, requireAdmin, adminController.getRegistrationStatus);
app.post('/api/admin/registration', requireAuth, requireAdmin, adminController.setRegistrationStatus);
app.get('/api/admin/jobs', requireAuth, requireAdmin, adminController.getAllPrintJobs);
app.delete('/api/admin/jobs/:jobId', requireAuth, requireAdmin, adminController.deletePrintJob);
app.post('/api/admin/cleanup', requireAuth, requireAdmin, adminController.cleanupJobFiles);
app.get('/api/admin/scans', requireAuth, requireAdmin, adminController.getAllScanJobs);
app.delete('/api/admin/scans/:scanId', requireAuth, requireAdmin, adminController.deleteScanJob);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { error: err.message });
});

const PORT = process.env.PORT || 2000;

// Initialize database and start server
db.initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Print Queue Manager listening on port ${PORT}`);
    });

    // Schedule daily cleanup
    cleanupService.scheduleDailyCleanup();
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

module.exports = app;
