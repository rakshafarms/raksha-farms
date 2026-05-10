import jwt from 'jsonwebtoken'

export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }
  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function isAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

export const adminOnly = [verifyToken, isAdmin]

// Accepts admin password as Bearer token (for frontend admin panel)
export function adminSecret(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' })
  const token = authHeader.split(' ')[1]
  const secret = process.env.ADMIN_SECRET
  if (secret && token === secret) {
    req.user = { role: 'admin' }
    return next()
  }
  if (!secret) {
    console.error('[auth] ADMIN_SECRET env var is not set — admin password auth disabled')
  }
  // Fall back to JWT admin token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admin access required' })
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid credentials' })
  }
}
