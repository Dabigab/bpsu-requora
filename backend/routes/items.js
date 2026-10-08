const express = require('express');
const { authenticateToken, optionalAuth } = require('../utils/auth');
const { ok, asyncHandler } = require('../utils/http');
const { singleImage, verifyUploadedImage, cleanupUploadOnError } = require('../utils/upload');
const { createRateLimiter } = require('../utils/rateLimit');
const itemService = require('../services/itemService');

const router = express.Router();

// A person can file at most this many reports per window (stops form spam).
const reportLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'You are submitting reports too quickly. Please wait a few minutes.',
});

// GET /api/items — public feed. Filters: type, category, status, q, location,
// dateFrom, dateTo, sort (newest|oldest), page, limit
router.get('/', optionalAuth, (req, res) => ok(res, itemService.listItems(req.query, req.user)));

// GET /api/items/mine — everything I reported (any status)
router.get('/mine', authenticateToken, (req, res) => ok(res, itemService.listMine(req.user, req.query)));

// GET /api/items/:id
router.get('/:id', optionalAuth, (req, res) => ok(res, itemService.getItemForViewer(req.params.id, req.user)));

// POST /api/items — report a lost or found item (multipart form, optional "image")
router.post(
  '/',
  reportLimiter,
  authenticateToken,
  singleImage,
  verifyUploadedImage,
  asyncHandler(async (req, res) => {
    const item = itemService.createReport(req.user, req.body, req.file);
    return ok(res, { item }, 'Report submitted successfully!', 201);
  }),
  cleanupUploadOnError // removes the stored photo if the report was rejected
);

// PUT /api/items/:id — edit details / close my own report (admins: any status)
router.put('/:id', authenticateToken, (req, res) => {
  const item = itemService.updateReport(req.user, req.params.id, req.body);
  return ok(res, { item }, 'Report updated.');
});

// DELETE /api/items/:id — owner (while still open) or admin
router.delete('/:id', authenticateToken, (req, res) => {
  const result = itemService.removeReport(req.user, req.params.id);
  return ok(res, result, 'Report deleted.');
});

module.exports = router;
