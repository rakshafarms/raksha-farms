import { Router } from 'express'
import { getCustomers, getCustomerOrders, getGuestOrders, toggleCustomerStatus, searchCustomers } from '../controllers/customersController.js'
import { adminOnly } from '../middleware/auth.js'
const r = Router()
r.get('/',                    ...adminOnly, getCustomers)
r.get('/search',              ...adminOnly, searchCustomers)     // lightweight autocomplete for billing
r.get('/guest/:phone/orders', ...adminOnly, getGuestOrders)
r.get('/:id/orders',          ...adminOnly, getCustomerOrders)
r.patch('/:id/toggle',        ...adminOnly, toggleCustomerStatus)
export default r
