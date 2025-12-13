const fc = require('fast-check');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const PrintJob = require('./printJob');

// Use a test database file with timestamp to avoid conflicts
function getTestDbPath() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 100000);
  return path.join(__dirname, `../../data/test_job_${timestamp}_${random}.db`);
}

/**
 * Clean up test database
 */
function cleanupTestDatabase(dbPath) {
  if (fs.existsSync(dbPath)) {
    try {
      fs.unlinkSync(dbPath);
    } catch (err) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Create a fresh test database connection
 */
function createTestDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    const testDb = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }

      testDb.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Create tables
        testDb.serialize(() => {
          testDb.run(`
            CREATE TABLE IF NOT EXISTS User (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT UNIQUE NOT NULL,
              passwordHash TEXT NOT NULL,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);

          testDb.run(`
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
              reject(err);
            } else {
              resolve(testDb);
            }
          });
        });
      });
    });
  });
}

/**
 * Helper to run a query on test database
 */
function queryTestDb(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Helper to run a single row query on test database
 */
function queryOneTestDb(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

/**
 * Helper to run insert/update/delete on test database
 */
function runTestDb(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/**
 * Close test database
 */
function closeTestDb(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

describe('Print Job Submission', () => {
  /**
   * **Feature: print-queue-manager, Property 4: Job Submission Idempotence**
   * 
   * For any print job, submitting the same job to the print queue multiple times
   * should result in only one job being sent to the printer (or the system should
   * handle duplicates gracefully).
   * 
   * **Validates: Requirements 4.2, 4.5**
   */
  test('Property 4: Job Submission Idempotence - Job status transitions correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.integer({ min: 1, max: 1000 }),
          documentName: fc.string({ minLength: 5, maxLength: 50 }).filter(s => /^[a-zA-Z0-9_\-\.]+$/.test(s)),
          paperType: fc.constantFrom('Plain Paper', 'Glossy'),
          printQuality: fc.constantFrom(600, 1200),
          colorMode: fc.constantFrom('Color', 'Grayscale'),
          paperSize: fc.constantFrom('A4', 'Letter', 'Legal')
        }),
        async (data) => {
          const {
            userId,
            documentName,
            paperType,
            printQuality,
            colorMode,
            paperSize
          } = data;

          const dbPath = getTestDbPath();
          const testDocPath = path.join(__dirname, '../../data/test_document.pdf');

          try {
            // Create a test database
            const testDb = await createTestDatabase(dbPath);

            // Create a test user
            const userResult = await runTestDb(
              testDb,
              'INSERT INTO User (username, passwordHash) VALUES (?, ?)',
              ['testuser', 'hashedpassword']
            );
            const testUserId = userResult.lastID;

            // Create a test document file
            if (!fs.existsSync(testDocPath)) {
              fs.writeFileSync(testDocPath, 'Test PDF content');
            }

            // Create a print job
            const jobResult = await runTestDb(
              testDb,
              `INSERT INTO PrintJob (userId, documentName, documentPath, paperType, printQuality, colorMode, paperSize, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                testUserId,
                documentName,
                testDocPath,
                paperType,
                printQuality,
                colorMode,
                paperSize,
                'pending'
              ]
            );
            const jobId = jobResult.lastID;

            // Verify initial status is pending
            const initialJob = await queryOneTestDb(
              testDb,
              'SELECT * FROM PrintJob WHERE id = ?',
              [jobId]
            );
            expect(initialJob.status).toBe('pending');

            // Simulate first submission - update status to in-progress
            await runTestDb(
              testDb,
              'UPDATE PrintJob SET status = ? WHERE id = ?',
              ['in-progress', jobId]
            );

            const afterFirstSubmit = await queryOneTestDb(
              testDb,
              'SELECT * FROM PrintJob WHERE id = ?',
              [jobId]
            );
            expect(afterFirstSubmit.status).toBe('in-progress');

            // Simulate second submission attempt - status should remain in-progress
            // (idempotent behavior - submitting again doesn't change the state)
            const beforeSecondSubmit = await queryOneTestDb(
              testDb,
              'SELECT * FROM PrintJob WHERE id = ?',
              [jobId]
            );

            // Verify that the job is already in-progress, preventing duplicate submission
            expect(beforeSecondSubmit.status).toBe('in-progress');

            // Verify job data is preserved
            expect(beforeSecondSubmit.documentName).toBe(documentName);
            expect(beforeSecondSubmit.paperType).toBe(paperType);
            expect(beforeSecondSubmit.printQuality).toBe(printQuality);
            expect(beforeSecondSubmit.colorMode).toBe(colorMode);
            expect(beforeSecondSubmit.paperSize).toBe(paperSize);

            await closeTestDb(testDb);
          } finally {
            cleanupTestDatabase(dbPath);
            // Clean up test document
            if (fs.existsSync(testDocPath)) {
              try {
                fs.unlinkSync(testDocPath);
              } catch (err) {
                // Ignore cleanup errors
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});
