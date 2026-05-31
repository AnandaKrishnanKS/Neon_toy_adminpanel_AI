require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cookieParser = require('cookie-parser');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 3001;

// Session token generated dynamically at startup for security
const SESSION_TOKEN = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// Configure Cloudinary
const isCloudinaryUrlSet = !!process.env.CLOUDINARY_URL;
const isCloudinaryConfigSet = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

if (isCloudinaryUrlSet) {
  // SDK automatically picks up CLOUDINARY_URL from process.env
  console.log('✅ Cloudinary configured successfully (via CLOUDINARY_URL)!');
} else if (isCloudinaryConfigSet) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('✅ Cloudinary configured successfully (via individual credentials)!');
} else {
  console.warn('⚠️ Warning: Cloudinary environment variables (CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) are missing. Image uploads will fail.');
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Serve CSS and JS assets publicly
app.use('/styles.css', express.static(path.join(__dirname, 'public', 'styles.css')));
app.use('/app.js', express.static(path.join(__dirname, 'public', 'app.js')));
app.use('/components', express.static(path.join(__dirname, 'public', 'components')));

// Serve login page route
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Authentication verification middleware
const requireAuth = (req, res, next) => {
  const token = req.cookies.admin_session;
  if (token && token === SESSION_TOKEN) {
    next();
  } else {
    // Check if the request expects JSON or is an API call
    if (req.xhr || req.headers.accept?.includes('json') || req.path.startsWith('/api/')) {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      res.redirect('/login');
    }
  }
};

// Protect root dashboard view
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Database Connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ Error: DATABASE_URL environment variable is not defined.');
  process.exit(1);
}

const pool = new Pool({ connectionString });

// Test DB Connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
  } else {
    console.log('✅ Database connected successfully!');
    // Run database migration to support multiple images
    pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT[];', (migrateErr, migrateRes) => {
      if (migrateErr) {
        console.error('❌ Database migration failed (adding images column):', migrateErr);
      } else {
        console.log('✅ Database migration successful (images column ready)!');
      }
    });
  }
});

// Helper for DB query
const dbQuery = (text, params) => pool.query(text, params);

/* ==========================================================================
   AUTHENTICATION & SESSION API ENDPOINTS
   ========================================================================== */

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const envUsername = process.env.ADMIN_USERNAME || 'admin';
  const envPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (username === envUsername && password === envPassword) {
    res.cookie('admin_session', SESSION_TOKEN, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Invalid admin credentials' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('admin_session', {
    httpOnly: true,
    sameSite: 'strict'
  });
  res.json({ success: true });
});

// Apply authentication middleware to all subsequent API endpoints
app.use('/api', requireAuth);

/* ==========================================================================
   API ENDPOINTS
   ========================================================================== */

// 1. DASHBOARD METRICS
app.get('/api/stats', async (req, res) => {
  try {
    const usersCount = await dbQuery('SELECT COUNT(*) FROM users');
    const ordersCount = await dbQuery('SELECT COUNT(*) FROM orders');
    const productsCount = await dbQuery('SELECT COUNT(*) FROM products');
    const offersCount = await dbQuery('SELECT COUNT(*) FROM offers WHERE is_active = true');
    
    // Revenue sum (excluding cancelled and refunded orders)
    const revenueSum = await dbQuery("SELECT SUM(total_amount) FROM orders WHERE status NOT IN ('Cancelled', 'Refunded')");

    res.json({
      users: parseInt(usersCount.rows[0].count),
      orders: parseInt(ordersCount.rows[0].count),
      products: parseInt(productsCount.rows[0].count),
      offers: parseInt(offersCount.rows[0].count),
      revenue: parseFloat(revenueSum.rows[0].sum || 0)
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
  }
});

// 2. USERS ENDPOINTS
app.get('/api/users', async (req, res) => {
  try {
    const result = await dbQuery('SELECT * FROM users ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// 3. ORDERS ENDPOINTS
app.get('/api/orders', async (req, res) => {
  try {
    const result = await dbQuery('SELECT * FROM orders ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }
  try {
    const result = await dbQuery(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// 4. OFFERS ENDPOINTS
app.get('/api/offers', async (req, res) => {
  try {
    const result = await dbQuery('SELECT * FROM offers ORDER BY id ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching offers:', error);
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
});

app.post('/api/offers', async (req, res) => {
  const { title, description, discount_percentage, badge_text, banner_url, is_active } = req.body;
  if (!title || discount_percentage === undefined) {
    return res.status(400).json({ error: 'Title and discount percentage are required' });
  }
  try {
    const result = await dbQuery(
      `INSERT INTO offers (title, description, discount_percentage, badge_text, banner_url, is_active)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, description || '', discount_percentage, badge_text || '', banner_url || '', is_active !== false]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating offer:', error);
    res.status(500).json({ error: 'Failed to create offer' });
  }
});

app.put('/api/offers/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, discount_percentage, badge_text, banner_url, is_active } = req.body;
  if (!title || discount_percentage === undefined) {
    return res.status(400).json({ error: 'Title and discount percentage are required' });
  }
  try {
    const result = await dbQuery(
      `UPDATE offers 
       SET title = $1, description = $2, discount_percentage = $3, badge_text = $4, banner_url = $5, is_active = $6
       WHERE id = $7 RETURNING *`,
      [title, description || '', discount_percentage, badge_text || '', banner_url || '', is_active, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Offer not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating offer:', error);
    res.status(500).json({ error: 'Failed to update offer' });
  }
});

app.delete('/api/offers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Note: products reference offers via ON DELETE SET NULL, so deleting an offer is safe.
    const result = await dbQuery('DELETE FROM offers WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Offer not found' });
    }
    res.json({ message: 'Offer deleted successfully' });
  } catch (error) {
    console.error('Error deleting offer:', error);
    res.status(500).json({ error: 'Failed to delete offer' });
  }
});

// 5. PRODUCTS ENDPOINTS
app.get('/api/products', async (req, res) => {
  try {
    const result = await dbQuery(`
      SELECT p.*, o.title as offer_title, o.discount_percentage
      FROM products p
      LEFT JOIN offers o ON p.offer_id = o.id
      ORDER BY p.id DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.post('/api/products', async (req, res) => {
  const { name, description, price, image_url, offer_id, images } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Name and price are required' });
  }
  try {
    const result = await dbQuery(
      `INSERT INTO products (name, description, price, image_url, offer_id, images)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, description || '', price, image_url || '', offer_id || null, images || []]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, price, image_url, offer_id, images } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Name and price are required' });
  }
  try {
    const result = await dbQuery(
      `UPDATE products 
       SET name = $1, description = $2, price = $3, image_url = $4, offer_id = $5, images = $6
       WHERE id = $7 RETURNING *`,
      [name, description || '', price, image_url || '', offer_id || null, images || [], id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await dbQuery('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// 6. IMAGE UPLOAD ENDPOINT (CLOUDINARY)
app.post('/api/upload', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    if (!process.env.CLOUDINARY_URL && !(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)) {
      return res.status(503).json({ error: 'Cloudinary is not configured on the server. Please check your environment variables.' });
    }

    // Upload to Cloudinary. It will auto-detect base64 data-URIs.
    const uploadResponse = await cloudinary.uploader.upload(image, {
      folder: 'toy_adminpanel',
      resource_type: 'auto'
    });

    res.json({ url: uploadResponse.secure_url });
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload image to Cloudinary' });
  }
});

// Serve frontend SPA for any other routes (protected)
app.get('*', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Admin Panel server is running on http://localhost:${PORT}`);
});
