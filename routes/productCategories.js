const express = require('express');
const ProductCategory = require('../models/ProductCategory');
const router = express.Router();

// Get all product categories
router.get('/', async (req, res) => {
  const categories = await ProductCategory.find().sort({ name: 1 });
  console.log("categoreis",categories);
  res.json({ categories });
});

module.exports = router;