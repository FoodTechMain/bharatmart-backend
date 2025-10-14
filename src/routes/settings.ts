const express = require('express');
const router = express.Router();
import Settings, { ISettings } from '../models/Settings';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth';
import { AuthRequest, AuthResponse, ApiResponse } from '../types/routes';

type SettingsCategory = 'general' | 'ecommerce' | 'users' | 'notifications' | 'security' | 'analytics' | 'system';

interface DefaultSettings {
  general: {
    siteName: string;
    siteDescription: string;
    contactEmail: string;
    contactPhone: string;
    timezone: string;
    currency: string;
  };
  ecommerce: {
    autoAcceptOrders: boolean;
    allowGuestCheckout: boolean;
    minimumOrderAmount: number;
    freeShippingThreshold: number;
    maxDeliveryDistance: number;
    taxRate: number;
    enableReviews: boolean;
    requireReviewApproval: boolean;
    inventoryAlertThreshold: number;
    lowStockNotification: boolean;
  };
  users: {
    requireEmailVerification: boolean;
    allowUserRegistration: boolean;
    passwordMinLength: number;
    sessionTimeout: number;
    maxLoginAttempts: number;
    lockoutDuration: number;
  };
  notifications: {
    emailNotifications: {
      orderConfirmation: boolean;
      orderStatusUpdates: boolean;
      newUserRegistration: boolean;
      lowStockAlerts: boolean;
      systemAlerts: boolean;
    };
    smsNotifications: {
      orderConfirmation: boolean;
      orderStatusUpdates: boolean;
      deliveryUpdates: boolean;
    };
    pushNotifications: {
      newOrders: boolean;
      orderUpdates: boolean;
      systemMaintenance: boolean;
    };
  };
  security: {
    enableTwoFactorAuth: boolean;
    requireTwoFactorForAdmin: boolean;
    sessionTimeout: number;
    maxConcurrentSessions: number;
    enableApiRateLimiting: boolean;
    maxApiRequestsPerMinute: number;
    enableAuditLogging: boolean;
    logRetentionDays: number;
  };
  analytics: {
    enableGoogleAnalytics: boolean;
    enableConversionTracking: boolean;
    enableRealTimeAnalytics: boolean;
    dataRetentionDays: number;
  };
  system: {
    maintenanceMode: boolean;
    maintenanceMessage: string;
    enableCaching: boolean;
    cacheExpiration: number;
    enableCompression: boolean;
    maxUploadSize: number;
    enableBackup: boolean;
    backupFrequency: string;
    backupRetention: number;
  };
}

// Get all settings (Superadmin only)
router.get('/', authenticateToken, requireSuperAdmin, async (_req: AuthRequest, res: AuthResponse) => {
  try {
    const settings = await Settings.getAllSettings();
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get settings by category (Superadmin only)
router.get('/:category', authenticateToken, requireSuperAdmin, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { category } = req.params;
    const settings = await Settings.getCategorySettings(category);
    
    const result: { [key: string]: any } = {};
    settings.forEach(setting => {
      result[setting.key] = setting.value;
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Update all settings (Superadmin only)
router.post('/', authenticateToken, requireSuperAdmin, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const settingsData = req.body;
    
    // Validate settings data
    if (!settingsData || typeof settingsData !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid settings data'
      });
    }
    
    // Update settings
    await Settings.bulkUpdate(settingsData);
    
    // Get updated settings
    const updatedSettings = await Settings.getAllSettings();
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: updatedSettings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Update settings by category (Superadmin only)
router.put('/:category', authenticateToken, requireSuperAdmin, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { category } = req.params;
    const categorySettings = req.body;
    
    // Validate category
    const validCategories: SettingsCategory[] = ['general', 'ecommerce', 'users', 'notifications', 'security', 'analytics', 'system'];
    if (!validCategories.includes(category as SettingsCategory)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category'
      });
    }
    
    // Update settings for the category
    await Settings.bulkUpdate({ [category]: categorySettings } as any);
    
    // Get updated settings for the category
    const updatedSettings = await Settings.getCategorySettings(category);
    
    const result: { [key: string]: any } = {};
    updatedSettings.forEach(setting => {
      result[setting.key] = setting.value;
    });
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get public settings (no auth required)
router.get('/public/general', async (_req: AuthRequest, res: AuthResponse) => {
  try {
    const settings = await Settings.find({ 
      category: 'general', 
      isPublic: true 
    }).lean();
    
    const result: { [key: string]: any } = {};
    settings.forEach(setting => {
      result[setting.key] = setting.value;
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Initialize default settings (Superadmin only)
router.post('/initialize', authenticateToken, requireSuperAdmin, async (_req: AuthRequest, res: AuthResponse) => {
  try {
    const defaultSettings: DefaultSettings = {
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
      success: true,
      message: 'Default settings initialized successfully',
      data: defaultSettings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

export default router;
