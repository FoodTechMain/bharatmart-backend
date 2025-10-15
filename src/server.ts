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
// import productRoutes from './routes/products';
import orderRoutes from './routes/orders';
import categoryRoutes from './routes/categories';
import shopRoutes from './routes/shops';
import settingsRoutes from './routes/settings';
import vendorCategoryRoutes from './routes/vendorCategories';
import productCategoryRoutes from './routes/productCategories';
import franchiseRoutes from './routes/Franchise';
import franchiseProductRoutes from './routes/franchiseProducts';
import homeRoutes from './routes/home';
import vendorsRoutes from './routes/vendors';
import brandsRoutes from './routes/brands';

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
app.use('/api/users', userRoutes);
// app.use('/api/products', productRoutes);
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

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'OK', 
    message: 'BharatMart API is running',
    timestamp: new Date().toISOString()
  });
});

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