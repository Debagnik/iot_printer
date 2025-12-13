const bcrypt = require('bcryptjs');
const db = require('./database');

/**
 * User model for authentication and user management
 */

/**
 * Hash a password using bcryptjs
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare a plain text password with a hash
 * @param {string} password - Plain text password
 * @param {string} hash - Password hash
 * @returns {Promise<boolean>} - True if password matches hash
 */
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Create a new user with username and password
 * @param {string} username - Username
 * @param {string} password - Plain text password
 * @returns {Promise<{id: number, username: string}>}
 */
async function createUser(username, password) {
  // Check if user already exists
  const existingUser = await db.getUserByUsername(username);
  if (existingUser) {
    throw new Error('Username already exists');
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user in database
  const result = await db.createUser(username, passwordHash);
  return {
    id: result.lastID,
    username
  };
}

/**
 * Authenticate user with username and password
 * @param {string} username - Username
 * @param {string} password - Plain text password
 * @returns {Promise<{id: number, username: string}|null>} - User object if authenticated, null otherwise
 */
async function authenticateUser(username, password) {
  const user = await db.getUserByUsername(username);
  
  if (!user) {
    return null;
  }

  const isPasswordValid = await comparePassword(password, user.passwordHash);
  
  if (!isPasswordValid) {
    return null;
  }

  return {
    id: user.id,
    username: user.username
  };
}

/**
 * Get user by ID
 * @param {number} userId - User ID
 * @returns {Promise<{id: number, username: string}|null>}
 */
async function getUserById(userId) {
  const user = await db.getUserById(userId);
  
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username
  };
}

module.exports = {
  hashPassword,
  comparePassword,
  createUser,
  authenticateUser,
  getUserById
};
