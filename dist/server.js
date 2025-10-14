"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const dotenv = require('dotenv');
// Import routes
const auth_js_1 = __importDefault(require("./routes/auth.js"));
const users_js_1 = __importDefault(require("./routes/users.js"));
const products_js_1 = __importDefault(require("./routes/products.js"));
const orders_js_1 = __importDefault(require("./routes/orders.js"));
const categories_js_1 = __importDefault(require("./routes/categories.js"));
const shops_js_1 = __importDefault(require("./routes/shops.js"));
const settings_js_1 = __importDefault(require("./routes/settings.js"));
const manufacturers_js_1 = __importDefault(require("./routes/manufacturers.js"));
const manufacturerCategories_js_1 = __importDefault(require("./routes/manufacturerCategories.js"));
const productCategories_js_1 = __importDefault(require("./routes/productCategories.js"));
const Franchise_js_1 = __importDefault(require("./routes/Franchise.js"));
const franchiseProducts_js_1 = __importDefault(require("./routes/franchiseProducts.js"));
const home_js_1 = __importDefault(require("./routes/home.js"));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const app = express();
// Security middleware
app.use(helmet());
app.use(compression());
// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', limiter);
// CORS configuration
const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
    : ['http://localhost:3000'];
app.use(cors({
    origin: corsOrigins,
    credentials: true
}));
// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Logging middleware
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}
// Static files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
// API routes
app.use('/api/auth', auth_js_1.default);
app.use('/api/users', users_js_1.default);
app.use('/api/products', products_js_1.default);
app.use('/api/orders', orders_js_1.default);
app.use('/api/categories', categories_js_1.default);
app.use('/api/shops', shops_js_1.default);
app.use('/api/settings', settings_js_1.default);
app.use('/api/manufacturers', manufacturers_js_1.default);
app.use('/api/product-categories', productCategories_js_1.default);
app.use('/api/manufacturer-categories', manufacturerCategories_js_1.default);
app.use('/api/franchises', Franchise_js_1.default);
app.use('/api/franchise-products', franchiseProducts_js_1.default);
// Health check endpoint
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'OK',
        message: 'BharatMart API is running',
        timestamp: new Date().toISOString()
    });
});
// Mount home route (polished welcome page)
app.use('/', home_js_1.default);
app.use((err, _req, res, _next) => {
    console.error(err.stack);
    const statusCode = err.status || err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});
// 404 handler
app.use('*', (_req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found',
        message: 'The requested endpoint does not exist'
    });
});
// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatmart';
const PORT = process.env.PORT || process.env.API_PORT || 5000;
mongoose.set('strictQuery', true);
// Log environment setup
console.log('Environment variables loaded:');
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- PORT:', PORT);
console.log('- MONGODB_URI:', MONGODB_URI);
console.log('- CORS_ORIGIN:', corsOrigins);
mongoose.connect(MONGODB_URI)
    .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV}`);
        console.log(`API: http://localhost:${PORT}`);
    });
})
    .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
});
exports.default = app;
//# sourceMappingURL=server.js.map