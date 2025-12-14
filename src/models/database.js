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
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          reject(new Error(`Failed to create User table: ${err.message}`));
          return;
        }
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

    db.run(sql, params, function(err) {
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
 * @returns {Promise<{lastID: number, changes: number}>}
 */
function createUser(username, passwordHash) {
  return run(
    'INSERT INTO User (username, passwordHash) VALUES (?, ?)',
    [username, passwordHash]
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
  get db() {
    return db;
  }
};
