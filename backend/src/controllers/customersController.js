import { query } from '../config/database.js'

export async function getCustomers(req, res) {
  try {
    const { search, status, page = 1, limit = 20 } = req.query
    const pg     = Math.max(1, parseInt(page) || 1)
    const lim    = Math.min(100, parseInt(limit) || 20)
    const offset = (pg - 1) * lim

    // ── Build WHERE clauses ──────────────────────────────────────────────────
    const regParams   = []  // params for registered users query
    const guestParams = []  // params for guest query

    let regWhere   = `WHERE u.role = 'user'`
    let guestWhere = `WHERE o.user_id IS NULL AND (o.address->>'phone') IS NOT NULL AND (o.address->>'phone') != ''`

    if (search) {
      regParams.push(`%${search}%`)
      regWhere += ` AND (
        u.name  ILIKE $${regParams.length} OR
        u.email ILIKE $${regParams.length} OR
        u.phone ILIKE $${regParams.length} OR
        EXISTS (
          SELECT 1 FROM orders ox
          WHERE ox.user_id = u.id
            AND (ox.address->>'phone') ILIKE $${regParams.length}
          LIMIT 1
        )
      )`

      guestParams.push(`%${search}%`)
      guestWhere += ` AND (
        (o.address->>'name')  ILIKE $${guestParams.length} OR
        (o.address->>'phone') ILIKE $${guestParams.length} OR
        (o.address->>'email') ILIKE $${guestParams.length}
      )`
    }
    if (status === 'active')  { regWhere += ` AND u.is_active = true`;  guestWhere += ` AND 1=1` }
    if (status === 'blocked') { regWhere += ` AND u.is_active = false`; guestWhere += ` AND 1=2` } // guests can't be blocked

    // ── Registered users ─────────────────────────────────────────────────────
    // For Google-login users whose profile phone is NULL, fall back to the
    // phone stored in their most recent order's address JSON.
    const regSql = `
      SELECT
        u.id::text                          AS id,
        u.name,
        u.email,
        COALESCE(
          NULLIF(u.phone, ''),
          (SELECT o2.address->>'phone'
           FROM orders o2
           WHERE o2.user_id = u.id
             AND (o2.address->>'phone') IS NOT NULL
             AND (o2.address->>'phone') != ''
           ORDER BY o2.created_at DESC
           LIMIT 1)
        )                                   AS phone,
        u.is_active,
        u.created_at,
        'registered'                        AS customer_type,
        COUNT(o.id)::int                    AS total_orders,
        COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled','rejected') THEN o.total ELSE 0 END), 0)::numeric AS total_spent,
        MAX(o.created_at)                   AS last_order_at,
        COUNT(CASE WHEN o.status = 'delivered' THEN 1 END)::int AS delivered_orders
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      ${regWhere}
      GROUP BY u.id
    `

    // ── Guest customers (ordered but no account) ──────────────────────────────
    // Dedup by phone number; use earliest order as "joined" date
    const guestSql = `
      SELECT
        NULL::text                                          AS id,
        MAX(o.address->>'name')                             AS name,
        MAX(o.address->>'email')                            AS email,
        (o.address->>'phone')                               AS phone,
        true                                                AS is_active,
        MIN(o.created_at)                                   AS created_at,
        'guest'                                             AS customer_type,
        COUNT(o.id)::int                                    AS total_orders,
        COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled','rejected') THEN o.total ELSE 0 END), 0)::numeric AS total_spent,
        MAX(o.created_at)                                   AS last_order_at,
        COUNT(CASE WHEN o.status = 'delivered' THEN 1 END)::int AS delivered_orders
      FROM orders o
      ${guestWhere}
      GROUP BY (o.address->>'phone')
    `

    // Skip guest query when filtering for 'blocked' (guests can never be blocked)
    const includeGuests = status !== 'blocked'

    // ── UNION, paginate, and count in one shot ────────────────────────────────
    const unionSql = includeGuests
      ? `(${regSql}) UNION ALL (${guestSql})`
      : regSql

    const allParams = includeGuests ? [...regParams, ...guestParams] : regParams

    // Total count
    const cntResult = await query(
      `SELECT COUNT(*) FROM (${unionSql}) AS combined`,
      allParams
    )
    const totalCount = parseInt(cntResult.rows[0].count)

    // Paginated data — sort: registered first (most recent), then guests
    const dataResult = await query(
      `SELECT * FROM (${unionSql}) AS combined
       ORDER BY customer_type = 'registered' DESC, last_order_at DESC NULLS LAST
       LIMIT $${allParams.length + 1} OFFSET $${allParams.length + 2}`,
      [...allParams, lim, offset]
    )

    // Overall stats (registered users only for total/active/blocked)
    const statsResult = await query(
      `SELECT
         COUNT(*)                                    AS total,
         COUNT(*) FILTER (WHERE is_active = true)   AS active,
         COUNT(*) FILTER (WHERE is_active = false)  AS blocked
       FROM users WHERE role='user'`
    )

    res.json({
      customers: dataResult.rows,
      total:  totalCount,
      pages:  Math.ceil(totalCount / lim),
      stats:  statsResult.rows[0],
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

// Orders for a registered user (by UUID)
export async function getCustomerOrders(req, res) {
  try {
    const { rows } = await query(
      `SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
}

// Orders for a guest customer (by phone number)
export async function getGuestOrders(req, res) {
  try {
    const phone = decodeURIComponent(req.params.phone).replace(/\D/g, '').slice(-10)
    if (phone.length < 6) return res.status(400).json({ error: 'Invalid phone' })
    const { rows } = await query(
      `SELECT * FROM orders
       WHERE user_id IS NULL AND (address->>'phone') LIKE $1
       ORDER BY created_at DESC LIMIT 50`,
      [`%${phone}`]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function toggleCustomerStatus(req, res) {
  try {
    const { rows } = await query(
      'UPDATE users SET is_active = NOT is_active WHERE id=$1 RETURNING id, is_active',
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Customer not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
}
