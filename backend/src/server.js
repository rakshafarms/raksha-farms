import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

import { initDb } from './config/initDb.js'
import { adminOnly } from './middleware/auth.js'
import pool from './config/database.js'
import authRoutes          from './routes/auth.js'
import productsRoutes      from './routes/products.js'
import ordersRoutes        from './routes/orders.js'
import analyticsRoutes     from './routes/analytics.js'
import customersRoutes     from './routes/customers.js'
import couponsRoutes       from './routes/coupons.js'
import subscriptionsRoutes     from './routes/subscriptions.js'
import subscriptionPlansRoutes from './routes/subscriptionPlans.js'
import cartRoutes              from './routes/cart.js'
import categoriesRoutes        from './routes/categories.js'
import addressesRoutes         from './routes/addresses.js'
import wishlistRoutes          from './routes/wishlist.js'
import settingsRoutes          from './routes/settings.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 4000

// Security
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.ADMIN_URL  || 'http://localhost:3001',
      process.env.CLIENT_URL || 'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:4173',
    ].filter(Boolean)
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin || allowed.includes(origin)) return callback(null, true)
    // Allow any Netlify, Vercel, or Render subdomain
    if (/\.(netlify\.app|vercel\.app|onrender\.com)$/.test(origin)) return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15*60*1000, max: 20, message: 'Too many requests' }))
app.use('/api', rateLimit({ windowMs: 60*1000, max: 200 }))

// Body parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Serve uploaded images (from Render disk at /uploads, or local uploads/ folder)
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')
app.use('/uploads', express.static(UPLOAD_DIR))

// Routes
app.use('/api/auth',          authRoutes)
app.use('/api/products',      productsRoutes)
app.use('/api/orders',        ordersRoutes)
app.use('/api/analytics',     analyticsRoutes)
app.use('/api/customers',     customersRoutes)
app.use('/api/coupons',       couponsRoutes)
app.use('/api/subscriptions',      subscriptionsRoutes)
app.use('/api/subscription-plans',  subscriptionPlansRoutes)
app.use('/api/cart',               cartRoutes)
app.use('/api/categories',         categoriesRoutes)
app.use('/api/addresses',          addressesRoutes)
app.use('/api/wishlist',           wishlistRoutes)
app.use('/api/settings',          settingsRoutes)

// Health check — includes build date so we can confirm Render deployed latest code
app.get('/health', (req, res) => res.json({
  status:    'ok',
  env:       process.env.NODE_ENV,
  version:   '2026-05-08-v22',   // bump this on every deploy to verify new code is live
  features:  ['orders', 'order-tracking', 'google-auth', 'cross-device-sync', 'partial-rejection', 'low-stock-alerts', 'subscriptions', 'stock-deduction', 'soft-delete', 'admin-product-filters', 'subscription-dashboard', 'delivery-calendar', 'generate-orders', 'stock-warnings', 'payment-tracking', 'safe-json-parse', 'archived-order-block', 'order-number', 'saved-addresses-api', 'cart-sync-on-login'],
  database:  process.env.DATABASE_URL ? 'configured' : 'not-configured',
}))

// Test endpoint to verify API is working
app.get('/api/test', (req, res) => res.json({ message: 'API is working!', timestamp: new Date().toISOString() }))

// TEMPORARY: wipe all test orders + subscriptions (admin only — remove after use)
app.delete('/api/admin/wipe-test-data', ...adminOnly, async (req, res) => {
  try {
    const subs   = await pool.query('DELETE FROM subscriptions RETURNING id')
    const orders = await pool.query('DELETE FROM orders RETURNING id')
    res.json({ success: true, deleted: { subscriptions: subs.rowCount, orders: orders.rowCount } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

// Start server immediately so Render doesn't time out waiting for DB
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`)
  // Init DB tables in background after server starts
  initDb().catch(err => console.error('initDb error:', err.message))
})
export default app
