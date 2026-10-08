const express = require('express');
const { authenticateToken, requireAdmin } = require('../utils/auth');
const { ok } = require('../utils/http');
const adminService = require('../services/adminService');
const itemService = require('../services/itemService');

const router = express.Router();

// Every admin route needs a logged-in administrator.
router.use(authenticateToken, requireAdmin);

// GET /api/admin/stats — dashboard numbers, chart data, recent activity
router.get('/stats', (req, res) =>
  ok(res, {
    stats: adminService.adminStats(),
    recentReports: adminService.listItemsForAdmin({ limit: 5 }).items,
    recentClaims: adminService.recentClaims(5),
  })
);

// GET /api/admin/items — every report, any status (filters + paging like the public feed)
router.get('/items', (req, res) => ok(res, adminService.listItemsForAdmin(req.query)));

// POST /api/admin/items/:id/verify — office has checked the report
router.post('/items/:id/verify', (req, res) =>
  ok(res, { item: adminService.verifyItem(req.params.id) }, 'Report verified.')
);

// PUT /api/admin/items/:id/status — change a report's status
router.put('/items/:id/status', (req, res) =>
  ok(res, { item: adminService.setItemStatus(req.params.id, req.body.status) }, 'Status updated.')
);

// DELETE /api/admin/items/:id — remove a duplicate / inappropriate report (and its claims + photo)
router.delete('/items/:id', (req, res) =>
  ok(res, itemService.removeReport(req.user, req.params.id), 'Report deleted.')
);

// GET /api/admin/users — registered people (never includes password data)
router.get('/users', (req, res) => ok(res, { users: adminService.listUsers() }));

module.exports = router;
