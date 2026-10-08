const express = require('express');
const bcrypt = require('bcryptjs');
const { findUserByEmail, findUserById, createUser, updateUser } = require('../utils/db');
const { generateToken, authenticateToken, publicUser } = require('../utils/auth');
const { Errors, ok, asyncHandler } = require('../utils/http');
const { SELF_REGISTER_ROLES, LIMITS } = require('../utils/constants');
const { textField, throwIfInvalid, isEmail, clean, asString } = require('../utils/validate');
const { createRateLimiter } = require('../utils/rateLimit');

const router = express.Router();

// Slows down password guessing and bulk sign-ups from one address.
const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30 });

// Compared against when an email is unknown so "no such user" and "wrong
// password" take the same time (prevents guessing which emails exist).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function checkPassword(fields, name, raw, label) {
  const value = asString(raw);
  if (!value) fields[name] = `${label} is required.`;
  else if (value.length < LIMITS.password.min) fields[name] = `${label} must be at least ${LIMITS.password.min} characters.`;
  else if (value.length > LIMITS.password.max) fields[name] = `${label} must be ${LIMITS.password.max} characters or fewer.`;
  else if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) fields[name] = `${label} must include at least one letter and one number.`;
  return value;
}

// POST /api/auth/register
router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const fields = {};
    const name = textField(fields, 'name', req.body.name, { label: 'Full name', ...LIMITS.name, required: true });
    const email = clean(asString(req.body.email)).toLowerCase();
    if (!email) fields.email = 'Email address is required.';
    else if (!isEmail(email) || email.length > LIMITS.email.max) fields.email = 'Please enter a valid email address.';
    const studentId = textField(fields, 'studentId', req.body.studentId, { label: 'Student / employee ID', max: LIMITS.studentId.max });
    const password = checkPassword(fields, 'password', req.body.password, 'Password');
    const requestedRole = clean(asString(req.body.role));
    throwIfInvalid(fields, 'Please check the highlighted fields.');

    if (findUserByEmail(email)) {
      throw Errors.conflict('An account with this email already exists. Try logging in instead.');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Only student / faculty / staff can self-register. Admin accounts are
    // created by the server (see ADMIN_EMAIL in .env) and never by this form.
    const role = SELF_REGISTER_ROLES.includes(requestedRole) ? requestedRole : 'student';

    const user = createUser({ name, email, studentId: studentId || null, passwordHash, role });
    return ok(res, { token: generateToken(user), user: publicUser(user) }, 'Account created. Welcome to ReQuora!', 201);
  })
);

// POST /api/auth/login
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const email = clean(asString(req.body.email)).toLowerCase();
    const password = asString(req.body.password);
    if (!email || !password) {
      throw Errors.validation('Email and password are required.', {
        ...(email ? {} : { email: 'Email address is required.' }),
        ...(password ? {} : { password: 'Password is required.' }),
      });
    }

    const user = findUserByEmail(email);
    const match = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !match) throw Errors.unauthorized('Invalid email or password.', 'INVALID_CREDENTIALS');

    return ok(res, { token: generateToken(user), user: publicUser(user) }, 'Logged in.');
  })
);

// GET /api/auth/me — who am I? (also lets the frontend confirm a stored token is still valid)
router.get('/me', authenticateToken, (req, res) => ok(res, { user: req.user }));

// PUT /api/auth/me — update my own profile
router.put(
  '/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const fields = {};
    const updates = {};
    if (req.body.name !== undefined) {
      updates.name = textField(fields, 'name', req.body.name, { label: 'Full name', ...LIMITS.name, required: true });
    }
    if (req.body.studentId !== undefined) {
      updates.studentId = textField(fields, 'studentId', req.body.studentId, { label: 'Student / employee ID', max: LIMITS.studentId.max }) || null;
    }
    throwIfInvalid(fields);
    if (!Object.keys(updates).length) throw Errors.validation('Nothing to update.');

    const updated = updateUser(req.user.id, updates);
    return ok(res, { user: publicUser(updated) }, 'Profile updated.');
  })
);

// PUT /api/auth/password — change my password (needs the current one)
router.put(
  '/password',
  authenticateToken,
  authLimiter,
  asyncHandler(async (req, res) => {
    const fields = {};
    const current = asString(req.body.currentPassword);
    if (!current) fields.currentPassword = 'Enter your current password.';
    const next = checkPassword(fields, 'newPassword', req.body.newPassword, 'New password');
    throwIfInvalid(fields);

    const user = findUserById(req.user.id);
    const match = user && (await bcrypt.compare(current, user.passwordHash));
    if (!match) throw Errors.validation('Your current password is not correct.', { currentPassword: 'Incorrect password.' });

    updateUser(user.id, { passwordHash: await bcrypt.hash(next, 10) });
    return ok(res, {}, 'Password changed.');
  })
);

module.exports = router;
