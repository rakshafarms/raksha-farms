import { query } from '../config/database.js'

export async function getCustomers(req, res) {
  try {
    const { search, status, page = 1, limit = 20 } = req.query
    const pg     = Math.max(1, parseInt(page) || 1)
    const lim    = Math.min(100, parseInt(limit) || 20)
    const offset = (pg - 1) * lim

    const regParams   = []
    const guestParams = []

    let regWhere   = `WHERE u.role = 'user'`
    // Exclude guests whose email matches a registered user (they are NOT duplicates —
    // after our linkGuestOrders fix they'll be linked by user_id, but keep the
    // exclusion here for belt-and-suspenders).
    let guestWhere = `
      WHERE o.user_id IS NULL
        AND (o.address->>'phone') IS NOT NULL
        AND (o.address->>'phone') != ''
        AND (
          (o.address->>'email') IS NULL
          OR (o.address->>'email') = ''
          OR NOT EXISTS (
            SELECT 1 FROM users eu
            WHERE LOWER(eu.email) = LOWER(o.address->>'email')
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM users pu
          WHERE pu.phone IS NOT NULL AND pu.phone != ''
            AND RIGHT(REGEXP_REPLACE(pu.phone,'\\D','','g'),10)
                = RIGHT(REGEXP_REPLACE(o.address->>'phone','\\D','','g'),10)
        )`

    if (search) {
      regParams.push(`%${search}%`)
      regWhere += ` AND (
        u.name  ILIKE $${regParams.length} OR
        u.email ILIKE $${regParams.length} OR
        u.phone ILIKE $${regParams.length} OR
        EXISTS (
          SELECT 1 FROM orders ox
          WHERE (ox.user_id = u.id OR LOWER(ox.address->>'email') = LOWER(u.email))
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
    if (status === 'active')  { regWhere += ` AND u.is_active = true` }
    if (status === 'blocked') { regWhere += ` AND u.is_active = false` }
    // guests are never blocked — skip guest UNION entirely when filtering blocked
    const includeGuests = status !== 'blocked'

    // ── Registered users ─────────────────────────────────────────────────────
    // Join on user_id OR matching email OR matching phone (catches edge-case orders
    // placed while not fully logged in — linkGuestOrders handles most of these at
    // login time, but this covers any that slip through before the next login).
    const regSql = `
      SELECT
        u.id::text   AS id,
        u.name,
        u.email,
        COALESCE(
          NULLIF(u.phone, ''),
          (SELECT o2.address->>'phone'
           FROM orders o2
           WHERE (o2.user_id = u.id
                  OR (o2.user_id IS NULL AND LOWER(o2.address->>'email') = LOWER(u.email) AND u.email != '' AND o2.address->>'email' != '')
                  OR (o2.user_id IS NULL AND u.phone IS NOT NULL AND u.phone != ''
                      AND RIGHT(REGEXP_REPLACE(o2.address->>'phone','\\D','','g'),10) = RIGHT(REGEXP_REPLACE(u.phone,'\\D','','g'),10)))
             AND (o2.address->>'phone') IS NOT NULL
             AND (o2.address->>'phone') != ''
           ORDER BY o2.created_at DESC
           LIMIT 1)
        )            AS phone,
        u.is_active,
        u.created_at,
        'registered' AS customer_type,
        COUNT(DISTINCT o.id)::int   AS total_orders,
        COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled','rejected')
                          THEN o.total ELSE 0 END), 0)::numeric AS total_spent,
        MAX(o.created_at)           AS last_order_at,
        COUNT(DISTINCT CASE WHEN o.status = 'delivered' THEN o.id END)::int AS delivered_orders
      FROM users u
      LEFT JOIN orders o
        ON o.user_id = u.id
        OR (o.user_id IS NULL AND LOWER(o.address->>'email') = LOWER(u.email) AND u.email != '' AND o.address->>'email' != '')
        OR (o.user_id IS NULL AND u.phone IS NOT NULL AND u.phone != ''
            AND RIGHT(REGEXP_REPLACE(o.address->>'phone','\\D','','g'),10) = RIGHT(REGEXP_REPLACE(u.phone,'\\D','','g'),10))
      ${regWhere}
      GROUP BY u.id
    `

    // ── Guest customers — ordered but no account (and no matching registered email) ──
    const guestSql = `
      SELECT
        NULL::text                          AS id,
        MAX(o.address->>'name')             AS name,
        MAX(o.address->>'email')            AS email,
        (o.address->>'phone')               AS phone,
        true                                AS is_active,
        MIN(o.created_at)                   AS created_at,
        'guest'                             AS customer_type,
        COUNT(o.id)::int                    AS total_orders,
        COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled','rejected')
                     THEN o.total ELSE 0 END), 0)::numeric AS total_spent,
        MAX(o.created_at)                   AS last_order_at,
        COUNT(CASE WHEN o.status = 'delivered' THEN 1 END)::int AS delivered_orders
      FROM orders o
      ${guestWhere}
      GROUP BY (o.address->>'phone')
    `

    const unionSql = includeGuests
      ? `(${regSql}) UNION ALL (${guestSql})`
      : regSql

    const allParams = includeGuests ? [...regParams, ...guestParams] : regParams

    const [cntResult, dataResult, statsResult] = await Promise.all([
      query(`SELECT COUNT(*) FROM (${unionSql}) AS combined`, allParams),
      query(
        `SELECT * FROM (${unionSql}) AS combined
         ORDER BY customer_type = 'registered' DESC, last_order_at DESC NULLS LAST
         LIMIT $${allParams.length + 1} OFFSET $${allParams.length + 2}`,
        [...allParams, lim, offset]
      ),
      query(
        `SELECT
           COUNT(*)                                   AS total,
           COUNT(*) FILTER (WHERE is_active = true)  AS active,
           COUNT(*) FILTER (WHERE is_active = false) AS blocked
         FROM users WHERE role='user'`
      ),
    ])

    res.json({
      customers: dataResult.rows,
      total:  parseInt(cntResult.rows[0].count),
      pages:  Math.ceil(parseInt(cntResult.rows[0].count) / lim),
      stats:  statsResult.rows[0],
    })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// Orders for a registered user — by user_id OR matching email
export async function getCustomerOrders(req, res) {
  try {
    const { rows: userRows } = await query('SELECT email FROM users WHERE id=$1', [req.params.id])
    const email = userRows[0]?.email || ''
    const { rows } = await query(
      `SELECT * FROM orders
       WHERE user_id = $1
          OR (user_id IS NULL AND LOWER(address->>'email') = LOWER($2) AND $2 != '' AND address->>'email' != '')
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.params.id, email]
    )
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// Orders for a guest customer — by phone
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
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

export async function toggleCustomerStatus(req, res) {
  try {
    const { rows } = await query(
      'UPDATE users SET is_active = NOT is_active WHERE id=$1 RETURNING id, is_active',
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Customer not found' })
    res.json(rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight customer autocomplete for the Billing / POS page.
//
// GET /api/customers/search?q=...&limit=8
//
// Searches BOTH registered users (`users` table) AND guest customers
// (anyone whose phone appears on a guest order) so the admin can autofill
// any existing customer — not just registered ones. Returns a slim payload
// (id, name, phone, email) so the dropdown is snappy.
// ─────────────────────────────────────────────────────────────────────────────
export async function searchCustomers(req, res) {
  try {
    const raw = String(req.query.q || '').trim()
    const lim = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 8))
    if (raw.length < 2) return res.json([])   // need at least 2 chars to avoid huge result sets

    const like = `%${raw}%`
    // Digits-only version of the query — used for phone matching so "98765"
    // matches "+91 98765 43210" the same as "9876543210"
    const digits = raw.replace(/\D/g, '')

    // Registered users — search across name / email / phone
    const usersSql = `
      SELECT u.id::text AS id,
             u.name,
             COALESCE(NULLIF(u.phone,''), '') AS phone,
             u.email,
             'user' AS source
      FROM users u
      WHERE u.role = 'user' AND u.is_active = true
        AND (
          u.name  ILIKE $1
          OR u.email ILIKE $1
          OR ($2 != '' AND RIGHT(REGEXP_REPLACE(COALESCE(u.phone,''),'\\D','','g'),10) ILIKE '%' || $2 || '%')
        )
      ORDER BY u.updated_at DESC NULLS LAST
      LIMIT $3
    `
    const { rows: userRows } = await query(usersSql, [like, digits, lim])

    // Guest customers — distinct (name, phone) pairs from orders not linked to a user.
    // We dedupe by digits-only phone so the same person doesn't appear twice with
    // different phone formats. We also only return guests whose phone isn't already
    // in the users list (otherwise they'd be a duplicate of a registered user).
    const guestsSql = `
      SELECT DISTINCT ON (digits_phone)
        NULL::text AS id,
        COALESCE(NULLIF(o.address->>'name',''), 'Guest') AS name,
        o.address->>'phone' AS phone,
        COALESCE(o.address->>'email','') AS email,
        'guest' AS source,
        RIGHT(REGEXP_REPLACE(o.address->>'phone','\\D','','g'),10) AS digits_phone,
        MAX(o.created_at) OVER (PARTITION BY RIGHT(REGEXP_REPLACE(o.address->>'phone','\\D','','g'),10)) AS last_order
      FROM orders o
      WHERE o.user_id IS NULL
        AND o.address->>'phone' IS NOT NULL
        AND o.address->>'phone' != ''
        AND (
          (o.address->>'name')  ILIKE $1
          OR (o.address->>'phone') ILIKE $1
          OR (o.address->>'email') ILIKE $1
          OR ($2 != '' AND RIGHT(REGEXP_REPLACE(o.address->>'phone','\\D','','g'),10) ILIKE '%' || $2 || '%')
        )
        AND NOT EXISTS (
          SELECT 1 FROM users u2
          WHERE u2.phone IS NOT NULL AND u2.phone != ''
            AND RIGHT(REGEXP_REPLACE(u2.phone,'\\D','','g'),10)
                = RIGHT(REGEXP_REPLACE(o.address->>'phone','\\D','','g'),10)
        )
      ORDER BY digits_phone, last_order DESC NULLS LAST
      LIMIT $3
    `
    const { rows: guestRows } = await query(guestsSql, [like, digits, lim])

    // Merge — registered users first, then guests up to the limit
    const merged = [...userRows, ...guestRows]
      .filter(r => r.name || r.phone)
      .slice(0, lim)
      .map(r => ({ id: r.id, name: r.name, phone: r.phone, email: r.email, source: r.source }))

    res.json(merged)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}
