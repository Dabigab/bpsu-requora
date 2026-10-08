const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Errors } = require('./http');
const { findUserById } = require('./db');

const PLACEHOLDER_SECRETS = [
  'replace_this_with_a_long_random_secret_before_deploying',
  'change_this_secret_before_deploying',
  'dev_secret_change_me',
];

let cachedSecret = null;

/**
 * The JWT signing secret comes from the environment only — it is never
 * hardcoded. In production a missing/placeholder secret stops the server.
 * In development a random one is generated for this run (sessions then
 * reset on restart) and a warning explains how to make it permanent.
 */
function getSecret() {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.JWT_SECRET;
  const missing = !fromEnv || PLACEHOLDER_SECRETS.includes(fromEnv);

  if (missing) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is not set (or is still the placeholder). Set a long random value before running in production.');
    }
    cachedSecret = crypto.randomBytes(48).toString('hex');
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[ReQuora] JWT_SECRET is not set in .env — using a temporary secret. ' +
          'Everyone will be logged out whenever the server restarts. ' +
          'Set JWT_SECRET in backend/.env to fix this.'
      );
    }
  } else {
    if (fromEnv.length < 16 && process.env.NODE_ENV !== 'test') {
      console.warn('[ReQuora] JWT_SECRET is short. Use at least 32 random characters.');
    }
    cachedSecret = fromEnv;
  }
  return cachedSecret;
}

// Called at startup so a bad production config fails immediately and loudly.
function assertAuthConfig() {
  getSecret();
}

function expiresIn() {
  return process.env.JWT_EXPIRES_IN || '7d';
}

function generateToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, getSecret(), {
    algorithm: 'HS256',
    expiresIn: expiresIn(),
  });
}

// The only user fields that ever leave the server.
function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    studentId: user.studentId || null,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function readBearer(req) {
  const header = req.headers['authorization'] || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

// Verifies the token and loads the CURRENT user record, so a deleted account
// or a changed role takes effect immediately instead of when the token expires.
function resolveUser(token) {
  const payload = jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
  const user = findUserById(payload.sub);
  if (!user) {
    const err = new Error('user not found');
    err.name = 'UnknownUserError';
    throw err;
  }
  return user;
}

// Requires a valid token. Attaches the current user to req.user.
function authenticateToken(req, res, next) {
  const token = readBearer(req);
  if (!token) return next(Errors.unauthorized('Please log in to continue.'));

  try {
    req.user = publicUser(resolveUser(token));
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(Errors.unauthorized('Your session has expired. Please log in again.', 'TOKEN_EXPIRED'));
    }
    return next(Errors.unauthorized('Your session is not valid. Please log in again.', 'INVALID_TOKEN'));
  }
}

// Attaches req.user when a valid token is present, otherwise carries on as a
// guest. Used by public pages that show extra detail to the right people.
function optionalAuth(req, res, next) {
  const token = readBearer(req);
  if (token) {
    try {
      req.user = publicUser(resolveUser(token));
    } catch (err) {
      req.user = undefined;
    }
  }
  next();
}

// Only lets the request through if the user is an admin.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(Errors.forbidden('Administrator access is required.'));
  }
  return next();
}

module.exports = {
  generateToken,
  authenticateToken,
  optionalAuth,
  requireAdmin,
  publicUser,
  assertAuthConfig,
};
