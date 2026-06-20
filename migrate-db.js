const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// Dynamically load sqlite3
let sqlite3;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (e) {
  console.error('Error: "sqlite3" package is required to read the SQLite database.');
  console.error('Please temporarily install it: npm install sqlite3');
  process.exit(1);
}

require('dotenv').config();

const DB_PATH = path.join(__dirname, 'data/print_queue.db');

async function migrate() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`SQLite database file not found at: ${DB_PATH}`);
    process.exit(1);
  }

  console.log('Connecting to SQLite database...');
  const sqliteDb = new sqlite3.Database(DB_PATH);

  console.log('Connecting to MariaDB/MySQL database...');
  const mysqlConnection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'print_queue'
  });

  console.log('Connected successfully. Commencing migration...');

  // Helper to fetch all rows from SQLite
  const getSqliteRows = (query, params = []) => {
    return new Promise((resolve, reject) => {
      sqliteDb.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  };

  try {
    // Disable Foreign Key checks in MariaDB to allow data insertion in any order without integrity errors
    console.log('Temporarily disabling foreign key checks...');
    await mysqlConnection.query('SET FOREIGN_KEY_CHECKS = 0');

    // 1. Migrate User Table
    console.log('Migrating "User" table...');
    const users = await getSqliteRows('SELECT * FROM User');
    console.log(`Found ${users.length} users in SQLite.`);
    for (const user of users) {
      await mysqlConnection.execute(
        `INSERT INTO User (id, username, passwordHash, role, enabled, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE username=VALUES(username), passwordHash=VALUES(passwordHash), role=VALUES(role), enabled=VALUES(enabled)`,
        [
          user.id,
          user.username,
          user.passwordHash,
          user.role || 'USER',
          user.enabled !== undefined ? user.enabled : 1,
          user.createdAt ? new Date(user.createdAt) : new Date()
        ]
      );
    }

    // 2. Migrate Settings Table
    console.log('Migrating "Settings" table...');
    const settings = await getSqliteRows('SELECT * FROM Settings');
    console.log(`Found ${settings.length} settings entries in SQLite.`);
    for (const setting of settings) {
      await mysqlConnection.execute(
        `REPLACE INTO Settings (\`key\`, value, updatedAt)
         VALUES (?, ?, ?)`,
        [
          setting.key,
          setting.value,
          setting.updatedAt ? new Date(setting.updatedAt) : new Date()
        ]
      );
    }

    // 3. Migrate PrintJob Table
    console.log('Migrating "PrintJob" table...');
    const printJobs = await getSqliteRows('SELECT * FROM PrintJob');
    console.log(`Found ${printJobs.length} print jobs in SQLite.`);
    for (const job of printJobs) {
      await mysqlConnection.execute(
        `INSERT INTO PrintJob (id, userId, documentName, documentPath, paperType, printQuality, colorMode, paperSize, status, submittedAt, completedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status=VALUES(status), completedAt=VALUES(completedAt)`,
        [
          job.id,
          job.userId,
          job.documentName,
          job.documentPath,
          job.paperType || 'Plain Paper',
          String(job.printQuality || '600'),
          job.colorMode || 'Grayscale',
          job.paperSize || 'A4',
          job.status || 'pending',
          job.submittedAt ? new Date(job.submittedAt) : new Date(),
          job.completedAt ? new Date(job.completedAt) : null
        ]
      );
    }

    // 4. Migrate ScanJob Table
    console.log('Migrating "ScanJob" table...');
    const scanJobs = await getSqliteRows('SELECT * FROM ScanJob');
    console.log(`Found ${scanJobs.length} scan jobs in SQLite.`);
    for (const scan of scanJobs) {
      await mysqlConnection.execute(
        `INSERT INTO ScanJob (id, userId, fileName, filePath, status, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status=VALUES(status)`,
        [
          scan.id,
          scan.userId,
          scan.fileName,
          scan.filePath,
          scan.status || 'completed',
          scan.createdAt ? new Date(scan.createdAt) : new Date()
        ]
      );
    }

    // 5. Migrate Session Table
    console.log('Migrating "Session" table...');
    try {
      const sessions = await getSqliteRows('SELECT * FROM Session');
      console.log(`Found ${sessions.length} sessions in SQLite.`);
      for (const session of sessions) {
        await mysqlConnection.execute(
          `INSERT INTO Session (sessionId, userId, createdAt, expiresAt)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE expiresAt=VALUES(expiresAt)`,
          [
            session.sessionId,
            session.userId,
            session.createdAt ? new Date(session.createdAt) : new Date(),
            session.expiresAt ? new Date(session.expiresAt) : null
          ]
        );
      }
    } catch (e) {
      console.warn('Skipping session table migration:', e.message);
    }

    // Re-enable Foreign Key checks
    console.log('Re-enabling foreign key checks...');
    await mysqlConnection.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    // Close connections cleanly
    sqliteDb.close();
    await mysqlConnection.end();
  }
}

migrate();
