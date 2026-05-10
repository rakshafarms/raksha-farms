import { query } from '../config/database.js'
import pool from '../config/database.js'

const VALID_STATUSES = ['placed','accepted','preparing','out_for_delivery','delivered','cancelled','rejected']

// Server-side delivery fee — reads from DB settings (cached for 60s)
let _feeCache = null
let _feeCacheAt = 0
async function getDeliverySettings() {
  const now = Date.now()
  if (_feeCache && now - _feeCacheAt < 60_000) return _feeCache
  try {
    const { rows } = await query(
      `SELECT key, value FROM store_settings WHERE key IN ('free_delivery_threshold','delivery_fee_standard','delivery_fee_express')`
    )
    const s = {}
    for (const r of rows) s[r.key] = parseFloat(r.value)
    _feeCache = {
      threshold: s.free_delivery_threshold ?? 500,
      standard:  s.delivery_fee_standard   ?? 30,
      express:   s.delivery_fee_express    ?? 60,
    }
    _feeCacheAt = now
  } catch {
    _feeCache = { threshold: 500, standard: 30, express: 60 }
  }
  return _feeCache
}

async function calcDeliveryFee(subtotal, deliverySlot) {
  const { threshold, standard, express } = await getDeliverySettings()
  if (subtotal >= threshold) return 0
  return deliverySlot === 'express' ? express : standard
}

// ── Helper: safely parse previously rejected items from order notes ─────────
function getPrevRejectedIds(ord) {
  try {
    const p = typeof ord.notes === 'string' ? JSON.parse(ord.notes) : ord.notes
    return new Set((p?.rejected_items || []).map(r => r.id).filter(Boolean))
  } catch { return new Set() }
}

export async function createOrder(req, res) {
  const client = await pool.connect()
  try {
    const { customer, items, subtotal, deliveryFee, total, paymentMethod, deliverySlot, notes, referenceId, subscription_plan_id, coupon_code } = req.body
    if (!items?.length || !total) return res.status(400).json({ error: 'items and total are required' })

    await client.query('BEGIN')

    // Bug 2: calculate delivery fee server-side — client value is ignored
    let serverSubtotal = 0
    const validatedItems = []

    for (const item of items) {
      if (!item.id) continue

      // Bug 1: reject zero / negative / non-numeric quantities
      const qty = Math.floor(Number(item.quantity))
      if (!qty || qty < 1) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: `Invalid quantity for "${item.name}". Must be a positive whole number.` })
      }

      // ── FIX BUG 1: Atomic stock check + deduct in one statement ──────────────
      // SELECT FOR UPDATE locks the row so no concurrent transaction can read
      // stale stock between our check and our update.
      const { rows: pRows } = await client.query(
        'SELECT id, name, price, offer_price, stock, unit, variants, is_active FROM products WHERE id=$1 FOR UPDATE',
        [item.id]
      )
      const prod = pRows[0]

      if (!prod || !prod.is_active) {
        // Skip products that no longer exist or are inactive — don't fail the whole order
        continue
      }

      // ── FIX BUG 2: Resolve variant price/unit before falling back to base ────
      const variants = Array.isArray(prod.variants)
        ? prod.variants
        : (() => { try { return JSON.parse(prod.variants || '[]') } catch { return [] } })()

      let serverPrice
      let serverUnit = prod.unit

      if (variants.length && item.unit) {
        const variant = variants.find(v => v.label === item.unit)
        if (variant) {
          serverPrice = Number(variant.price)
          serverUnit  = variant.label
        }
      }
      // Fallback: base product price (offer_price takes precedence)
      if (!serverPrice) {
        serverPrice = prod.offer_price && Number(prod.offer_price) > 0
          ? Number(prod.offer_price)
          : Number(prod.price)
      }

      // ── FIX BUG 1 (continued): Atomic deduct with WHERE stock >= qty ─────────
      // If stock was already taken by a concurrent order, rowCount === 0 → reject.
      const { rowCount } = await client.query(
        `UPDATE products
         SET stock = stock - $1, updated_at = NOW()
         WHERE id = $2 AND stock >= $1`,
        [qty, item.id]
      )
      if (rowCount === 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: `Insufficient stock for "${prod.name}". Please reduce quantity and try again.` })
      }

      await client.query(
        `INSERT INTO inventory_logs (product_id, change, reason) VALUES ($1,$2,'order_placed')`,
        [item.id, -qty]
      ).catch(() => {})

      serverSubtotal += serverPrice * qty
      validatedItems.push({ ...item, quantity: qty, price: serverPrice, unit: serverUnit })
    }

    // Guard: all items were skipped (unavailable / deleted products)
    if (validatedItems.length === 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'None of the items in your cart are currently available. Please update your cart and try again.' })
    }

    // ── Build order ───────────────────────────────────────────────────────────
    // Bug 2: server-computed delivery fee; client value ignored
    const serverDeliveryFee = await calcDeliveryFee(serverSubtotal, deliverySlot)

    // Bug 3: apply subscription plan discount server-side
    let subscriptionDiscount = 0
    let resolvedPlan = null
    if (subscription_plan_id) {
      const { rows: planRows } = await client.query('SELECT * FROM subscription_plans WHERE id=$1', [subscription_plan_id])
      resolvedPlan = planRows[0]
      if (!resolvedPlan) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Subscription plan not found.' })
      }
      if (resolvedPlan.discount_percent > 0) {
        subscriptionDiscount = Math.round(serverSubtotal * resolvedPlan.discount_percent / 100)
      }
    }

    // Bug 4 + 5 + 6: validate coupon server-side, apply discount, only count usage if valid
    let couponDiscount = 0
    if (coupon_code) {
      const { rows: cRows } = await client.query(
        `SELECT * FROM coupons WHERE code=$1 AND is_active=true
           AND (expires_at IS NULL OR expires_at > NOW())
           AND used_count < max_uses`,
        [coupon_code.toUpperCase()]
      )
      const coupon = cRows[0]
      let couponValid = !!(coupon && serverSubtotal >= Number(coupon.min_order || 0))
      // Re-check first_order_only here (validateCoupon checks too, but a direct
      // POST to /api/orders could otherwise bypass that gate).
      if (couponValid && coupon.first_order_only) {
        const userIdForCheck = req.user?.id
        const emailForCheck  = (customer?.email || req.user?.email || '').toLowerCase()
        if (userIdForCheck || emailForCheck) {
          const { rows: prior } = await client.query(
            `SELECT 1 FROM orders
             WHERE status NOT IN ('cancelled','rejected')
               AND ($1::uuid IS NOT NULL AND user_id = $1
                    OR $2 <> '' AND LOWER(address->>'email') = $2)
             LIMIT 1`,
            [userIdForCheck || null, emailForCheck]
          ).catch(() => ({ rows: [] }))
          if (prior.length > 0) couponValid = false
        }
      }
      if (couponValid) {
        const raw = coupon.type === 'percent'
          ? (serverSubtotal * Number(coupon.value) / 100)
          : Number(coupon.value)
        // Respect max_discount cap for percentage coupons
        const capped = coupon.max_discount ? Math.min(raw, Number(coupon.max_discount)) : raw
        couponDiscount = Math.min(Math.round(capped), serverSubtotal)
      }
      // used_count only incremented after discount is confirmed valid (below, after order insert)
    }

    const discountedSubtotal = Math.max(0, serverSubtotal - subscriptionDiscount - couponDiscount)
    const serverTotal        = discountedSubtotal + serverDeliveryFee

    const emailForAddress = req.user?.email || customer?.email || ''
    const address = {
      name:    customer?.name    || '',
      phone:   customer?.phone   || '',
      address: customer?.address || '',
      notes:   customer?.notes   || notes || '',
      slot:    deliverySlot      || '',
      email:   emailForAddress,
    }

    let userId = req.user?.id || null
    if (!userId && customer?.email) {
      const { rows: u } = await client.query('SELECT id FROM users WHERE email=$1', [customer.email.toLowerCase()]).catch(() => ({ rows: [] }))
      if (u[0]) userId = u[0].id
    }

    // Generate a guest-friendly reference_id server-side (IST). Client-supplied
    // values are still accepted for backward compat, but new clients no longer send.
    const finalReferenceId = referenceId || (() => {
      const now = new Date(Date.now() + 5.5 * 3600 * 1000)
      const dd  = String(now.getUTCDate()).padStart(2,'0')
      const mm  = String(now.getUTCMonth()+1).padStart(2,'0')
      const yy  = String(now.getUTCFullYear()).slice(-2)
      const hh  = String(now.getUTCHours()).padStart(2,'0')
      const mi  = String(now.getUTCMinutes()).padStart(2,'0')
      const ss  = String(now.getUTCSeconds()).padStart(2,'0')
      const rnd = Math.floor(Math.random() * 9000 + 1000)
      return `RF-${dd}${mm}${yy}-${hh}${mi}${ss}-${rnd}`
    })()

    const { rows } = await client.query(
      `INSERT INTO orders (user_id, items, subtotal, delivery_fee, total, status, payment_method, address, notes, reference_id)
       VALUES ($1, $2, $3, $4, $5, 'placed', $6, $7, $8, $9) RETURNING *`,
      [
        userId,
        JSON.stringify(validatedItems),
        discountedSubtotal,
        serverDeliveryFee,
        serverTotal,
        paymentMethod || 'cod',
        JSON.stringify(address),
        customer?.notes || notes || '',
        finalReferenceId,
      ]
    )
    const order = rows[0]

    // ── Subscription creation — fatal: if sub creation fails, roll back the whole order ──
    if (resolvedPlan) {
      if (!userId) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'You must be logged in to create a subscription.' })
      }
      // Same-day delivery if order placed before 3 PM IST; otherwise next day
      const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
      const cutoffHour = 15 // 3 PM IST
      const startToday = nowIST.getHours() < cutoffHour
      const deliveryDate = new Date(nowIST)
      if (!startToday) deliveryDate.setDate(deliveryDate.getDate() + 1)
      const pad = n => String(n).padStart(2, '0')
      const nextDeliveryStr = `${deliveryDate.getFullYear()}-${pad(deliveryDate.getMonth()+1)}-${pad(deliveryDate.getDate())}`
      await client.query(
        `INSERT INTO subscriptions (user_id, plan_id, items, price_per_cycle, frequency, next_delivery, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        // Bug 3: store discounted price per cycle, not raw serverSubtotal
        [userId, resolvedPlan.id, JSON.stringify(validatedItems), discountedSubtotal, resolvedPlan.frequency, nextDeliveryStr]
      )
    }

    // Bug 5: increment used_count only when discount was actually applied
    if (coupon_code && couponDiscount > 0) {
      await client.query(
        `UPDATE coupons SET used_count = used_count + 1
         WHERE code = $1 AND is_active = true AND used_count < max_uses
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [coupon_code.toUpperCase()]
      ).catch(() => {})
    }

    await client.query('COMMIT')
    res.status(201).json(order)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
}

export async function getOrders(req, res) {
  try {
    const { status, page = 1, limit = 20, search, from_date, to_date } = req.query
    const pg     = Math.max(1, parseInt(page)  || 1)
    const lim    = Math.min(100, parseInt(limit) || 20)
    const offset = (pg - 1) * lim

    const filterParams = []
    let where = `WHERE 1=1`

    if (status) {
      filterParams.push(status)
      where += ` AND o.status=$${filterParams.length}`
    }
    if (search) {
      filterParams.push(`%${search}%`)
      const p = filterParams.length
      where += ` AND (
        u.name           ILIKE $${p}
        OR u.phone       ILIKE $${p}
        OR u.email       ILIKE $${p}
        OR o.reference_id ILIKE $${p}
        OR o.address->>'phone' ILIKE $${p}
        OR o.address->>'name'  ILIKE $${p}
      )`
    }
    // IST-aware date range: cast stored UTC timestamptz → IST date, compare against input date string
    if (from_date) {
      filterParams.push(from_date)
      where += ` AND (o.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $${filterParams.length}::date`
    }
    if (to_date) {
      filterParams.push(to_date)
      where += ` AND (o.created_at AT TIME ZONE 'Asia/Kolkata')::date <= $${filterParams.length}::date`
    }

    const baseSql = `
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ${where}
    `

    const countSql = `SELECT COUNT(*) ${baseSql}`
    const dataSql  = `
      SELECT o.*,
             u.name  AS customer_name,
             u.email AS customer_email,
             u.phone AS customer_phone
      ${baseSql}
      ORDER BY o.created_at DESC
      LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}
    `

    const [cntResult, dataResult] = await Promise.all([
      query(countSql, filterParams),
      query(dataSql,  [...filterParams, lim, offset]),
    ])

    res.json({
      orders: dataResult.rows,
      total:  parseInt(cntResult.rows[0].count),
      page:   pg,
      pages:  Math.ceil(parseInt(cntResult.rows[0].count) / lim),
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function getOrder(req, res) {
  try {
    const { rows } = await query(
      `SELECT o.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone
       FROM orders o LEFT JOIN users u ON o.user_id=u.id WHERE o.id=$1`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Order not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
}

// Run a query inside a SAVEPOINT so a failure rolls back only that step,
// not the whole transaction. Use this for non-critical side-effects like
// stock updates and inventory logs where we never want to abort the transaction.
async function safeQuery(client, sql, params) {
  try {
    await client.query('SAVEPOINT sq')
    await client.query(sql, params)
    await client.query('RELEASE SAVEPOINT sq')
  } catch (e) {
    // Roll back only this sub-step — the outer transaction stays alive
    await client.query('ROLLBACK TO SAVEPOINT sq').catch(() => {})
    console.warn('safeQuery skipped (non-fatal):', e.message)
  }
}

export async function updateOrderStatus(req, res) {
  const client = await pool.connect()
  try {
    const { status, rejection_notes, rejected_items, delivery_time } = req.body
    if (!VALID_STATUSES.includes(status))
      return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` })

    await client.query('BEGIN')

    // Lock the order row to prevent concurrent status updates
    const { rows: existing } = await client.query(
      'SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id]
    )
    if (!existing[0]) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Order not found' })
    }

    const ord = existing[0]

    if (ord.status === 'delivered') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Delivered orders cannot be changed.' })
    }

    // Parse full items list
    const fullItems = (() => {
      try { return Array.isArray(ord.items) ? ord.items : JSON.parse(ord.items || '[]') }
      catch { return [] }
    })()

    const prevRejectedIds = getPrevRejectedIds(ord)

    let notesPayload = ord.notes || ''
    let newTotal = null

    // ── Handle partial / full rejection ────────────────────────────────────
    if (rejected_items?.length) {
      const enriched = rejected_items.map(ri => {
        const found = fullItems.find(fi => fi.id === ri.id || fi.name === ri.name)
        return {
          id:       ri.id       || found?.id,
          name:     ri.name     || found?.name,
          quantity: ri.quantity ?? found?.quantity ?? 1,
          unit:     found?.unit  || '',
          emoji:    found?.emoji || '',
          price:    found?.price ?? ri.price ?? 0,
        }
      })

      const rejectedAmount = enriched.reduce((s, ri) => s + ri.price * ri.quantity, 0)
      const originalTotal  = Number(ord.total)
      const deliveryFee    = Number(ord.delivery_fee || 0)
      const allRejected    = enriched.length >= fullItems.length
      const adjustedTotal  = allRejected ? 0 : Math.max(deliveryFee, originalTotal - rejectedAmount)

      newTotal = adjustedTotal
      notesPayload = JSON.stringify({
        remarks:         rejection_notes || '',
        rejected_items:  enriched,
        original_total:  originalTotal,
        rejected_amount: rejectedAmount,
        adjusted_total:  adjustedTotal,
      })

      // Restore stock — use SAVEPOINT so a bad product id never aborts the tx
      for (const item of enriched) {
        if (!item.id || prevRejectedIds.has(item.id)) continue
        await safeQuery(client,
          `UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2`,
          [item.quantity || 1, item.id]
        )
        await safeQuery(client,
          `INSERT INTO inventory_logs (product_id, change, reason) VALUES ($1,$2,'rejection_restore')`,
          [item.id, item.quantity || 1]
        )
      }
    }

    // ── Build UPDATE statement ───────────────────────────────────────────────
    const updateFields = ['status=$1', 'updated_at=NOW()']
    const updateParams = [status]

    if (notesPayload !== (ord.notes || '')) {
      updateFields.push(`notes=$${updateParams.length + 1}`)
      updateParams.push(notesPayload)
    }
    if (newTotal !== null) {
      updateFields.push(`total=$${updateParams.length + 1}`)
      updateParams.push(newTotal)
    }
    if (delivery_time) {
      updateFields.push(`delivery_time=$${updateParams.length + 1}`)
      updateParams.push(delivery_time)
    }
    updateParams.push(req.params.id)

    const { rows } = await client.query(
      `UPDATE orders SET ${updateFields.join(', ')} WHERE id=$${updateParams.length} RETURNING *`,
      updateParams
    )

    // ── Customer cancellation: restore non-previously-rejected stock ─────────
    if (
      status === 'cancelled' &&
      !['rejected','cancelled','delivered'].includes(ord.status)
    ) {
      for (const item of fullItems) {
        if (!item.id || prevRejectedIds.has(item.id)) continue
        await safeQuery(client,
          `UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2`,
          [item.quantity || 1, item.id]
        )
        await safeQuery(client,
          `INSERT INTO inventory_logs (product_id, change, reason) VALUES ($1,$2,'cancellation_restore')`,
          [item.id, item.quantity || 1]
        )
      }
    }

    await client.query('COMMIT')
    res.json(rows[0])
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('updateOrderStatus error:', err)
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
}

// Authenticated: return all orders for the logged-in user
export async function getMyOrders(req, res) {
  try {
    await query(
      `UPDATE orders SET user_id=$1
       WHERE user_id IS NULL
         AND (address->>'email' ILIKE $2 OR notes ILIKE $3)
         AND address->>'email' != ''`,
      [req.user.id, req.user.email, `%${req.user.email}%`]
    ).catch(() => {})

    const { rows } = await query(
      `SELECT id, reference_id, status, total, delivery_fee, payment_method,
              items, address, notes, created_at, updated_at
       FROM orders
       WHERE user_id=$1
          OR (user_id IS NULL AND address->>'email' ILIKE $2 AND address->>'email' != '')
       ORDER BY created_at DESC LIMIT 100`,
      [req.user.id, req.user.email]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function getOrdersByPhone(req, res) {
  try {
    const phone = req.params.phone.replace(/\D/g, '').slice(-10)
    if (phone.length !== 10) return res.status(400).json({ error: 'Invalid phone' })
    // Public endpoint — return only summary data (no address/email/customer name/notes)
    // so a phone-number guess can't leak full PII.
    const { rows } = await query(
      `SELECT id, reference_id, status, total, delivery_fee, payment_method,
              items, created_at, updated_at
       FROM orders
       WHERE address->>'phone' LIKE $1
         AND created_at > NOW() - INTERVAL '90 days'
       ORDER BY created_at DESC
       LIMIT 50`,
      [`%${phone}`]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function trackOrder(req, res) {
  try {
    const { rows } = await query(
      `SELECT id, user_id, status, updated_at FROM orders WHERE id=$1`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Order not found' })
    // If the order has an owner, only that owner (or admin) may poll it by UUID.
    // Guests must use /track-ref/:ref with the RF-… reference id printed at checkout.
    if (rows[0].user_id) {
      const isOwner = req.user?.id && rows[0].user_id === req.user.id
      const isAdmin = req.user?.role === 'admin'
      if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' })
    }
    res.json({ id: rows[0].id, status: rows[0].status, updatedAt: rows[0].updated_at })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function trackOrderByRef(req, res) {
  try {
    const { rows } = await query(
      `SELECT id, status, updated_at FROM orders WHERE reference_id=$1`,
      [req.params.ref]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Order not found' })
    res.json({ id: rows[0].id, status: rows[0].status, updatedAt: rows[0].updated_at })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function getOrderStats(req, res) {
  try {
    const { rows } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status='placed')           AS placed,
        COUNT(*) FILTER (WHERE status='accepted')         AS accepted,
        COUNT(*) FILTER (WHERE status='out_for_delivery') AS out_for_delivery,
        COUNT(*) FILTER (WHERE status='delivered')        AS delivered,
        COUNT(*) FILTER (WHERE status='cancelled')        AS cancelled,
        COUNT(*) AS total
      FROM orders
      WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date
            = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
    `)
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
}
