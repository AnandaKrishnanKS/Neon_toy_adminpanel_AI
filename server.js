require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cookieParser = require('cookie-parser');
const cloudinary = require('cloudinary').v2;
const nodemailer = require('nodemailer');

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
        // Add stock_count column
        pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_count INTEGER DEFAULT 0;', (migrateStockErr, migrateStockRes) => {
          if (migrateStockErr) {
            console.error('❌ Database migration failed (adding stock_count column):', migrateStockErr);
          } else {
            console.log('✅ Database migration successful (stock_count column ready)!');
            // Create terms_conditions table
            pool.query(`
              CREATE TABLE IF NOT EXISTS terms_conditions (
                id SERIAL PRIMARY KEY,
                content TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              );
            `, (migrateTermsErr, migrateTermsRes) => {
              if (migrateTermsErr) {
                console.error('❌ Database migration failed (creating terms_conditions table):', migrateTermsErr);
              } else {
                console.log('✅ Database migration successful (terms_conditions table ready)!');
                // Alter custom_enquiries to add address columns
                const alterEnquiriesQuery = `
                  ALTER TABLE custom_enquiries ADD COLUMN IF NOT EXISTS address TEXT;
                  ALTER TABLE custom_enquiries ADD COLUMN IF NOT EXISTS landmark VARCHAR(255);
                  ALTER TABLE custom_enquiries ADD COLUMN IF NOT EXISTS state VARCHAR(100);
                  ALTER TABLE custom_enquiries ADD COLUMN IF NOT EXISTS district VARCHAR(100);
                  ALTER TABLE custom_enquiries ADD COLUMN IF NOT EXISTS city VARCHAR(100);
                  ALTER TABLE custom_enquiries ADD COLUMN IF NOT EXISTS pincode VARCHAR(20);
                `;
                pool.query(alterEnquiriesQuery, (migrateEnqErr, migrateEnqRes) => {
                  if (migrateEnqErr) {
                    console.error('❌ Database migration failed (adding address columns to custom_enquiries):', migrateEnqErr);
                  } else {
                    console.log('✅ Database migration successful (custom_enquiries address columns ready)!');
                    
                    // Alter users table to add address columns
                    const alterUsersQuery = `
                      ALTER TABLE users ADD COLUMN IF NOT EXISTS landmark VARCHAR(255);
                      ALTER TABLE users ADD COLUMN IF NOT EXISTS state VARCHAR(100);
                      ALTER TABLE users ADD COLUMN IF NOT EXISTS district VARCHAR(100);
                    `;
                    pool.query(alterUsersQuery, (migrateUsersErr, migrateUsersRes) => {
                      if (migrateUsersErr) {
                        console.error('❌ Database migration failed (adding address columns to users table):', migrateUsersErr);
                      } else {
                        console.log('✅ Database migration successful (users address columns ready)!');
                      }
                    });
                  }
                });
              }
            });
          }
        });
      }
    });
  }
});

// Helper for DB query
const dbQuery = (text, params) => pool.query(text, params);

// HTML Email Layout Generator for Custom Order Enquiries
function generateCustomEnquiryEmailHtml(enquiry, type) {
  const enquiryId = enquiry.id ? `CR-${enquiry.id}` : 'Pending';
  
  // Theme and header colors based on status type
  let statusTitle = 'Custom Request Submitted';
  let statusSubtitle = 'We have received your custom order inquiry and our designers are reviewing it!';
  let themeColor = '#00f2ff'; // Accent Cyan
  let statusBanner = '💬 REQUEST SUBMITTED';

  if (type === 'cancelled') {
    statusTitle = 'Custom Request Cancelled';
    statusSubtitle = 'Your custom order request has been cancelled.';
    themeColor = '#ff3366'; // Accent Pink
    statusBanner = '🚫 REQUEST CANCELLED';
  } else if (type === 'in_progress') {
    statusTitle = 'Custom Request In Progress';
    statusSubtitle = 'Great news! Our creators are now working on your custom toy request.';
    themeColor = '#f59e0b'; // Orange/Amber
    statusBanner = '⚡ REQUEST IN PROGRESS';
  } else if (type === 'completed') {
    statusTitle = 'Custom Request Completed';
    statusSubtitle = 'Hooray! Your custom toy design is completed and ready.';
    themeColor = '#10b981'; // Green
    statusBanner = '🎁 REQUEST COMPLETED';
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${statusTitle}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f3f4f6; -webkit-font-smoothing: antialiased;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0b0f19; min-height: 100vh; padding: 20px 0;">
        <tr>
          <td align="center" valign="top">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #111827; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);">
              
              <!-- Brand Header -->
              <tr>
                <td align="center" style="background: linear-gradient(135deg, #111827 0%, #1f2937 100%); padding: 30px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
                  <div style="font-size: 2.5rem; font-weight: 800; letter-spacing: 2px; color: #ffffff; text-decoration: none; display: inline-block;">
                    <span style="background: linear-gradient(45deg, #ff3366, #00f2ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">ToTStore</span>
                  </div>
                  <div style="color: #9ca3af; font-size: 0.85rem; margin-top: 5px; letter-spacing: 1px; font-weight: 600; text-transform: uppercase;">Neon Toy Laboratory</div>
                </td>
              </tr>

              <!-- Status Banner -->
              <tr>
                <td align="center" style="padding: 25px 20px 10px 20px;">
                  <div style="display: inline-block; padding: 8px 18px; border-radius: 30px; background-color: rgba(255, 255, 255, 0.03); border: 1px solid ${themeColor}; color: ${themeColor}; font-weight: 700; font-size: 0.85rem; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 15px;">
                    ${statusBanner}
                  </div>
                  <h1 style="margin: 0 0 10px 0; color: #ffffff; font-size: 1.8rem; font-weight: 800;">${statusTitle}</h1>
                  <p style="margin: 0; color: #9ca3af; font-size: 0.95rem; line-height: 1.5; max-width: 450px;">${statusSubtitle}</p>
                </td>
              </tr>

              <!-- Main Card Body -->
              <tr>
                <td style="padding: 30px 30px 20px 30px;">
                  
                  <!-- Enquiry Overview Card -->
                  <div style="background-color: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px; padding: 20px; margin-bottom: 25px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding: 4px 0; color: #9ca3af; font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">Request Number</td>
                        <td align="right" style="padding: 4px 0; color: #ffffff; font-size: 0.95rem; font-weight: 700;">#${enquiryId}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #9ca3af; font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">Current Status</td>
                        <td align="right" style="padding: 4px 0; color: ${themeColor}; font-size: 0.95rem; font-weight: 700; text-transform: uppercase;">${enquiry.status || 'Pending'}</td>
                      </tr>
                    </table>
                  </div>

                  <!-- Product details -->
                  <h3 style="color: #ffffff; font-size: 1.05rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0;">Product Details</h3>
                  <div style="background-color: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px; padding: 20px; margin-bottom: 25px; display: flex; gap: 20px; align-items: center;">
                    ${enquiry.product_image ? `
                    <img src="${enquiry.product_image}" alt="${enquiry.product_name}" style="width: 70px; height: 70px; border-radius: 12px; object-fit: cover; border: 1px solid rgba(255, 255, 255, 0.1);" />
                    ` : ''}
                    <div>
                      <strong style="color: #ffffff; font-size: 1.1rem; display: block;">${enquiry.product_name}</strong>
                      <span style="font-size: 0.8rem; background: rgba(255,255,255,0.05); color: #9ca3af; padding: 2px 8px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); margin-top: 5px; display: inline-block;">${enquiry.product_category || 'Handmade'}</span>
                      <div style="font-size: 1rem; color: #00f2ff; font-weight: 600; margin-top: 5px;">Estimated Price: ₹${parseFloat(enquiry.product_price || '0').toFixed(2)}</div>
                    </div>
                  </div>

                  <!-- Inquiry details -->
                  <h3 style="color: #ffffff; font-size: 1.05rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0;">Your Inquiry Message</h3>
                  <div style="background-color: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px; padding: 20px; margin-bottom: 25px; color: #ffffff; font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap;">
                    ${enquiry.message}
                  </div>

                  <!-- Customer details -->
                  <h3 style="color: #ffffff; font-size: 1.05rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0;">Contact Information</h3>
                  <div style="background-color: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px; padding: 20px; margin-bottom: 25px; color: #d1d5db; font-size: 0.95rem; line-height: 1.5;">
                    <strong style="color: #ffffff; font-size: 1rem; display: block; margin-bottom: 5px;">${enquiry.name || 'Customer'}</strong>
                    <div>Email: ${enquiry.user_email}</div>
                    ${enquiry.phone ? `<div>Phone: ${enquiry.phone}</div>` : ''}
                  </div>

                  <!-- Shipping details -->
                  <h3 style="color: #ffffff; font-size: 1.05rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0;">Delivery Information</h3>
                  <div style="background-color: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px; padding: 20px; margin-bottom: 25px; color: #d1d5db; font-size: 0.95rem; line-height: 1.5;">
                    <div><strong>Address:</strong> ${enquiry.address || '—'}</div>
                    ${enquiry.landmark ? `<div><strong>Landmark:</strong> ${enquiry.landmark}</div>` : ''}
                    <div><strong>Location:</strong> ${enquiry.city || '—'}, ${enquiry.district || '—'}, ${enquiry.state || '—'}</div>
                    <div><strong>Pincode:</strong> ${enquiry.pincode || '—'}</div>
                  </div>

                </td>
              </tr>

              <!-- Call to Action / Support Notes -->
              <tr>
                <td align="center" style="padding: 10px 30px 40px 30px;">
                  <div style="height: 1px; background-color: rgba(255, 255, 255, 0.08); margin-bottom: 25px;"></div>
                  <p style="color: #9ca3af; font-size: 0.85rem; line-height: 1.5; margin: 0 0 20px 0;">You can check the real-time status of this custom request anytime by visiting the "Track Your Orders" page inside your profile.</p>
                  <p style="color: #6b7280; font-size: 0.8rem; margin: 0;">If you have any questions, please contact our support team at <a href="mailto:support@totstore.example.com" style="color: #00f2ff; text-decoration: none;">support@totstore.example.com</a>.</p>
                </td>
              </tr>

              <!-- Footer Banner -->
              <tr>
                <td align="center" style="background-color: rgba(0, 0, 0, 0.2); padding: 20px; border-top: 1px solid rgba(255, 255, 255, 0.05);">
                  <div style="color: #4b5563; font-size: 0.75rem; font-weight: 600;">&copy; 2026 ToTStore Inc. All Rights Reserved.</div>
                  <div style="color: #4b5563; font-size: 0.7rem; margin-top: 4px;">Powered by Neon Toy AI Engine</div>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

// Function to send custom order status email
async function sendCustomEnquiryStatusEmail(enquiry, type, recipientEmail) {
  // Read config from env
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || `"ToTStore" <no-reply@totstore.example.com>`;

  if (!host || !user || !pass) {
    console.warn('⚠️ SMTP details not configured. Unable to send custom request email.');
    return { success: false, error: 'SMTP configuration missing in environment' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    let subject = 'ToTStore Custom Request Update';
    if (type === 'submitted') {
      subject = `Custom Request Submitted! #${enquiry.id ? `CR-${enquiry.id}` : ''}`;
    } else if (type === 'in_progress') {
      subject = `Custom Request In Progress #${enquiry.id ? `CR-${enquiry.id}` : ''}`;
    } else if (type === 'completed') {
      subject = `Custom Request Completed! #${enquiry.id ? `CR-${enquiry.id}` : ''}`;
    } else if (type === 'cancelled') {
      subject = `Custom Request Cancelled #${enquiry.id ? `CR-${enquiry.id}` : ''}`;
    }

    const htmlContent = generateCustomEnquiryEmailHtml(enquiry, type);

    const mailOptions = {
      from,
      to: recipientEmail,
      subject,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ Custom request email sent to ${recipientEmail}. Message ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send custom request email:', error);
    return { success: false, error: error.message || error };
  }
}


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

// 0. CONFIGURATION ENDPOINT
app.get('/api/config', (req, res) => {
  res.json({
    whatsapp_number: process.env.WHATSAPP_NUMBER || '7025915922'
  });
});

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
    const enquiriesCount = await dbQuery('SELECT COUNT(*) FROM custom_enquiries');
    
    // Revenue sum (excluding cancelled and refunded orders)
    const revenueSum = await dbQuery("SELECT SUM(total_amount) FROM orders WHERE status NOT IN ('Cancelled', 'Refunded')");

    res.json({
      users: parseInt(usersCount.rows[0].count),
      orders: parseInt(ordersCount.rows[0].count),
      products: parseInt(productsCount.rows[0].count),
      offers: parseInt(offersCount.rows[0].count),
      revenue: parseFloat(revenueSum.rows[0].sum || 0),
      enquiries: parseInt(enquiriesCount.rows[0].count || 0)
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

// 4.5. CATEGORIES ENDPOINT
app.get('/api/categories', async (req, res) => {
  try {
    const result = await dbQuery("SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != '' ORDER BY category ASC");
    res.json(result.rows.map(r => r.category));
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// 4.6. CUSTOM ENQUIRIES ENDPOINTS
app.get('/api/enquiries', async (req, res) => {
  try {
    const result = await dbQuery(`
      SELECT ce.*, p.name as product_name, p.image_url as product_image, p.price as product_price, p.category as product_category
      FROM custom_enquiries ce
      JOIN products p ON ce.product_id = p.id
      ORDER BY ce.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching enquiries:', error);
    res.status(500).json({ error: 'Failed to fetch custom order enquiries' });
  }
});

app.put('/api/enquiries/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }
  try {
    const result = await dbQuery(
      'UPDATE custom_enquiries SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }

    // Fetch detailed enquiry info to send in the email
    const enqRes = await dbQuery(`
      SELECT ce.*, p.name as product_name, p.image_url as product_image, p.price as product_price, p.category as product_category
      FROM custom_enquiries ce
      JOIN products p ON ce.product_id = p.id
      WHERE ce.id = $1
    `, [id]);

    if (enqRes.rows.length > 0) {
      const enquiry = enqRes.rows[0];
      const typeMap = {
        'Pending': 'submitted',
        'In Progress': 'in_progress',
        'Completed': 'completed',
        'Cancelled': 'cancelled'
      };
      const emailType = typeMap[status] || 'submitted';
      try {
        await sendCustomEnquiryStatusEmail(enquiry, emailType, enquiry.user_email);
      } catch (emailErr) {
        console.error('Failed to send status update email (non-fatal):', emailErr);
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating enquiry status:', error);
    res.status(500).json({ error: 'Failed to update enquiry status' });
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
  const { name, description, price, image_url, offer_id, images, stock_count, category } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Name and price are required' });
  }
  try {
    const result = await dbQuery(
      `INSERT INTO products (name, description, price, image_url, offer_id, images, stock_count, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        name,
        description || '',
        price,
        image_url || '',
        offer_id || null,
        images || [],
        stock_count !== undefined && stock_count !== null ? parseInt(stock_count) : 0,
        category || ''
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, price, image_url, offer_id, images, stock_count, category } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Name and price are required' });
  }
  try {
    const result = await dbQuery(
      `UPDATE products 
       SET name = $1, description = $2, price = $3, image_url = $4, offer_id = $5, images = $6, stock_count = $7, category = $8
       WHERE id = $9 RETURNING *`,
      [
        name,
        description || '',
        price,
        image_url || '',
        offer_id || null,
        images || [],
        stock_count !== undefined && stock_count !== null ? parseInt(stock_count) : 0,
        category || '',
        id
      ]
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

// 7. TERMS & CONDITIONS ENDPOINTS
app.get('/api/terms', async (req, res) => {
  try {
    const result = await dbQuery('SELECT content, updated_at FROM terms_conditions ORDER BY id DESC LIMIT 1');
    if (result.rows.length === 0) {
      return res.json({ content: '', updated_at: null });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching terms:', error);
    res.status(500).json({ error: 'Failed to fetch terms and conditions' });
  }
});

app.post('/api/terms', async (req, res) => {
  const { content } = req.body;
  if (content === undefined) {
    return res.status(400).json({ error: 'Content is required' });
  }
  try {
    const result = await dbQuery(
      'INSERT INTO terms_conditions (content, updated_at) VALUES ($1, NOW()) RETURNING *',
      [content]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving terms:', error);
    res.status(500).json({ error: 'Failed to save terms and conditions' });
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
