import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { getOrders, getOrder, createOrder, createWalkInOrder, updateOrderStatus, softDeleteOrder, getOrderStats, trackOrder, trackOrderByRef, getOrdersByPhone, getMyOrders, addOrderEventClient } from '../controllers/ordersController.js'
import { adminSecret, verifyToken } from '../middleware/auth.js'

// Optional auth middleware — attaches user if token valid, silently ignores bad/expired tokens
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1]
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET)
    } catch {
      // Invalid/expired token — treat as guest, don't block the request
      req.user = null
    }
  }
  next()
}

const r = Router()
r.post('/walkin', adminSecret, createWalkInOrder)  // POS / offline billing
r.post('/', optionalAuth, createOrder)
r.get('/mine', verifyToken, getMyOrders)   // Logged-in user's own orders
r.get('/events', adminSecret, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()
  const remove = addOrderEventClient(res)
  req.on('close', remove)
})
r.get('/', adminSecret, getOrders)
r.get('/stats', adminSecret, getOrderStats)
r.get('/by-phone/:phone', verifyToken, getOrdersByPhone) // Sync orders by phone — requires login
r.get('/track/:id', optionalAuth, trackOrder)         // Poll by DB UUID
r.get('/track-ref/:ref', trackOrderByRef)             // Poll by RF-... reference ID (no auth)
r.get('/:id', adminSecret, getOrder)
r.patch('/:id/status', adminSecret, updateOrderStatus)
r.delete('/:id', adminSecret, softDeleteOrder)   // Soft-delete: keep the row, exclude from totals
export default r
