import { query } from '../config/database.js'

/* ── helpers ── */
function calcDiscount(coupon, orderTotal) {
  const raw = coupon.type === 'percent'
    ? (orderTotal * Number(coupon.value) / 100)
    : Number(coupon.value)
  // Cap percentage coupons at max_discount if set
  const capped = coupon.max_discount ? Math.min(raw, Number(coupon.max_discount)) : raw
  return Math.min(Math.round(capped), orderTotal)
}

/* ── Admin: list all coupons ── */
export async function getCoupons(req, res) {
  try {
    const { rows } = await query(`
      SELECT *, COALESCE(
        CASE WHEN type='percent'
          THEN CONCAT(value, '% off', CASE WHEN max_discount IS NOT NULL THEN CONCAT(' (max ₹', max_discount, ')') ELSE '' END)
          ELSE CONCAT('₹', value, ' off')
        END, '') AS display_label
      FROM coupons ORDER BY created_at DESC
    `)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
}

/* ── Public: available coupons for the current user (hides codes only if private) ── */
export async function getAvailableCoupons(req, res) {
  try {
    const { rows } = await query(`
      SELECT id, code, type, value, min_order, max_discount, expires_at, description, first_order_only,
             max_uses, used_count
      FROM coupons
      WHERE is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
        AND used_count < max_uses
      ORDER BY value DESC
    `)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
}

/* ── Admin: create ── */
export async function createCoupon(req, res) {
  try {
    const { code, type, value, min_order, max_discount, max_uses, expires_at, description, first_order_only } = req.body
    const { rows } = await query(
      `INSERT INTO coupons (code, type, value, min_order, max_discount, max_uses, expires_at, description, first_order_only)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        code.toUpperCase(), type, value,
        min_order   || 0,
        max_discount || null,
        max_uses    || 100,
        expires_at  || null,
        description || null,
        first_order_only === true || first_order_only === 'true',
      ]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Coupon code already exists' })
    res.status(500).json({ error: err.message })
  }
}

/* ── Admin: update ── */
export async function updateCoupon(req, res) {
  try {
    const { type, value, min_order, max_discount, max_uses, expires_at, is_active, description, first_order_only } = req.body
    const { rows } = await query(
      `UPDATE coupons
       SET type=$1, value=$2, min_order=$3, max_discount=$4, max_uses=$5,
           expires_at=$6, is_active=$7, description=$8, first_order_only=$9
       WHERE id=$10 RETURNING *`,
      [
        type, value, min_order,
        max_discount || null,
        max_uses,
        expires_at || null,
        is_active,
        description || null,
        first_order_only === true || first_order_only === 'true',
        req.params.id,
      ]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Coupon not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
}

/* ── Admin: toggle active ── */
export async function toggleCoupon(req, res) {
  try {
    const { rows } = await query(
      `UPDATE coupons SET is_active = NOT is_active WHERE id=$1 RETURNING *`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Coupon not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
}

/* ── Admin: delete ── */
export async function deleteCoupon(req, res) {
  try {
    await query('DELETE FROM coupons WHERE id=$1', [req.params.id])
    res.json({ message: 'Coupon deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

/* ── Public: validate coupon ── */
export async function validateCoupon(req, res) {
  try {
    const { code, order_total, user_id } = req.body
    const { rows } = await query(
      `SELECT * FROM coupons WHERE code=$1 AND is_active=true
       AND (expires_at IS NULL OR expires_at > NOW())
       AND used_count < max_uses`,
      [code.toUpperCase()]
    )
    if (!rows[0]) return res.status(400).json({ error: 'Invalid or expired coupon' })
    const coupon = rows[0]

    if (order_total < Number(coupon.min_order))
      return res.status(400).json({ error: `Minimum order ₹${coupon.min_order} required` })

    // Check first_order_only
    if (coupon.first_order_only && user_id) {
      const prevOrders = await query(
        `SELECT COUNT(*) as cnt FROM orders WHERE user_id=$1 AND status NOT IN ('cancelled','rejected')`,
        [user_id]
      )
      if (parseInt(prevOrders.rows[0].cnt) > 0)
        return res.status(400).json({ error: 'This coupon is valid for first order only' })
    }

    const discount = calcDiscount(coupon, order_total)
    res.json({ valid: true, discount, coupon })
  } catch (err) { res.status(500).json({ error: err.message }) }
}
