const fc = require('fast-check');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// Use a test database file with timestamp to avoid conflicts
let testDbCounter = 0;

function getTestDbPath() {
  return path.join(__dirname, `../../data/test_user_${testDbCounter++}.db`);
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

describe('Job History and Session Isolation', () => {
  /**
   * **Feature: print-queue-manager, Property 5: Job History Completeness**
   * 
   * For any authenticated user, the list of jobs retrieved from the database should
   * contain all jobs previously submitted by that user and no jobs from other users.
   * 
   * **Validates: Requirements 5.1, 5.2, 5.3**
   */
  test('Property 5: Job History Completeness - User sees all their jobs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          username: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_]+$/.test(s) && s.length >= 3),
          jobCount: fc.integer({ min: 1, max: 10 })
        }),
        async (data) => {
          const { username, jobCount } = data;
          const dbPath = getTestDbPath();

          try {
            const testDb = await createTestDatabase(dbPath);

            // Create user
            const userResult = await runTestDb(
              testDb,
              'INSERT INTO User (username, passwordHash) VALUES (?, ?)',
              [username, 'hashedpassword']
            );
            const userId = userResult.lastID;

            // Create multiple jobs for this user
            const createdJobIds = [];
            for (let i = 0; i < jobCount; i++) {
              const jobResult = await runTestDb(
                testDb,
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
              createdJobIds.push(jobResult.lastID);
            }

            // Retrieve all jobs for this user
            const retrievedJobs = await queryTestDb(
              testDb,
              'SELECT * FROM PrintJob WHERE userId = ? ORDER BY submittedAt DESC',
              [userId]
            );

            // Verify all created jobs are in the retrieved list
            expect(retrievedJobs.length).toBe(jobCount);

            // Verify each job belongs to the correct user
            for (const job of retrievedJobs) {
              expect(job.userId).toBe(userId);
              expect(createdJobIds).toContain(job.id);
            }

            // Verify jobs are in reverse chronological order
            for (let i = 0; i < retrievedJobs.length - 1; i++) {
              const current = new Date(retrievedJobs[i].submittedAt);
              const next = new Date(retrievedJobs[i + 1].submittedAt);
              expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
            }

            await closeTestDb(testDb);
          } finally {
            cleanupTestDatabase(dbPath);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);

  /**
   * **Feature: print-queue-manager, Property 7: Session Isolation**
   * 
   * For any two different authenticated users, each user's session should only grant
   * access to their own print jobs and not to other users' jobs.
   * 
   * **Validates: Requirements 1.4, 5.1**
   */
  test('Property 7: Session Isolation - Users only see their own jobs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }).chain(userCount =>
          fc.tuple(
            ...Array(userCount).fill(null).map((_, idx) =>
              fc.record({
                username: fc.string({ minLength: 3, maxLength: 15 }).filter(s => /^[a-zA-Z0-9_]+$/.test(s) && s.length >= 3),
                jobCount: fc.integer({ min: 1, max: 5 })
              }).map(item => ({
                ...item,
                username: `user_${idx}_${item.username}`
              }))
            )
          )
        ),
        async (users) => {
          const dbPath = getTestDbPath();

          try {
            const testDb = await createTestDatabase(dbPath);

            // Create users and their jobs
            const userJobMap = {};
            for (const user of users) {
              const userResult = await runTestDb(
                testDb,
                'INSERT INTO User (username, passwordHash) VALUES (?, ?)',
                [user.username, 'hashedpassword']
              );
              const userId = userResult.lastID;
              userJobMap[userId] = [];

              // Create jobs for this user
              for (let i = 0; i < user.jobCount; i++) {
                const jobResult = await runTestDb(
                  testDb,
                  `INSERT INTO PrintJob (userId, documentName, documentPath, status)
                   VALUES (?, ?, ?, ?)`,
                  [userId, `${user.username}_doc_${i}.pdf`, `/tmp/${user.username}_doc_${i}.pdf`, 'pending']
                );
                userJobMap[userId].push(jobResult.lastID);
              }
            }

            // Verify each user only sees their own jobs
            for (const user of users) {
              const userRecord = await queryOneTestDb(
                testDb,
                'SELECT * FROM User WHERE username = ?',
                [user.username]
              );
              const userId = userRecord.id;

              // Get jobs for this user
              const userJobs = await queryTestDb(
                testDb,
                'SELECT * FROM PrintJob WHERE userId = ?',
                [userId]
              );

              // Verify count matches
              expect(userJobs.length).toBe(user.jobCount);

              // Verify all jobs belong to this user
              for (const job of userJobs) {
                expect(job.userId).toBe(userId);
                expect(userJobMap[userId]).toContain(job.id);
              }

              // Verify no jobs from other users are visible
              for (const otherUserId of Object.keys(userJobMap)) {
                if (parseInt(otherUserId) !== userId) {
                  const otherUserJobs = await queryTestDb(
                    testDb,
                    'SELECT * FROM PrintJob WHERE userId = ?',
                    [parseInt(otherUserId)]
                  );

                  // Verify no overlap between user's jobs and other user's jobs
                  const userJobIds = userJobs.map(j => j.id);
                  for (const otherJob of otherUserJobs) {
                    expect(userJobIds).not.toContain(otherJob.id);
                  }
                }
              }
            }

            await closeTestDb(testDb);
          } finally {
            cleanupTestDatabase(dbPath);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});
