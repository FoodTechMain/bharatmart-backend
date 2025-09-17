const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    enum: ['general', 'ecommerce', 'users', 'notifications', 'security', 'analytics', 'system']
  },
  key: {
    type: String,
    required: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  isPublic: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Compound index for category and key
settingsSchema.index({ category: 1, key: 1 }, { unique: true });

// Static method to get all settings for a category
settingsSchema.statics.getCategorySettings = function(category) {
  return this.find({ category }).lean();
};

// Static method to get a specific setting
settingsSchema.statics.getSetting = function(category, key) {
  return this.findOne({ category, key }).lean();
};

// Static method to set a setting
settingsSchema.statics.setSetting = function(category, key, value, description = '') {
  return this.findOneAndUpdate(
    { category, key },
    { value, description },
    { upsert: true, new: true }
  );
};

// Static method to get all settings as an object
settingsSchema.statics.getAllSettings = function() {
  return this.find().lean().then(settings => {
    const result = {};
    settings.forEach(setting => {
      if (!result[setting.category]) {
        result[setting.category] = {};
      }
      result[setting.category][setting.key] = setting.value;
    });
    return result;
  });
};

// Static method to bulk update settings
settingsSchema.statics.bulkUpdate = function(settingsData) {
  const operations = [];
  
  Object.entries(settingsData).forEach(([category, categorySettings]) => {
    Object.entries(categorySettings).forEach(([key, value]) => {
      operations.push({
        updateOne: {
          filter: { category, key },
          update: { $set: { value } },
          upsert: true
        }
      });
    });
  });
  
  return this.bulkWrite(operations);
};

module.exports = mongoose.model('Settings', settingsSchema); 