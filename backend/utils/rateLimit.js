/* ============================================================
   ReQuora — tiny in-memory rate limiter (no dependencies)
   Fixed window per client IP. Good enough to slow down password
   guessing and form spam on a single server. For several servers
   behind a load balancer, use a shared store instead.
   Disabled automatically when NODE_ENV=test.
   ============================================================ */

const { Errors } = require('./http');

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 30, message } = {}) {
  const hits = new Map(); // ip -> { count, resetAt }

  // Drop expired entries now and then so the map cannot grow forever.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs);
  if (sweeper.unref) sweeper.unref();

  return function rateLimit(req, res, next) {
    if (process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT_IN_TESTS !== 'true') {
      return next();
    }
    const key = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(Errors.tooMany(message || 'Too many attempts. Please wait a few minutes and try again.'));
    }
    return next();
  };
}

module.exports = { createRateLimiter };
