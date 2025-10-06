const mongoose = require('mongoose');

const manufacturerCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Manufacturer category name is required'],
    trim: true,
    maxlength: [100, 'Category name cannot exceed 100 characters']
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ManufacturerCategory', manufacturerCategorySchema);