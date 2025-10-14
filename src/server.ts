const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const dotenv = require('dotenv');

import type { AuthRequest as Request, AuthResponse as Response, AuthNextFunction as NextFunction } from './types/express.js';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import categoryRoutes from './routes/categories.js';
import shopRoutes from './routes/shops.js';
import settingsRoutes from './routes/settings.js';
import manufacturersRoutes from './routes/manufacturers.js';
import manufacturerCategoryRoutes from './routes/manufacturerCategories.js';
import productCategoryRoutes from './routes/productCategories.js';
import franchiseRoutes from './routes/Franchise.js';
import franchiseProductRoutes from './routes/franchiseProducts.js';
import homeRoutes from './routes/home.js';

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
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/manufacturers', manufacturersRoutes);
app.use('/api/product-categories', productCategoryRoutes);
app.use('/api/manufacturer-categories', manufacturerCategoryRoutes);
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

// 404 handler
app.use('*', (_req: Request, res: Response) => {
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