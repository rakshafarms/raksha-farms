import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../config/database.js'

// Link any guest orders (user_id IS NULL) that match this user by email or phone.
// Called after login, register, and Google auth so the Customers section in
// admin immediately shows the correct order count / history for that user.
async function linkGuestOrders(userId, email, phone) {
  if (!userId) return
  const digits = (phone || '').replace(/\D/g, '').slice(-10)
  await query(
    `UPDATE orders
     SET user_id = $1, updated_at = NOW()
     WHERE user_id IS NULL
       AND (
         ($2 != '' AND LOWER(address->>'email') = LOWER($2) AND address->>'email' != '')
         OR ($3 != '' AND RIGHT(REGEXP_REPLACE(address->>'phone','\\D','','g'),10) = $3)
       )`,
    [userId, email || '', digits]
  ).catch(() => {})
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  )
}

export async function logout(req, res) {
  // Client discards the token. With 30d expiry, stolen tokens auto-expire.
  res.json({ ok: true })
}

export async function register(req, res) {
  try {
    const { name, email, phone, password } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' })
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()])
    if (existing.rows[0]) return res.status(409).json({ error: 'An account with this email already exists.' })

    const hashed = await bcrypt.hash(password, 10)
    const { rows } = await query(
      `INSERT INTO users (name, email, phone, password, role) VALUES ($1, $2, $3, $4, 'user') RETURNING *`,
      [name.trim(), email.toLowerCase(), phone?.trim() || null, hashed]
    )
    // Link any past guest orders with this email or phone
    await linkGuestOrders(rows[0].id, rows[0].email, rows[0].phone)

    const token = signToken(rows[0])
    res.status(201).json({ token, user: { id: rows[0].id, name: rows[0].name, email: rows[0].email, phone: rows[0].phone, role: rows[0].role } })
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Something went wrong' })
  }
}

export async function login(req, res) {
  try {
    const { email, phone, password } = req.body
    if ((!email && !phone) || !password) return res.status(400).json({ error: 'Email/phone and password required' })

    // Accept login by email or phone
    let rows
    if (email) {
      ({ rows } = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]))
    } else {
      const digits = phone.replace(/\D/g, '').slice(-10)
      ;({ rows } = await query("SELECT * FROM users WHERE RIGHT(REGEXP_REPLACE(phone,'\\D','','g'),10) = $1", [digits]))
    }
    const user = rows[0]
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

    if (user.role !== 'admin' && user.role !== 'user') return res.status(403).json({ error: 'Access denied' })
    if (user.is_active === false) return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' })

    // Link any past guest orders with this email or phone
    await linkGuestOrders(user.id, user.email, user.phone)

    const token = signToken(user)
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone || null, role: user.role } })
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Something went wrong' })
  }
}

// ── Admin-only login — rejects non-admin roles at the server level ─────────────
export async function adminLogin(req, res) {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

    const { rows } = await query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()])
    const user = rows[0]
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

    // Hard reject at server — no token is ever issued to a non-admin here
    if (user.role !== 'admin') return res.status(403).json({ error: 'Access denied: admin accounts only' })

    const token = signToken(user)
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Something went wrong' })
  }
}

export async function me(req, res) {
  try {
    const { rows } = await query(
      'SELECT id, name, email, role, phone FROM users WHERE id = $1',
      [req.user.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'User not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Something went wrong' })
  }
}

// Google OAuth — find-or-create user, return JWT
export async function googleAuth(req, res) {
  try {
    const { credential } = req.body
    if (!credential) return res.status(400).json({ error: 'Google credential required' })

    // Verify token with Google
    const gRes = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${credential}`)
    if (!gRes.ok) return res.status(401).json({ error: 'Invalid Google credential' })
    const payload = await gRes.json()
    if (!payload.email) return res.status(401).json({ error: 'No email in Google token' })
    const expectedAud = process.env.GOOGLE_CLIENT_ID
    if (!expectedAud) return res.status(500).json({ error: 'Server misconfiguration: GOOGLE_CLIENT_ID not set' })
    if (payload.aud !== expectedAud) return res.status(401).json({ error: 'Invalid Google credential' })

    // Find or create user
    let { rows } = await query('SELECT * FROM users WHERE email = $1', [payload.email.toLowerCase()])
    let user = rows[0]
    if (!user) {
      const hashed = await bcrypt.hash(`google_${payload.sub}`, 10)
      const { rows: created } = await query(
        `INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,'user') RETURNING *`,
        [payload.name || payload.email.split('@')[0], payload.email.toLowerCase(), hashed]
      )
      user = created[0]
    } else if (payload.name && payload.name !== user.name && !user.password?.startsWith('$2')) {
      const { rows: updated } = await query(
        `UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [payload.name, user.id]
      )
      if (updated[0]) user = updated[0]
    }

    if (user.is_active === false) return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' })

    // Link any past guest orders that share this email or phone → they become this user's orders immediately
    await linkGuestOrders(user.id, user.email, user.phone)

    const token = signToken(user)
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone || null, role: user.role } })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword required' })
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' })
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id])
    const user = rows[0]
    if (!user) return res.status(404).json({ error: 'User not found' })
    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) return res.status(400).json({ error: 'Current password incorrect' })
    const hashed = await bcrypt.hash(newPassword, 10)
    await query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hashed, req.user.id])
    res.json({ message: 'Password updated' })
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Something went wrong' })
  }
}
