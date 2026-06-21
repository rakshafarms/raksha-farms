import { query } from '../config/database.js'

export async function getDashboardStats(req, res) {
  try {
    const [
      todayOrders, todayRevenue, todayUsers, pendingOrders,
      yesterdayOrders, yesterdayRevenue, yesterdayUsers,
      daily, topProducts, recentOrders, statusBreakdown
    ] = await Promise.all([

      // TODAY's orders (all non-cancelled)
      query(`SELECT COUNT(*) AS total FROM orders
             WHERE DATE(created_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE
               AND status NOT IN ('cancelled','rejected')
               AND deleted_at IS NULL`),

      // TODAY's revenue (all non-cancelled orders)
      query(`SELECT COALESCE(SUM(total),0) AS total FROM orders
             WHERE DATE(created_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE
               AND status NOT IN ('cancelled','rejected')
               AND deleted_at IS NULL`),

      // TODAY's unique customers who placed an order
      query(`SELECT COUNT(DISTINCT user_id) AS total FROM orders
             WHERE DATE(created_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE
               AND status NOT IN ('cancelled','rejected')
               AND deleted_at IS NULL`),

      // LIVE pending orders (all time - this is a live work queue)
      query(`SELECT COUNT(*) AS total FROM orders
             WHERE deleted_at IS NULL
               AND status IN ('placed','accepted','preparing','out_for_delivery')`),

      // YESTERDAY orders for delta
      query(`SELECT COUNT(*) AS total FROM orders
             WHERE DATE(created_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE - 1
               AND status NOT IN ('cancelled','rejected')
               AND deleted_at IS NULL`),

      // YESTERDAY revenue for delta
      query(`SELECT COALESCE(SUM(total),0) AS total FROM orders
             WHERE DATE(created_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE - 1
               AND status NOT IN ('cancelled','rejected')
               AND deleted_at IS NULL`),

      // YESTERDAY unique customers for delta
      query(`SELECT COUNT(DISTINCT user_id) AS total FROM orders
             WHERE DATE(created_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE - 1
               AND status NOT IN ('cancelled','rejected')
               AND deleted_at IS NULL`),

      // Last 7 days daily breakdown
      query(`
        SELECT
          TO_CHAR(d.date, 'Mon DD') AS label,
          COALESCE(SUM(o.total), 0) AS revenue,
          COUNT(o.id) AS orders
        FROM generate_series(
          CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day'
        ) AS d(date)
        LEFT JOIN orders o
          ON DATE(o.created_at AT TIME ZONE 'Asia/Kolkata') = d.date
         AND o.status NOT IN ('cancelled','rejected')
         AND o.deleted_at IS NULL
        GROUP BY d.date ORDER BY d.date ASC
      `),

      // Top 5 products — filter out items with non-UUID ids to avoid cast errors
      query(`
        SELECT p.name, p.image_url, p.category,
               COUNT(DISTINCT o.id) AS order_count,
               SUM((item->>'quantity')::int) AS units_sold
        FROM orders o
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE jsonb_typeof(o.items) WHEN 'array' THEN o.items ELSE '[]'::jsonb END
        ) AS item
        LEFT JOIN products p ON p.id::text = item->>'id'
        WHERE o.status NOT IN ('cancelled','rejected')
          AND o.deleted_at IS NULL
          AND p.id IS NOT NULL
          AND (item->>'quantity') ~ '^[0-9]+$'
        GROUP BY p.id, p.name, p.image_url, p.category
        ORDER BY units_sold DESC LIMIT 5
      `),

      // Recent 8 orders
      query(`
        SELECT o.id, o.total, o.status, o.payment_method,
               o.created_at,
               COALESCE(u.name, o.address->>'name') AS customer_name,
               u.email AS customer_email
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        WHERE o.deleted_at IS NULL
        ORDER BY o.created_at DESC LIMIT 8
      `),

      // Status breakdown
      query(`
        SELECT status, COUNT(*) as count
        FROM orders WHERE deleted_at IS NULL GROUP BY status ORDER BY count DESC
      `),
    ])

    const pct = (today, yest) => {
      const t = Number(today), y = Number(yest)
      if (y === 0 && t === 0) return null
      if (y === 0) return 100
      return Math.round(((t - y) / y) * 100)
    }

    res.json({
      kpis: {
        todayOrders:   parseInt(todayOrders.rows[0].total),
        todayRevenue:  parseFloat(todayRevenue.rows[0].total),
        todayCustomers: parseInt(todayUsers.rows[0].total),
        pendingOrders: parseInt(pendingOrders.rows[0].total),
        // Deltas vs yesterday
        ordersChange:   pct(todayOrders.rows[0].total, yesterdayOrders.rows[0].total),
        revenueChange:  pct(todayRevenue.rows[0].total, yesterdayRevenue.rows[0].total),
        customersChange: pct(todayUsers.rows[0].total, yesterdayUsers.rows[0].total),
      },
      dailySales:      daily.rows,
      topProducts:     topProducts.rows,
      recentOrders:    recentOrders.rows,
      statusBreakdown: statusBreakdown.rows,
    })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
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
      LEFT JOIN orders o ON DATE(o.created_at) = d.date AND o.status NOT IN ('cancelled','rejected') AND o.deleted_at IS NULL
      GROUP BY d.date ORDER BY d.date ASC
    `, [period])
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

export async function getCategoryRevenue(req, res) {
  try {
    const { rows } = await query(`
      SELECT
        p.category,
        SUM((item->>'quantity')::int * (item->>'price')::numeric) AS revenue,
        COUNT(DISTINCT o.id) AS orders
      FROM orders o
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE jsonb_typeof(o.items) WHEN 'array' THEN o.items ELSE '[]'::jsonb END
      ) AS item
      LEFT JOIN products p ON p.id::text = item->>'id'
      WHERE o.status NOT IN ('cancelled','rejected')
        AND o.deleted_at IS NULL
        AND p.id IS NOT NULL
        AND (item->>'quantity') ~ '^[0-9]+$'
        AND (item->>'price') ~ '^[0-9]+(\.[0-9]+)?$'
      GROUP BY p.category ORDER BY revenue DESC
    `)
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

export async function getOrderStatusBreakdown(req, res) {
  try {
    const { rows } = await query(`
      SELECT status, COUNT(*) as count,
             COALESCE(SUM(total),0) as revenue
      FROM orders WHERE deleted_at IS NULL GROUP BY status ORDER BY count DESC
    `)
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}
