const mongoose = require('mongoose');

const productCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product category name is required'],
    trim: true,
    maxlength: [100, 'Category name cannot exceed 100 characters']
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ProductCategory', productCategorySchema);