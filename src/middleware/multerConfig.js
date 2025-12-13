const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fileValidator = require('../utils/fileValidator');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

// Configure file filter
const fileFilter = (req, file, cb) => {
  // Validate file format
  if (fileValidator.validateFileFormat(file.originalname, file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file format: ${file.mimetype}`), false);
  }
};

// Create multer instance with configuration
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: fileValidator.DEFAULT_FILE_SIZE_LIMIT
  }
});

module.exports = upload;
