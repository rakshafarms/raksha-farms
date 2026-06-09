import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
dotenv.config()

import { initDb } from './config/initDb.js'

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
import paymentsRoutes          from './routes/payments.js'

const app = express()
const PORT = process.env.PORT || 4000

// Security
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xContentTypeOptions: true,
}))
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.ADMIN_URL  || 'http://localhost:3001',
      process.env.CLIENT_URL || 'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:4173',
      // Production domains
      'https://www.rakshafarms.com',
      'https://rakshafarms.com',
      // Admin panel on Vercel (stable project URL)
      'https://raksha-farms-vxa5.vercel.app',
    ].filter(Boolean)
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true)
    // Exact match against the explicit list
    if (allowed.includes(origin)) return callback(null, true)
    // Allow any subdomain of rakshafarms.com (admin panel, etc.)
    if (/^https:\/\/([a-z0-9-]+\.)?rakshafarms\.com$/.test(origin)) return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15*60*1000, max: 20, message: 'Too many requests' }))
app.use('/api/coupons/validate', rateLimit({ windowMs: 60*1000, max: 5, message: 'Too many requests' }))
app.use('/api/orders/by-phone', rateLimit({ windowMs: 60*1000, max: 5, message: 'Too many requests' }))
app.use('/api', rateLimit({ windowMs: 60*1000, max: 200 }))

// Body parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Routes (images are now served from Cloudflare R2, not from this server)
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
app.use('/api/payments',          paymentsRoutes)

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }))

// Test endpoint to verify API is working
app.get('/api/test', (req, res) => res.json({ message: 'API is working!', timestamp: new Date().toISOString() }))


// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(err.status || 500).json({ error: 'Something went wrong' })
})

// Start server immediately so Render doesn't time out waiting for DB
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`)
  // Init DB tables in background after server starts
  initDb().catch(err => console.error('initDb error:', err.message))
})
export default app
