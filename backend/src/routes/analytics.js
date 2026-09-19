import { Router } from 'express'
import { getDashboardStats, getSalesAnalytics, getCategoryRevenue, getProductSales } from '../controllers/analyticsController.js'
import { adminOnly } from '../middleware/auth.js'
const r = Router()
r.get('/', ...adminOnly, getDashboardStats)
r.get('/sales', ...adminOnly, getSalesAnalytics)
r.get('/categories', ...adminOnly, getCategoryRevenue)
r.get('/products',   ...adminOnly, getProductSales)
export default r
