const bcrypt = require('bcryptjs');
const db = require('./database');

/**
 * User Privileges Enum
 */
const USER_ROLE = {
  USER: 'USER',
  ADMIN: 'ADMIN'
};

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
 * @param {string} role - User role (USER or ADMIN)
 * @returns {Promise<{id: number, username: string, role: string}>}
 */
async function createUser(username, password, role = USER_ROLE.USER) {
  // Check if user already exists
  const existingUser = await db.getUserByUsername(username);
  if (existingUser) {
    throw new Error('Username already exists');
  }

  // Validate role
  if (!Object.values(USER_ROLE).includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user in database
  const result = await db.createUser(username, passwordHash, role);
  return {
    id: result.lastID,
    username,
    role
  };
}

/**
 * Authenticate user with username and password
 * @param {string} username - Username
 * @param {string} password - Plain text password
 * @returns {Promise<{id: number, username: string, role: string}|null>} - User object if authenticated, null otherwise
 */
async function authenticateUser(username, password) {
  const user = await db.getUserByUsername(username);
  
  if (!user) {
    return null;
  }

  // Check if user is enabled
  if (!user.enabled) {
    return null;
  }

  const isPasswordValid = await comparePassword(password, user.passwordHash);
  
  if (!isPasswordValid) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role || USER_ROLE.USER
  };
}

/**
 * Get user by ID
 * @param {number} userId - User ID
 * @returns {Promise<{id: number, username: string, role: string}|null>}
 */
async function getUserById(userId) {
  const user = await db.getUserById(userId);
  
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role || USER_ROLE.USER
  };
}

/**
 * Check if user is admin
 * @param {number} userId - User ID
 * @returns {Promise<boolean>}
 */
async function isAdmin(userId) {
  const user = await getUserById(userId);
  return user && user.role === USER_ROLE.ADMIN;
}

/**
 * Get all users (admin only)
 * @returns {Promise<Array>}
 */
async function getAllUsers() {
  return db.getAllUsers();
}

/**
 * Delete a user (admin only)
 * @param {number} userId
 * @returns {Promise<{lastID: number, changes: number}>}
 */
async function deleteUser(userId) {
  return db.deleteUser(userId);
}

/**
 * Update user role (admin only)
 * @param {number} userId
 * @param {string} role
 * @returns {Promise<{lastID: number, changes: number}>}
 */
async function updateUserRole(userId, role) {
  if (!Object.values(USER_ROLE).includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }
  return db.updateUserRole(userId, role);
}

/**
 * Reset user password (admin only)
 * @param {number} userId
 * @param {string} newPassword
 * @returns {Promise<{lastID: number, changes: number}>}
 */
async function resetUserPassword(userId, newPassword) {
  const passwordHash = await hashPassword(newPassword);
  return db.updateUserPassword(userId, passwordHash);
}

/**
 * Enable or disable a user (admin only)
 * @param {number} userId
 * @param {boolean} enabled
 * @returns {Promise<{lastID: number, changes: number}>}
 */
async function setUserEnabled(userId, enabled) {
  return db.updateUserEnabled(userId, enabled);
}

/**
 * Check if user registration is enabled
 * @returns {Promise<boolean>}
 */
async function isRegistrationEnabled() {
  const setting = await db.getSetting('registration_enabled');
  return setting ? setting.value === 'true' : true; // Default to true
}

/**
 * Set registration enabled/disabled (admin only)
 * @param {boolean} enabled
 * @returns {Promise<{lastID: number, changes: number}>}
 */
async function setRegistrationEnabled(enabled) {
  return db.setSetting('registration_enabled', enabled ? 'true' : 'false');
}

module.exports = {
  USER_ROLE,
  hashPassword,
  comparePassword,
  createUser,
  authenticateUser,
  getUserById,
  isAdmin,
  getAllUsers,
  deleteUser,
  updateUserRole,
  resetUserPassword,
  setUserEnabled,
  isRegistrationEnabled,
  setRegistrationEnabled
};
