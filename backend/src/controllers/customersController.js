import { query } from '../config/database.js'

export async function getCustomers(req, res) {
  try {
    const { search, status, page = 1, limit = 20 } = req.query
    const pg     = Math.max(1, parseInt(page) || 1)
    const lim    = Math.min(100, parseInt(limit) || 20)
    const offset = (pg - 1) * lim

    const filterParams = []
    let where = `WHERE u.role = 'user'`

    if (search) {
      filterParams.push(`%${search}%`)
      where += ` AND (u.name ILIKE $${filterParams.length} OR u.email ILIKE $${filterParams.length} OR u.phone ILIKE $${filterParams.length})`
    }
    if (status === 'active')  where += ` AND u.is_active = true`
    if (status === 'blocked') where += ` AND u.is_active = false`

    const [rows, cnt, stats] = await Promise.all([
      query(`
        SELECT u.id, u.name, u.email, u.phone, u.is_active, u.created_at,
               COUNT(o.id)                                     AS total_orders,
               COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled','rejected') THEN o.total ELSE 0 END), 0) AS total_spent,
               MAX(o.created_at)                               AS last_order_at,
               COUNT(CASE WHEN o.status = 'delivered' THEN 1 END) AS delivered_orders
        FROM users u
        LEFT JOIN orders o ON o.user_id = u.id
        ${where}
        GROUP BY u.id
        ORDER BY u.created_at DESC
        LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}
      `, [...filterParams, lim, offset]),
      query(`SELECT COUNT(*) FROM users u ${where}`, filterParams),
      query(`SELECT
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE is_active = true)  AS active,
               COUNT(*) FILTER (WHERE is_active = false) AS blocked
             FROM users WHERE role='user'`),
    ])

    res.json({
      customers: rows.rows,
      total:  parseInt(cnt.rows[0].count),
      pages:  Math.ceil(parseInt(cnt.rows[0].count) / lim),
      stats:  stats.rows[0],
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function getCustomerOrders(req, res) {
  try {
    const { rows } = await query(
      `SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
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
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
}
