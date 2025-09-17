const express = require('express');
const Settings = require('../models/Settings');
const { authenticateToken, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all settings (Superadmin only)
router.get('/', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const settings = await Settings.getAllSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get settings by category (Superadmin only)
router.get('/:category', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { category } = req.params;
    const settings = await Settings.getCategorySettings(category);
    
    const result = {};
    settings.forEach(setting => {
      result[setting.key] = setting.value;
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update all settings (Superadmin only)
router.post('/', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const settingsData = req.body;
    
    // Validate settings data
    if (!settingsData || typeof settingsData !== 'object') {
      return res.status(400).json({ message: 'Invalid settings data' });
    }
    
    // Update settings
    await Settings.bulkUpdate(settingsData);
    
    // Get updated settings
    const updatedSettings = await Settings.getAllSettings();
    
    res.json({
      message: 'Settings updated successfully',
      settings: updatedSettings
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update settings by category (Superadmin only)
router.put('/:category', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { category } = req.params;
    const categorySettings = req.body;
    
    // Validate category
    const validCategories = ['general', 'ecommerce', 'users', 'notifications', 'security', 'analytics', 'system'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ message: 'Invalid category' });
    }
    
    // Update settings for the category
    await Settings.bulkUpdate({ [category]: categorySettings });
    
    // Get updated settings for the category
    const updatedSettings = await Settings.getCategorySettings(category);
    
    const result = {};
    updatedSettings.forEach(setting => {
      result[setting.key] = setting.value;
    });
    
    res.json({
      message: 'Settings updated successfully',
      settings: result
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get public settings (no auth required)
router.get('/public/general', async (req, res) => {
  try {
    const settings = await Settings.find({ 
      category: 'general', 
      isPublic: true 
    }).lean();
    
    const result = {};
    settings.forEach(setting => {
      result[setting.key] = setting.value;
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Initialize default settings (Superadmin only)
router.post('/initialize', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const defaultSettings = {
      general: {
        siteName: 'BharatMart',
        siteDescription: 'India\'s Premier E-commerce Platform',
        contactEmail: 'support@bharatmart.com',
        contactPhone: '+91-9876543210',
        timezone: 'Asia/Kolkata',
        currency: 'INR'
      },
      ecommerce: {
        autoAcceptOrders: true,
        allowGuestCheckout: true,
        minimumOrderAmount: 100,
        freeShippingThreshold: 500,
        maxDeliveryDistance: 50,
        taxRate: 18,
        enableReviews: true,
        requireReviewApproval: true,
        inventoryAlertThreshold: 10,
        lowStockNotification: true
      },
      users: {
        requireEmailVerification: true,
        allowUserRegistration: true,
        passwordMinLength: 8,
        sessionTimeout: 30,
        maxLoginAttempts: 5,
        lockoutDuration: 15
      },
      notifications: {
        emailNotifications: {
          orderConfirmation: true,
          orderStatusUpdates: true,
          newUserRegistration: true,
          lowStockAlerts: true,
          systemAlerts: true
        },
        smsNotifications: {
          orderConfirmation: false,
          orderStatusUpdates: true,
          deliveryUpdates: true
        },
        pushNotifications: {
          newOrders: true,
          orderUpdates: true,
          systemMaintenance: true
        }
      },
      security: {
        enableTwoFactorAuth: false,
        requireTwoFactorForAdmin: true,
        sessionTimeout: 30,
        maxConcurrentSessions: 3,
        enableApiRateLimiting: true,
        maxApiRequestsPerMinute: 100,
        enableAuditLogging: true,
        logRetentionDays: 90
      },
      analytics: {
        enableGoogleAnalytics: false,
        enableConversionTracking: true,
        enableRealTimeAnalytics: true,
        dataRetentionDays: 365
      },
      system: {
        maintenanceMode: false,
        maintenanceMessage: 'We are currently performing maintenance. Please check back soon.',
        enableCaching: true,
        cacheExpiration: 3600,
        enableCompression: true,
        maxUploadSize: 10,
        enableBackup: true,
        backupFrequency: 'daily',
        backupRetention: 30
      }
    };
    
    await Settings.bulkUpdate(defaultSettings);
    
    res.json({
      message: 'Default settings initialized successfully',
      settings: defaultSettings
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router; 