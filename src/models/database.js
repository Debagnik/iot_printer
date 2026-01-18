const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const DB_PATH = path.join(__dirname, '../../data/print_queue.db');

// Create a single database connection with connection pooling
let db = null;

/**
 * Initialize database connection and create tables if they don't exist
 * @returns {Promise<sqlite3.Database>}
 */
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(new Error(`Failed to connect to database: ${err.message}`));
        return;
      }

      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          reject(new Error(`Failed to enable foreign keys: ${err.message}`));
          return;
        }

        createTables()
          .then(() => resolve(db))
          .catch(reject);
      });
    });
  });
}

/**
 * Create all required tables
 * @returns {Promise<void>}
 */
function createTables() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // User table
      db.run(`
        CREATE TABLE IF NOT EXISTS User (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          passwordHash TEXT NOT NULL,
          role TEXT DEFAULT 'USER',
          enabled INTEGER DEFAULT 1,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          reject(new Error(`Failed to create User table: ${err.message}`));
          return;
        }

        // Migrate existing User table to add missing columns
        db.all("PRAGMA table_info(User)", (err, columns) => {
          if (err) {
            console.warn('Could not check User table schema:', err.message);
            return;
          }

          const columnNames = columns.map(col => col.name);

          // Add role column if it doesn't exist
          if (!columnNames.includes('role')) {
            db.run(`ALTER TABLE User ADD COLUMN role TEXT DEFAULT 'USER'`, (err) => {
              if (err && !err.message.includes('duplicate column')) {
                console.warn('Could not add role column:', err.message);
              }
            });
          }

          // Add enabled column if it doesn't exist
          if (!columnNames.includes('enabled')) {
            db.run(`ALTER TABLE User ADD COLUMN enabled INTEGER DEFAULT 1`, (err) => {
              if (err && !err.message.includes('duplicate column')) {
                console.warn('Could not add enabled column:', err.message);
              }
            });
          }
        });
      });

      // PrintJob table
      db.run(`
        CREATE TABLE IF NOT EXISTS PrintJob (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL,
          documentName TEXT NOT NULL,
          documentPath TEXT NOT NULL,
          paperType TEXT DEFAULT 'Plain Paper',
          printQuality INTEGER DEFAULT 600,
          colorMode TEXT DEFAULT 'Grayscale',
          paperSize TEXT DEFAULT 'A4',
          status TEXT DEFAULT 'pending',
          submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          completedAt DATETIME,
          FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) {
          reject(new Error(`Failed to create PrintJob table: ${err.message}`));
          return;
        }
      });

      // Session table
      db.run(`
        CREATE TABLE IF NOT EXISTS Session (
          sessionId TEXT PRIMARY KEY,
          userId INTEGER NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          expiresAt DATETIME,
          FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) {
          reject(new Error(`Failed to create Session table: ${err.message}`));
          return;
        }
      });

      // ScanJob table
      db.run(`
        CREATE TABLE IF NOT EXISTS ScanJob (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL,
          fileName TEXT NOT NULL,
          filePath TEXT NOT NULL,
          status TEXT DEFAULT 'completed',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) {
          reject(new Error(`Failed to create ScanJob table: ${err.message}`));
          return;
        }
      });

      // Settings table for system-wide configuration
      db.run(`
        CREATE TABLE IF NOT EXISTS Settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          reject(new Error(`Failed to create Settings table: ${err.message}`));
          return;
        }
        resolve();
      });
    });
  });
}

/**
 * Execute a query with parameters
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<any>}
 */
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(new Error(`Query failed: ${err.message}`));
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Execute a query that returns a single row
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<any>}
 */
function queryOne(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.get(sql, params, (err, row) => {
      if (err) {
        reject(new Error(`Query failed: ${err.message}`));
      } else {
        resolve(row || null);
      }
    });
  });
}

/**
 * Execute a query that modifies data (INSERT, UPDATE, DELETE)
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.run(sql, params, function (err) {
      if (err) {
        reject(new Error(`Query failed: ${err.message}`));
      } else {
        resolve({
          lastID: this.lastID,
          changes: this.changes
        });
      }
    });
  });
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
function closeDatabase() {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve();
      return;
    }

    db.close((err) => {
      if (err) {
        reject(new Error(`Failed to close database: ${err.message}`));
      } else {
        db = null;
        resolve();
      }
    });
  });
}

/**
 * Get all users (admin only)
 * @returns {Promise<Array>}
 */
function getAllUsers() {
  return query('SELECT id, username, role, createdAt FROM User ORDER BY createdAt DESC');
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
  return queryOne('SELECT value FROM Settings WHERE key = ?', [key]);
}

/**
 * Set system setting
 * @param {string} key
 * @param {string} value
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function setSetting(key, value) {
  return run(
    'INSERT OR REPLACE INTO Settings (key, value, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
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
    return db;
  }
};
