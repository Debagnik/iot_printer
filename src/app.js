const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./models/database');
const authController = require('./controllers/authController');
const uploadController = require('./controllers/uploadController');
const configController = require('./controllers/configController');
const jobController = require('./controllers/jobController');
const upload = require('./middleware/multerConfig');
const { requireAuth, requireGuest } = require('./middleware/auth');

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
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

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
app.post('/submit-job', requireAuth, jobController.postSubmitJob);
app.get('/job/:jobId', requireAuth, jobController.getJobDetails);
app.get('/api/job/:jobId/status', requireAuth, jobController.updateJobStatus);

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
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

module.exports = app;
