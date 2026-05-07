import { Router } from 'express'
import {
  getCoupons, getAvailableCoupons,
  createCoupon, updateCoupon, toggleCoupon, deleteCoupon,
  validateCoupon,
} from '../controllers/couponsController.js'
import { adminOnly, verifyToken } from '../middleware/auth.js'
const r = Router()

r.get('/available', getAvailableCoupons)   // public — customers can discover coupons
r.post('/validate', validateCoupon)         // public — called during checkout

r.get('/',        ...adminOnly, getCoupons)
r.post('/',       ...adminOnly, createCoupon)
r.put('/:id',     ...adminOnly, updateCoupon)
r.patch('/:id/toggle', ...adminOnly, toggleCoupon)
r.delete('/:id',  ...adminOnly, deleteCoupon)

export default r
