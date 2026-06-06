const mysql = require('mysql2/promise');

// Connection pool reference
let pool = null;

/**
 * Initialize database connection and create tables if they don't exist
 * @returns {Promise<mysql.Pool>}
 */
async function initializeDatabase() {
  if (pool) {
    return pool;
  }

  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'print_queue',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // Verify connection by getting a connection from pool
  try {
    const connection = await pool.getConnection();
    connection.release();
    
    // Create tables
    await createTables();
    return pool;
  } catch (err) {
    pool = null;
    throw new Error(`Failed to connect to database: ${err.message}`);
  }
}

/**
 * Create all required tables
 * @returns {Promise<void>}
 */
async function createTables() {
  // User table
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS User (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(255) UNIQUE NOT NULL,
      passwordHash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'USER',
      enabled TINYINT DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  // PrintJob table
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS PrintJob (
      id INT PRIMARY KEY AUTO_INCREMENT,
      userId INT NOT NULL,
      documentName VARCHAR(255) NOT NULL,
      documentPath VARCHAR(512) NOT NULL,
      paperType VARCHAR(100) DEFAULT 'Plain Paper',
      printQuality VARCHAR(50) DEFAULT '600',
      colorMode VARCHAR(50) DEFAULT 'Grayscale',
      paperSize VARCHAR(50) DEFAULT 'A4',
      status VARCHAR(50) DEFAULT 'pending',
      submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      completedAt DATETIME,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  // Session table
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS Session (
      sessionId VARCHAR(255) PRIMARY KEY,
      userId INT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  // ScanJob table
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ScanJob (
      id INT PRIMARY KEY AUTO_INCREMENT,
      userId INT NOT NULL,
      fileName VARCHAR(255) NOT NULL,
      filePath VARCHAR(512) NOT NULL,
      status VARCHAR(50) DEFAULT 'completed',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  // Settings table for system-wide configuration
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS Settings (
      \`key\` VARCHAR(255) PRIMARY KEY,
      value TEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
}

/**
 * Execute a query with parameters
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<any>}
 */
async function query(sql, params = []) {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  const [rows] = await pool.execute(sql, params);
  return rows || [];
}

/**
 * Execute a query that returns a single row
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<any>}
 */
async function queryOne(sql, params = []) {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  const [rows] = await pool.execute(sql, params);
  return rows && rows.length > 0 ? rows[0] : null;
}

/**
 * Execute a query that modifies data (INSERT, UPDATE, DELETE)
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<{lastID: number, changes: number}>}
 */
async function run(sql, params = []) {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  const [result] = await pool.execute(sql, params);
  return {
    lastID: result.insertId,
    changes: result.affectedRows
  };
}

/**
 * Get user by username
 * @param {string} username
 * @returns {Promise<any>}
 */
function getUserByUsername(username) {
  return queryOne('SELECT * FROM User WHERE username = ?', [username]);
}

/**
 * Get user by ID
 * @param {number} userId
 * @returns {Promise<any>}
 */
function getUserById(userId) {
  return queryOne('SELECT * FROM User WHERE id = ?', [userId]);
}

/**
 * Create a new user
 * @param {string} username
 * @param {string} passwordHash
 * @param {string} role - User role (USER or ADMIN)
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function createUser(username, passwordHash, role = 'USER') {
  return run(
    'INSERT INTO User (username, passwordHash, role) VALUES (?, ?, ?)',
    [username, passwordHash, role]
  );
}

/**
 * Insert a print job
 * @param {Object} jobData
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function insertPrintJob(jobData) {
  const {
    userId,
    documentName,
    documentPath,
    paperType = 'Plain Paper',
    printQuality = 600,
    colorMode = 'Grayscale',
    paperSize = 'A4',
    status = 'pending'
  } = jobData;

  return run(
    `INSERT INTO PrintJob (userId, documentName, documentPath, paperType, printQuality, colorMode, paperSize, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, documentName, documentPath, paperType, printQuality, colorMode, paperSize, status]
  );
}

/**
 * Get print jobs for a user
 * @param {number} userId
 * @returns {Promise<Array>}
 */
function getPrintJobs(userId) {
  return query(
    'SELECT * FROM PrintJob WHERE userId = ? ORDER BY submittedAt DESC',
    [userId]
  );
}

/**
 * Get a specific print job
 * @param {number} jobId
 * @returns {Promise<any>}
 */
function getPrintJob(jobId) {
  return queryOne('SELECT * FROM PrintJob WHERE id = ?', [jobId]);
}

/**
 * Update print job status
 * @param {number} jobId
 * @param {string} status
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function updatePrintJobStatus(jobId, status) {
  return run(
    'UPDATE PrintJob SET status = ? WHERE id = ?',
    [status, jobId]
  );
}

/**
 * Update print job completion
 * @param {number} jobId
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function completePrintJob(jobId) {
  return run(
    'UPDATE PrintJob SET status = ?, completedAt = CURRENT_TIMESTAMP WHERE id = ?',
    ['completed', jobId]
  );
}

/**
 * Close database connection
 * @returns {Promise<void>}
 */
async function closeDatabase() {
  if (!pool) {
    return;
  }
  await pool.end();
  pool = null;
}

/**
 * Get all users (admin only)
 * @returns {Promise<Array>}
 */
function getAllUsers() {
  return query('SELECT id, username, role, enabled, createdAt FROM User ORDER BY createdAt DESC');
}

/**
 * Delete a user by ID (admin only)
 * @param {number} userId
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function deleteUser(userId) {
  return run('DELETE FROM User WHERE id = ?', [userId]);
}

/**
 * Update user role (admin only)
 * @param {number} userId
 * @param {string} role - USER or ADMIN
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function updateUserRole(userId, role) {
  return run('UPDATE User SET role = ? WHERE id = ?', [role, userId]);
}

/**
 * Update user password (admin only)
 * @param {number} userId
 * @param {string} passwordHash
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function updateUserPassword(userId, passwordHash) {
  return run('UPDATE User SET passwordHash = ? WHERE id = ?', [passwordHash, userId]);
}

/**
 * Get all print jobs (admin only)
 * @returns {Promise<Array>}
 */
function getAllPrintJobs() {
  return query(
    `SELECT pj.*, u.username FROM PrintJob pj 
     JOIN User u ON pj.userId = u.id 
     ORDER BY pj.submittedAt DESC`
  );
}

/**
 * Delete a print job by ID (admin only)
 * @param {number} jobId
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function deletePrintJob(jobId) {
  return run('DELETE FROM PrintJob WHERE id = ?', [jobId]);
}

/**
 * Update user enabled status (admin only)
 * @param {number} userId
 * @param {boolean} enabled
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function updateUserEnabled(userId, enabled) {
  return run('UPDATE User SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, userId]);
}

/**
 * Get system setting
 * @param {string} key
 * @returns {Promise<any>}
 */
function getSetting(key) {
  return queryOne('SELECT value FROM Settings WHERE `key` = ?', [key]);
}

/**
 * Set system setting
 * @param {string} key
 * @param {string} value
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function setSetting(key, value) {
  return run(
    'REPLACE INTO Settings (`key`, value, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
    [key, value]
  );
}

/**
 * Insert a scan job
 * @param {number} userId
 * @param {string} fileName
 * @param {string} filePath
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function insertScanJob(userId, fileName, filePath) {
  return run(
    'INSERT INTO ScanJob (userId, fileName, filePath) VALUES (?, ?, ?)',
    [userId, fileName, filePath]
  );
}

/**
 * Get scan jobs for a user
 * @param {number} userId
 * @returns {Promise<Array>}
 */
function getScanJobs(userId) {
  return query(
    'SELECT * FROM ScanJob WHERE userId = ? ORDER BY createdAt DESC',
    [userId]
  );
}

/**
 * Get all scan jobs (admin only)
 * @returns {Promise<Array>}
 */
function getAllScanJobs() {
  return query(
    `SELECT sj.*, u.username FROM ScanJob sj
     JOIN User u ON sj.userId = u.id
     ORDER BY sj.createdAt DESC`
  );
}

/**
 * Delete a scan job
 * @param {number} id
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function deleteScanJob(id) {
  return run('DELETE FROM ScanJob WHERE id = ?', [id]);
}

/**
 * Get a specific scan job
 * @param {number} id
 * @returns {Promise<any>}
 */
function getScanJob(id) {
  return queryOne('SELECT * FROM ScanJob WHERE id = ?', [id]);
}

module.exports = {
  initializeDatabase,
  query,
  queryOne,
  run,
  getUserByUsername,
  getUserById,
  createUser,
  insertPrintJob,
  getPrintJobs,
  getPrintJob,
  updatePrintJobStatus,
  completePrintJob,
  closeDatabase,
  getAllUsers,
  deleteUser,
  updateUserRole,
  updateUserPassword,
  getAllPrintJobs,
  deletePrintJob,
  updateUserEnabled,
  getSetting,
  setSetting,
  insertScanJob,
  getScanJobs,
  getAllScanJobs,
  deleteScanJob,
  getScanJob,
  get db() {
    return pool;
  }
};
