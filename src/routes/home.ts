const express = require('express');
const router = express.Router();
import { AuthRequest, AuthResponse } from '../types/routes.js';

router.get('/', (_req: AuthRequest, res: AuthResponse) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>BharatMart API</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          line-height: 1.6;
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
          color: #333;
        }
        h1 {
          color: #2c5282;
          border-bottom: 2px solid #4299e1;
          padding-bottom: 0.5rem;
        }
        .endpoints {
          background: #f7fafc;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .endpoint {
          margin-bottom: 1rem;
          padding: 1rem;
          background: white;
          border-radius: 4px;
          border-left: 4px solid #4299e1;
        }
        .method {
          font-weight: bold;
          color: #2b6cb0;
        }
        code {
          background: #edf2f7;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          font-family: 'Courier New', Courier, monospace;
        }
        .status {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          background: #48bb78;
          color: white;
          font-size: 0.875rem;
        }
      </style>
    </head>
    <body>
      <h1>🛍️ BharatMart API</h1>
      <div class="status">Status: Running</div>
      <p>Welcome to the BharatMart API. This is a RESTful API service for the BharatMart e-commerce platform.</p>
      
      <h2>🔑 Authentication</h2>
      <div class="endpoints">
        <div class="endpoint">
          <span class="method">POST</span> <code>/api/auth/register</code>
          <p>Register a new user account</p>
        </div>
        <div class="endpoint">
          <span class="method">POST</span> <code>/api/auth/login</code>
          <p>Login to get access token</p>
        </div>
      </div>

      <h2>📦 Products</h2>
      <div class="endpoints">
        <div class="endpoint">
          <span class="method">GET</span> <code>/api/products</code>
          <p>Get list of products with filtering and pagination</p>
        </div>
        <div class="endpoint">
          <span class="method">GET</span> <code>/api/products/:id</code>
          <p>Get product details by ID</p>
        </div>
      </div>

      <h2>🏪 Shops</h2>
      <div class="endpoints">
        <div class="endpoint">
          <span class="method">GET</span> <code>/api/shops</code>
          <p>Get list of shops with filtering and pagination</p>
        </div>
        <div class="endpoint">
          <span class="method">GET</span> <code>/api/shops/:id</code>
          <p>Get shop details by ID</p>
        </div>
      </div>

      <h2>📝 Documentation</h2>
      <p>For detailed API documentation and examples, please refer to our <a href="/api/docs">API Documentation</a>.</p>

      <footer style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; text-align: center;">
        <p>BharatMart API v1.0.0 | &copy; ${new Date().getFullYear()} BharatMart</p>
      </footer>
    </body>
    </html>
  `);
});

export default router;
