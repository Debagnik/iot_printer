const os = require('os');
const db = require('../models/database');
const { version } = require('../../package.json');

/**
 * Check database connectivity and measure query latency.
 * @returns {Promise<{status: string, latencyMs?: number, error?: string}>}
 */
async function checkDatabase() {
  const pool = db.db;
  if (!pool) {
    return { status: 'down', error: 'Database pool not initialized' };
  }

  const start = Date.now();
  try {
    await pool.execute('SELECT 1');
    return {
      status: 'up',
      latencyMs: Date.now() - start
    };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      error: err.message
    };
  }
}

/**
 * GET /healthz
 * Returns detailed server health and status as JSON.
 */
async function getHealthz(req, res) {
  const dbCheck = await checkDatabase();
  const isHealthy = dbCheck.status === 'up';
  const mem = process.memoryUsage();

  const payload = {
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    version,
    environment: process.env.NODE_ENV || 'development',
    system: {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      hostname: os.hostname(),
      loadavg: os.loadavg(),
      memory: {
        processRssBytes: mem.rss,
        processHeapUsedBytes: mem.heapUsed,
        processHeapTotalBytes: mem.heapTotal,
        systemTotalBytes: os.totalmem(),
        systemFreeBytes: os.freemem()
      }
    },
    checks: {
      database: dbCheck
    }
  };

  res.status(isHealthy ? 200 : 503).json(payload);
}

module.exports = {
  getHealthz,
  checkDatabase
};
