/* ============================================================
   ReQuora — claims routes
   A claim records someone's statement plus the visit they booked
   at the BPSU Lost & Found Office. Filing a claim never approves
   it: only an administrator can change a claim's status, and that
   is enforced here AND inside claimService.
   ============================================================ */

const express = require('express');
const { authenticateToken, requireAdmin } = require('../utils/auth');
const { ok } = require('../utils/http');
const { createRateLimiter } = require('../utils/rateLimit');
const claimService = require('../services/claimService');

const router = express.Router();

const claimLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'You are filing claims too quickly. Please wait a few minutes.',
});

// POST /api/claims — file a claim and book the office visit
router.post('/', claimLimiter, authenticateToken, (req, res) => {
  const claim = claimService.createClaim(req.user, req.body);
  return ok(res, { claim }, 'Claim submitted. The office will review it.', 201);
});

// GET /api/claims/mine — claims I filed, with their current status
router.get('/mine', authenticateToken, (req, res) => ok(res, { claims: claimService.listMine(req.user) }));

// GET /api/claims/item/:itemId — the report's owner (limited view) or an admin (full view)
router.get('/item/:itemId', authenticateToken, (req, res) =>
  ok(res, { claims: claimService.listForItem(req.user, req.params.itemId) })
);

// GET /api/claims — every claim (admin only). Optional ?status=
router.get('/', authenticateToken, requireAdmin, (req, res) => ok(res, { claims: claimService.listAll(req.query) }));

// PUT /api/claims/:id/cancel — withdraw my own claim while it is still pending
router.put('/:id/cancel', authenticateToken, (req, res) => {
  const claim = claimService.cancelClaim(req.user, req.params.id);
  return ok(res, { claim }, 'Claim cancelled.');
});

// PUT /api/claims/:id — the office's decision (admin only)
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  const claim = claimService.decideClaim(req.user, req.params.id, req.body);
  return ok(res, { claim }, 'Claim updated.');
});

module.exports = router;
