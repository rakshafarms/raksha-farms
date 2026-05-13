import axios from 'axios'
import Cookies from 'js-cookie'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  timeout: 15000,
})

export const API_BASE_URL = api.defaults.baseURL

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = Cookies.get('admin_token') ||
    (typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Never auto-logout on 401. A transient backend error, Render cold-start,
// or any single failed request must NOT wipe the admin session.
// The user logs out explicitly via the Sign Out button.
api.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(err)
)

// ── Auth ──────────────────────────────────────────────
export const authAPI = {
  login: (email, password) => api.post('/auth/admin-login', { email, password }), // admin-only endpoint
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/change-password', data),
}

// ── Products ──────────────────────────────────────────
export const productsAPI = {
  getAll: (params) => api.get('/products', { params }),                   // public (active only)
  getAllAdmin: (params) => api.get('/products/admin/all', { params }),    // admin (all statuses)
  getOne: (id) => api.get(`/products/${id}`),
  // Do NOT set Content-Type manually — Axios auto-sets multipart/form-data WITH the boundary when it detects FormData.
  // Manually setting it strips the boundary and breaks multer (causes "unexpected field" errors).
  create: (formData) => api.post('/products', formData),
  update: (id, formData) => api.put(`/products/${id}`, formData),
  archive: (id) => api.delete(`/products/${id}`),                        // soft delete (archive)
  hardDelete: (id) => api.delete(`/products/${id}/hard`),               // permanent delete
  updateStock: (id, stock, reason) => api.patch(`/products/${id}/stock`, { stock, reason }),
  getLowStock: (threshold) => api.get('/products/low-stock', { params: { threshold } }),
}

// ── Orders ────────────────────────────────────────────
export const ordersAPI = {
  getAll: (params) => api.get('/orders', { params }),
  getOne: (id) => api.get(`/orders/${id}`),
  updateStatus: (id, status, extras = {}) => api.patch(`/orders/${id}/status`, { status, ...extras }),
  getStats: () => api.get('/orders/stats'),
  createWalkIn: (data) => api.post('/orders/walkin', data),
  // EventSource can't send Authorization headers, so we pass the token as a
  // query param. The backend adminSecret middleware accepts it as a fallback.
  eventsUrl: (token) => {
    const base = `${API_BASE_URL}/orders/events`
    if (!token) return base
    return `${base}?token=${encodeURIComponent(token)}`
  },
}

// ── Analytics ─────────────────────────────────────────
export const analyticsAPI = {
  getDashboard: () => api.get('/analytics'),
  getSales: (period) => api.get('/analytics/sales', { params: { period } }),
  getCategories: () => api.get('/analytics/categories'),
}

// ── Customers ─────────────────────────────────────────
export const customersAPI = {
  getAll: (params) => api.get('/customers', { params }),
  getOrders: (id) => api.get(`/customers/${id}/orders`),
  getGuestOrders: (phone) => api.get(`/customers/guest/${encodeURIComponent(phone)}/orders`),
  toggle: (id) => api.patch(`/customers/${id}/toggle`),
}

// ── Coupons ───────────────────────────────────────────
export const couponsAPI = {
  getAll:    ()           => api.get('/coupons'),
  create:    (data)       => api.post('/coupons', data),
  update:    (id, data)   => api.put(`/coupons/${id}`, data),
  toggle:    (id)         => api.patch(`/coupons/${id}/toggle`),
  delete:    (id)         => api.delete(`/coupons/${id}`),
  available: ()           => api.get('/coupons/available'),
}

// ── Subscriptions (Admin) ─────────────────────────────
export const subscriptionsAPI = {
  getAll:          ()           => api.get('/subscriptions'),
  getDashboard:    ()           => api.get('/subscriptions/dashboard'),
  getCalendar:     (from, to)   => api.get('/subscriptions/calendar', { params: { from, to } }),
  generateOrders:  (date)       => api.post('/subscriptions/generate-orders', { date }),
  getDetail:       (id)         => api.get(`/subscriptions/${id}/detail`),
  update:          (id, data)   => api.put(`/subscriptions/${id}`, data),
  markDelivered:   (id)         => api.post(`/subscriptions/${id}/mark-delivered`),
  skipDelivery:    (id)         => api.post(`/subscriptions/${id}/skip`),
}

// ── Subscription Plans (Admin) ─────────────────────────
export const subscriptionPlansAPI = {
  getAll: () => api.get('/subscription-plans/admin/all'),
  create: (data) => api.post('/subscription-plans', data),
  update: (id, data) => api.put(`/subscription-plans/${id}`, data),
  delete: (id) => api.delete(`/subscription-plans/${id}`),
}

// ── Categories ────────────────────────────────────────
export const categoriesAPI = {
  getAll: () => api.get('/categories/all'),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
}

// ── Settings ──────────────────────────────────────────────
export const settingsAPI = {
  getDelivery: () => api.get('/settings/delivery'),
  updateDelivery: (data) => api.put('/settings/delivery', data),
}

export default api
