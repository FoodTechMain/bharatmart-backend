// import express from 'express';
// import express from 'express';
const express = require('express');
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables as early as possible so route modules
// (which may check process.env during module initialization) behave correctly.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { AuthRequest as Request, AuthResponse as Response, AuthNextFunction as NextFunction } from './types/express';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import productRoutes from './routes/products';
import orderRoutes from './routes/orders';
import categoryRoutes from './routes/categories';
import shopRoutes from './routes/shops';
import settingsRoutes from './routes/settings';
import vendorCategoryRoutes from './routes/vendorCategories';
import productCategoryRoutes from './routes/productCategories';
import franchiseRoutes from './routes/Franchise';
import franchiseProductRoutes from './routes/franchiseProducts';
import franchiseApplicationRoutes from './routes/FranchiseApplications';
import franchiseAuthRoutes from './routes/franchiseAuth';
import franchiseInventoryRoutes from './routes/franchiseInventory';
import cartRoutes from './routes/cart';
import homeRoutes from './routes/home';
import vendorsRoutes from './routes/vendors';
import brandsRoutes from './routes/brands';
import ContactUsQueryRoutes from './routes/contactusQueries';
import employeeRoutes from './routes/Employee';
import departmentRoutes from './routes/departments';

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

// In development allow requests from any origin (CRA may choose a different port like 3001).
if (process.env.NODE_ENV === 'development') {
  console.log('[Server] Development mode: enabling permissive CORS for local testing');
  app.use(cors({ origin: true, credentials: true }));
} else {
  app.use(cors({ origin: corsOrigins, credentials: true }));
}

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
app.use('/api/auth', authRoutes);
app.use('/api/franchise/auth', franchiseAuthRoutes); // Add franchise authentication routes
app.use('/api/franchise-applications', franchiseApplicationRoutes);
app.use('/api/users', userRoutes);

app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/product-categories', productCategoryRoutes);
app.use('/api/vendors', vendorsRoutes);
app.use('/api/brands', brandsRoutes);
app.use('/api/vendor-categories', vendorCategoryRoutes);
app.use('/api/franchises', franchiseRoutes);
app.use('/api/franchise-products', franchiseProductRoutes);
app.use('/api/franchise/inventory', franchiseInventoryRoutes);
app.use('/api/contact-queries', ContactUsQueryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentRoutes);

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'OK', 
    message: 'BharatMart API is running',
    timestamp: new Date().toISOString()
  });
});

// API Documentation - Only available in development
if (process.env.NODE_ENV === 'development') {
  app.get('/api/docs', (_req: Request, res: Response) => {
    res.json({
      message: 'API Documentation',
      environment: 'development',
      endpoints: {
        auth: {
          'POST /api/auth/register': 'Register a new user',
          'POST /api/auth/login': 'Login user and get token'
        },
        products: {
          'GET /api/products': 'Get all products with pagination',
          'GET /api/products/:id': 'Get product by ID',
          'POST /api/products': 'Create new product (admin)',
          'PUT /api/products/:id': 'Update product (admin)',
          'DELETE /api/products/:id': 'Delete product (admin)'
        },
        users: {
          'GET /api/users': 'Get all users (admin)',
          'GET /api/users/:id': 'Get user by ID',
          'PUT /api/users/:id': 'Update user',
          'DELETE /api/users/:id': 'Delete user (admin)'
        },
        orders: {
          'GET /api/orders': 'Get user orders',
          'POST /api/orders': 'Create new order',
          'GET /api/orders/:id': 'Get order by ID',
          'PUT /api/orders/:id': 'Update order status (admin)'
        },
        shops: {
          'GET /api/shops': 'Get all shops',
          'GET /api/shops/:id': 'Get shop by ID',
          'POST /api/shops': 'Create shop (admin)',
          'PUT /api/shops/:id': 'Update shop (admin)'
        },
        categories: {
          'GET /api/categories': 'Get all categories',
          'POST /api/categories': 'Create category (admin)',
          'PUT /api/categories/:id': 'Update category (admin)'
        },
        franchises: {
          'POST /api/franchise/auth/login': 'Login franchise and get token',
          'GET /api/franchises': 'Get all franchises',
          'POST /api/franchises': 'Create franchise (admin)',
          'PUT /api/franchises/:id': 'Update franchise (admin)',
          'DELETE /api/franchises/:id': 'Delete franchise (admin)'
        }
      },
      authentication: {
        type: 'Bearer Token',
        header: 'Authorization: Bearer <token>',
        note: 'Include the token in the Authorization header for protected routes'
      },
      baseUrl: process.env.NODE_ENV === 'production' 
        ? 'https://api.bharatmart.com' 
        : `http://localhost:${process.env.PORT || 5000}`
    });
  });
}

// Mount home route (polished welcome page)
app.use('/', homeRoutes);

// Error handling middleware
interface ErrorWithStatus extends Error {
  status?: number;
  statusCode?: number;
  stack?: string;
}

app.use((err: ErrorWithStatus, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({ 
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler (recommended)
app.use((_req: Request, res: Response) => {
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
  .catch((err: Error) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

export default app;