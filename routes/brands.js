// Minimal compatibility shim: export the manufacturers router so that
// any legacy imports of /routes/brands.js continue to work but we
// centralize the implementation in /routes/manufacturers.js.

try {
  module.exports = require('./manufacturers');
} catch (err) {
  // If manufacturers route is missing, export a dummy router to avoid crashes.
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => res.status(410).json({ message: 'Brands endpoint removed. Use /manufacturers.' }));
  module.exports = router;
}