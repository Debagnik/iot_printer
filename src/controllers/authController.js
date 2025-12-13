const User = require('../models/user');

/**
 * Display login page
 */
async function getLogin(req, res) {
  const success = req.query.success || null;
  res.render('login', { error: null, success });
}

/**
 * Display registration page
 */
async function getRegister(req, res) {
  res.render('register', { error: null });
}

/**
 * Handle login form submission
 */
async function postLogin(req, res) {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.render('login', { error: 'Username and password are required' });
    }

    // Authenticate user
    const user = await User.authenticateUser(username, password);

    if (!user) {
      return res.render('login', { error: 'Invalid username or password' });
    }

    // Create session
    req.session.userId = user.id;
    req.session.username = user.username;

    res.redirect('/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { error: 'An error occurred during login' });
  }
}

/**
 * Handle user registration
 */
async function postRegister(req, res) {
  try {
    const { username, password, confirmPassword } = req.body;

    // Validate input
    if (!username || !password || !confirmPassword) {
      return res.render('register', { error: 'All fields are required' });
    }

    // Validate password match
    if (password !== confirmPassword) {
      return res.render('register', { error: 'Passwords do not match' });
    }

    // Validate password length
    if (password.length < 6) {
      return res.render('register', { error: 'Password must be at least 6 characters' });
    }

    // Validate username length
    if (username.length < 3) {
      return res.render('register', { error: 'Username must be at least 3 characters' });
    }

    // Create new user
    try {
      await User.createUser(username, password);
    } catch (err) {
      if (err.message.includes('already exists')) {
        return res.render('register', { error: 'Username already exists' });
      }
      throw err;
    }

    // Redirect to login with success message
    res.redirect('/login?success=Registration%20successful!%20Please%20log%20in.');
  } catch (err) {
    console.error('Registration error:', err);
    res.render('register', { error: 'An error occurred during registration' });
  }
}

/**
 * Handle logout
 */
async function logout(req, res) {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).render('error', { error: 'Failed to logout' });
    }
    res.redirect('/login');
  });
}

module.exports = {
  getLogin,
  postLogin,
  getRegister,
  postRegister,
  logout
};
