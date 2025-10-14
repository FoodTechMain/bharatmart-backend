"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const router = express.Router();
const Settings_js_1 = __importDefault(require("../models/Settings.js"));
const auth_js_1 = require("../middleware/auth.js");
// Get all settings (Superadmin only)
router.get('/', auth_js_1.authenticateToken, auth_js_1.requireSuperAdmin, async (_req, res) => {
    try {
        const settings = await Settings_js_1.default.getAllSettings();
        res.json({
            success: true,
            data: settings
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get settings by category (Superadmin only)
router.get('/:category', auth_js_1.authenticateToken, auth_js_1.requireSuperAdmin, async (req, res) => {
    try {
        const { category } = req.params;
        const settings = await Settings_js_1.default.getCategorySettings(category);
        const result = {};
        settings.forEach(setting => {
            result[setting.key] = setting.value;
        });
        res.json({
            success: true,
            data: result
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Update all settings (Superadmin only)
router.post('/', auth_js_1.authenticateToken, auth_js_1.requireSuperAdmin, async (req, res) => {
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
        await Settings_js_1.default.bulkUpdate(settingsData);
        // Get updated settings
        const updatedSettings = await Settings_js_1.default.getAllSettings();
        res.json({
            success: true,
            message: 'Settings updated successfully',
            data: updatedSettings
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Update settings by category (Superadmin only)
router.put('/:category', auth_js_1.authenticateToken, auth_js_1.requireSuperAdmin, async (req, res) => {
    try {
        const { category } = req.params;
        const categorySettings = req.body;
        // Validate category
        const validCategories = ['general', 'ecommerce', 'users', 'notifications', 'security', 'analytics', 'system'];
        if (!validCategories.includes(category)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid category'
            });
        }
        // Update settings for the category
        await Settings_js_1.default.bulkUpdate({ [category]: categorySettings });
        // Get updated settings for the category
        const updatedSettings = await Settings_js_1.default.getCategorySettings(category);
        const result = {};
        updatedSettings.forEach(setting => {
            result[setting.key] = setting.value;
        });
        res.json({
            success: true,
            message: 'Settings updated successfully',
            data: result
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get public settings (no auth required)
router.get('/public/general', async (_req, res) => {
    try {
        const settings = await Settings_js_1.default.find({
            category: 'general',
            isPublic: true
        }).lean();
        const result = {};
        settings.forEach(setting => {
            result[setting.key] = setting.value;
        });
        res.json({
            success: true,
            data: result
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Initialize default settings (Superadmin only)
router.post('/initialize', auth_js_1.authenticateToken, auth_js_1.requireSuperAdmin, async (_req, res) => {
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
        await Settings_js_1.default.bulkUpdate(defaultSettings);
        res.json({
            success: true,
            message: 'Default settings initialized successfully',
            data: defaultSettings
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=settings.js.map