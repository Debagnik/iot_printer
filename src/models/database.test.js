const fc = require('fast-check');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// Use a test database file with timestamp to avoid conflicts
let testDbCounter = 0;

function getTestDbPath() {
  return path.join(__dirname, `../../data/test_print_queue_${testDbCounter++}.db`);
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

describe('Database Persistence', () => {
  /**
   * **Feature: print-queue-manager, Property 8: Database Persistence Round Trip**
   * 
   * For any user account created and stored in the database, after application restart,
   * the user should be able to log in with the same credentials and retrieve all previously
   * submitted print jobs.
   * 
   * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
   */
  test('Property 8: Database Persistence Round Trip - User and Jobs survive restart', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          username: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_]+$/.test(s) && s.length >= 3),
          passwordHash: fc.string({ minLength: 10, maxLength: 100 }),
          jobCount: fc.integer({ min: 1, max: 5 })
        }),
        async (data) => {
          const { username, passwordHash, jobCount } = data;
          const dbPath = getTestDbPath();

          try {
            // Phase 1: Create user and jobs, then close database
            let db1 = await createTestDatabase(dbPath);
            
            // Insert user
            const userResult = await runTestDb(
              db1,
              'INSERT INTO User (username, passwordHash) VALUES (?, ?)',
              [username, passwordHash]
            );
            const userId = userResult.lastID;

            // Insert multiple jobs
            for (let i = 0; i < jobCount; i++) {
              await runTestDb(
                db1,
                `INSERT INTO PrintJob (userId, documentName, documentPath, paperType, printQuality, colorMode, paperSize, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  userId,
                  `document_${i}.pdf`,
                  `/tmp/document_${i}.pdf`,
                  'Plain Paper',
                  'Normal',
                  'Grayscale',
                  'A4',
                  'pending'
                ]
              );
            }

            await closeTestDb(db1);

            // Phase 2: Simulate restart - open new database connection
            let db2 = await createTestDatabase(dbPath);

            // Verify user still exists with same credentials
            const retrievedUser = await queryOneTestDb(
              db2,
              'SELECT * FROM User WHERE username = ? AND passwordHash = ?',
              [username, passwordHash]
            );

            expect(retrievedUser).not.toBeNull();
            expect(retrievedUser.username).toBe(username);
            expect(retrievedUser.passwordHash).toBe(passwordHash);

            // Verify all jobs still exist for this user
            const retrievedJobs = await queryTestDb(
              db2,
              'SELECT * FROM PrintJob WHERE userId = ? ORDER BY id',
              [userId]
            );

            expect(retrievedJobs.length).toBe(jobCount);

            // Verify each job has correct data
            for (let i = 0; i < jobCount; i++) {
              expect(retrievedJobs[i].documentName).toBe(`document_${i}.pdf`);
              expect(retrievedJobs[i].documentPath).toBe(`/tmp/document_${i}.pdf`);
              expect(retrievedJobs[i].paperType).toBe('Plain Paper');
              expect(retrievedJobs[i].printQuality).toBe('Normal');
              expect(retrievedJobs[i].colorMode).toBe('Grayscale');
              expect(retrievedJobs[i].paperSize).toBe('A4');
              expect(retrievedJobs[i].status).toBe('pending');
            }

            await closeTestDb(db2);
          } finally {
            cleanupTestDatabase(dbPath);
          }
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  /**
   * **Feature: print-queue-manager, Property 8: Database Persistence Round Trip**
   * 
   * Validates that multiple users' data is isolated and persists correctly.
   * 
   * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
   */
  test('Property 8: Database Persistence Round Trip - Multiple users isolated', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }).chain(count =>
          fc.tuple(
            ...Array(count).fill(null).map((_, idx) =>
              fc.record({
                username: fc.string({ minLength: 3, maxLength: 15 }).filter(s => /^[a-zA-Z0-9_]+$/.test(s) && s.length >= 3),
                passwordHash: fc.string({ minLength: 10, maxLength: 100 })
              }).map(item => ({
                ...item,
                username: `${item.username}_${idx}`
              }))
            )
          )
        ),
        async (users) => {
          const dbPath = getTestDbPath();

          try {
            // Phase 1: Create multiple users with jobs
            let db1 = await createTestDatabase(dbPath);

            const userMap = {};
            for (const user of users) {
              const result = await runTestDb(
                db1,
                'INSERT INTO User (username, passwordHash) VALUES (?, ?)',
                [user.username, user.passwordHash]
              );
              userMap[user.username] = result.lastID;

              // Add a job for this user
              await runTestDb(
                db1,
                `INSERT INTO PrintJob (userId, documentName, documentPath, status)
                 VALUES (?, ?, ?, ?)`,
                [result.lastID, `${user.username}_doc.pdf`, `/tmp/${user.username}_doc.pdf`, 'pending']
              );
            }

            await closeTestDb(db1);

            // Phase 2: Verify after restart
            let db2 = await createTestDatabase(dbPath);

            for (const user of users) {
              const retrievedUser = await queryOneTestDb(
                db2,
                'SELECT * FROM User WHERE username = ?',
                [user.username]
              );

              expect(retrievedUser).not.toBeNull();
              expect(retrievedUser.passwordHash).toBe(user.passwordHash);

              // Verify this user only sees their own jobs
              const userJobs = await queryTestDb(
                db2,
                'SELECT * FROM PrintJob WHERE userId = ?',
                [retrievedUser.id]
              );

              expect(userJobs.length).toBe(1);
              expect(userJobs[0].documentName).toBe(`${user.username}_doc.pdf`);
            }

            await closeTestDb(db2);
          } finally {
            cleanupTestDatabase(dbPath);
          }
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});
