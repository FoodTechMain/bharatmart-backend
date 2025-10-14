import mongoose, { Document, Model, Schema } from 'mongoose';

export type SettingCategory = 'general' | 'ecommerce' | 'users' | 'notifications' | 'security' | 'analytics' | 'system';

export interface ISettings {
  category: SettingCategory;
  key: string;
  value: any;
  description?: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISettingsDocument extends ISettings, Document {}

export interface SettingsModel extends Model<ISettingsDocument> {
  getCategorySettings(category: SettingCategory): Promise<ISettings[]>;
  getSetting(category: SettingCategory, key: string): Promise<ISettings | null>;
  setSetting(category: SettingCategory, key: string, value: any, description?: string): Promise<ISettingsDocument>;
  getAllSettings(): Promise<Record<SettingCategory, Record<string, any>>>;
  bulkUpdate(settingsData: Record<SettingCategory, Record<string, any>>): Promise<mongoose.mongo.BulkWriteResult>;
}

const settingsSchema = new Schema<ISettingsDocument, SettingsModel>({
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
    type: Schema.Types.Mixed,
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
settingsSchema.statics.getCategorySettings = function(category: SettingCategory): Promise<ISettings[]> {
  return this.find({ category }).lean();
};

// Static method to get a specific setting
settingsSchema.statics.getSetting = function(category: SettingCategory, key: string): Promise<ISettings | null> {
  return this.findOne({ category, key }).lean();
};

// Static method to set a setting
settingsSchema.statics.setSetting = function(
  category: SettingCategory,
  key: string,
  value: any,
  description: string = ''
): Promise<ISettingsDocument> {
  return this.findOneAndUpdate(
    { category, key },
    { value, description },
    { upsert: true, new: true }
  );
};

// Static method to get all settings as an object
settingsSchema.statics.getAllSettings = function(): Promise<Record<SettingCategory, Record<string, any>>> {
  return this.find().lean().then(settings => {
    const result: Record<SettingCategory, Record<string, any>> = {
      general: {},
      ecommerce: {},
      users: {},
      notifications: {},
      security: {},
      analytics: {},
      system: {}
    };
    settings.forEach(setting => {
      result[setting.category][setting.key] = setting.value;
    });
    return result;
  });
};

// Static method to bulk update settings
settingsSchema.statics.bulkUpdate = function(
  settingsData: Record<SettingCategory, Record<string, any>>
): Promise<mongoose.mongo.BulkWriteResult> {
  const operations = Object.entries(settingsData).flatMap(([category, categorySettings]) =>
    Object.entries(categorySettings).map(([key, value]) => ({
      updateOne: {
        filter: { category, key },
        update: { $set: { value } },
        upsert: true
      }
    }))
  );

  return this.bulkWrite(operations);
};

export default mongoose.model<ISettingsDocument, SettingsModel>('Settings', settingsSchema);