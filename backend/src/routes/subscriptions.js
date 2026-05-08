import { Router } from 'express'
import {
  getDashboard, getCalendar, generateOrders,
  getSubscriptions, getSubscriptionDetail,
  updateSubscriptionAdmin, markDelivered, skipDelivery,
  getMySubscriptions, createSubscription, toggleMySubscription, cancelMySubscription,
} from '../controllers/subscriptionsController.js'
import { adminOnly, verifyToken } from '../middleware/auth.js'

const r = Router()

// ── Admin routes (named before /:id to avoid param clash) ─────────────────────
r.get('/dashboard',         ...adminOnly, getDashboard)
r.get('/calendar',          ...adminOnly, getCalendar)
r.post('/generate-orders',  ...adminOnly, generateOrders)

r.get('/',                  ...adminOnly, getSubscriptions)
r.get('/:id/detail',        ...adminOnly, getSubscriptionDetail)
r.put('/:id',               ...adminOnly, updateSubscriptionAdmin)
r.post('/:id/mark-delivered',...adminOnly, markDelivered)
r.post('/:id/skip',         ...adminOnly, skipDelivery)

// ── Customer routes ────────────────────────────────────────────────────────────
r.get('/mine',              verifyToken, getMySubscriptions)
r.post('/create',           verifyToken, createSubscription)
r.patch('/:id/toggle',      verifyToken, toggleMySubscription)
r.delete('/:id',            verifyToken, cancelMySubscription)

export default r
