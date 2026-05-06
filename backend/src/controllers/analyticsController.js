import { query } from '../config/database.js'

export async function getDashboardStats(req, res) {
  try {
    const [orders, revenue, users, pending, daily, topProducts, statusBreakdown, paymentMethods] = await Promise.all([
      query(`SELECT COUNT(*) as total FROM orders`),
      query(`SELECT COALESCE(SUM(total),0) as total FROM orders WHERE status='delivered'`),
      query(`SELECT COUNT(*) as total FROM users WHERE role='user'`),
      query(`SELECT COUNT(*) as total FROM orders WHERE status IN ('placed','accepted','preparing','out_for_delivery')`),
      query(`
        SELECT
          TO_CHAR(d.date, 'Mon DD') AS label,
          COALESCE(SUM(o.total), 0) AS revenue,
          COUNT(o.id) AS orders
        FROM generate_series(
          CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day'
        ) AS d(date)
        LEFT JOIN orders o ON DATE(o.created_at) = d.date AND o.status NOT IN ('cancelled','rejected')
        GROUP BY d.date ORDER BY d.date ASC
      `),
      query(`
        SELECT p.name, p.image_url, p.category,
               COUNT(DISTINCT o.id) AS order_count,
               SUM((item->>'quantity')::int) AS units_sold
        FROM orders o
        CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
        JOIN products p ON p.id = (item->>'id')::uuid
        WHERE o.status NOT IN ('cancelled','rejected')
        GROUP BY p.id ORDER BY units_sold DESC LIMIT 5
      `),
      query(`
        SELECT status, COUNT(*) as count
        FROM orders GROUP BY status ORDER BY count DESC
      `),
      query(`
        SELECT payment_method, COUNT(*) as count,
               COALESCE(SUM(total),0) as revenue
        FROM orders WHERE status NOT IN ('cancelled','rejected')
        GROUP BY payment_method
      `),
    ])

    res.json({
      kpis: {
        totalOrders:   parseInt(orders.rows[0].total),
        totalRevenue:  parseFloat(revenue.rows[0].total),
        activeUsers:   parseInt(users.rows[0].total),
        pendingOrders: parseInt(pending.rows[0].total),
      },
      dailySales:      daily.rows,
      topProducts:     topProducts.rows,
      statusBreakdown: statusBreakdown.rows,
      paymentMethods:  paymentMethods.rows,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function getSalesAnalytics(req, res) {
  try {
    const { period = '30' } = req.query
    const { rows } = await query(`
      SELECT
        TO_CHAR(d.date, 'Mon DD') AS label,
        COALESCE(SUM(o.total), 0)  AS revenue,
        COUNT(o.id)                AS orders,
        COALESCE(AVG(o.total), 0)  AS avg_order_value
      FROM generate_series(
        CURRENT_DATE - ($1 || ' days')::interval, CURRENT_DATE, '1 day'
      ) AS d(date)
      LEFT JOIN orders o ON DATE(o.created_at) = d.date AND o.status NOT IN ('cancelled','rejected')
      GROUP BY d.date ORDER BY d.date ASC
    `, [period])
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function getCategoryRevenue(req, res) {
  try {
    const { rows } = await query(`
      SELECT
        p.category,
        SUM((item->>'quantity')::int * (item->>'price')::numeric) AS revenue,
        COUNT(DISTINCT o.id) AS orders
      FROM orders o
      CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
      JOIN products p ON p.id = (item->>'id')::uuid
      WHERE o.status NOT IN ('cancelled','rejected')
      GROUP BY p.category ORDER BY revenue DESC
    `)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function getOrderStatusBreakdown(req, res) {
  try {
    const { rows } = await query(`
      SELECT status, COUNT(*) as count,
             COALESCE(SUM(total),0) as revenue
      FROM orders GROUP BY status ORDER BY count DESC
    `)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
}
