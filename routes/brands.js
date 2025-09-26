const express = require('express');
const Brand = require('../models/Brand');
const router = express.Router();

// Get all brands
router.get('/', async (req, res) => {
  const brands = await Brand.find().sort({ name: 1 });
  res.json({ brands });
});

module.exports = router;