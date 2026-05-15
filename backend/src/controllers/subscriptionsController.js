import { query } from '../config/database.js'
import pool from '../config/database.js'

// Map subscription `frequency` string column → integer days when there is no
// linked plan (sp.frequency_days NULL). Without this, markDelivered/skipDelivery
// fall back to 1 day and roll a weekly subscription forward by a single day.
function frequencyToDays(frequency, intervalDays) {
  if (Number(intervalDays) > 0) return Number(intervalDays)
  switch ((frequency || '').toLowerCase()) {
    case 'daily':    return 1
    case 'weekly':   return 7
    case 'biweekly':   return 14
    case 'bi-weekly':  return 14
    case 'monthly':  return 30
    default:         return 1
  }
}

const BASE_SELECT = `
  SELECT
    s.id, s.is_active, s.frequency, s.next_delivery, s.price_per_cycle,
    s.delivery_count, s.skipped_count, s.start_date, s.created_at, s.items,
    s.payment_status, s.address AS sub_address, s.notes AS sub_notes,
    u.id    AS user_id,
    u.name  AS customer_name,
    u.email AS customer_email,
    u.address AS customer_address,
    -- Phone: users table first, then subscription address, then most recent order address
    COALESCE(
      NULLIF(u.phone, ''),
      NULLIF(s.address->>'phone', ''),
      (SELECT NULLIF(o.address->>'phone', '')
       FROM orders o WHERE o.user_id = s.user_id
       ORDER BY o.created_at DESC LIMIT 1)
    ) AS customer_phone,
    sp.id            AS plan_id,
    sp.name          AS plan_name,
    sp.frequency_days,
    sp.discount_percent
  FROM subscriptions s
  LEFT JOIN users u               ON s.user_id = u.id
  LEFT JOIN subscription_plans sp ON s.plan_id  = sp.id
`

// ── Admin: dashboard stats + stock warnings ────────────────────────────────────
export async function getDashboard(req, res) {
  try {
    // Counts
    const { rows: statsRows } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE is_active AND next_delivery  = CURRENT_DATE)          AS due_today,
        COUNT(*) FILTER (WHERE is_active AND next_delivery  = CURRENT_DATE + 1)      AS due_tomorrow,
        COUNT(*) FILTER (WHERE is_active AND next_delivery  < CURRENT_DATE)          AS overdue,
        COUNT(*) FILTER (WHERE is_active)                                            AS active,
        COUNT(*) FILTER (WHERE NOT is_active)                                        AS paused,
        COUNT(*) FILTER (WHERE payment_status = 'failed')                            AS failed_payment,
        COUNT(*)                                                                      AS total
      FROM subscriptions
    `)
    const stats = statsRows[0]

    // Stock check: aggregate items needed for today + tomorrow's deliveries
    const { rows: dueSubs } = await query(`
      SELECT items FROM subscriptions
      WHERE is_active = true
        AND next_delivery <= CURRENT_DATE + 1
    `)

    const needed = {}  // { product_id: { name, qty } }
    for (const sub of dueSubs) {
      const items = (() => { try { return Array.isArray(sub.items) ? sub.items : JSON.parse(sub.items || '[]') } catch { return [] } })()
      for (const item of items) {
        const key = item.id || item.name
        if (!key) continue
        if (!needed[key]) needed[key] = { id: item.id, name: item.name, qty: 0 }
        needed[key].qty += Number(item.quantity) || 1
      }
    }

    const stockWarnings = []
    for (const [, info] of Object.entries(needed)) {
      if (!info.id) continue
      const { rows: pRows } = await query(
        'SELECT name, stock FROM products WHERE id=$1', [info.id]
      )
      if (pRows[0] && pRows[0].stock < info.qty) {
        stockWarnings.push({
          product_id: info.id,
          name:       pRows[0].name || info.name,
          needed:     info.qty,
          available:  pRows[0].stock,
          short:      info.qty - pRows[0].stock,
        })
      }
    }

    // Today's delivery list (preview)
    const { rows: todayList } = await query(`
      ${BASE_SELECT}
      WHERE s.is_active = true AND s.next_delivery = CURRENT_DATE
      ORDER BY u.name ASC
    `)

    res.json({ stats, stockWarnings, todayList })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// ── Admin: calendar — subscriptions grouped by delivery date ───────────────────
export async function getCalendar(req, res) {
  try {
    // Compute today/sevenOut in IST so the default window matches admin's local calendar.
    const istNow      = new Date(Date.now() + 5.5 * 3600 * 1000)
    const today       = istNow.toISOString().split('T')[0]
    const sevenOutIst = new Date(istNow.getTime() + 13 * 86400000)
    const sevenOut    = sevenOutIst.toISOString().split('T')[0]
    const from = req.query.from || today
    const to   = req.query.to   || sevenOut

    const { rows } = await query(`
      SELECT
        s.id, s.next_delivery, s.items, s.price_per_cycle,
        s.frequency, s.is_active, s.delivery_count, s.skipped_count,
        s.payment_status,
        u.name  AS customer_name,
        u.email AS customer_email,
        u.address AS customer_address,
        COALESCE(
          NULLIF(u.phone, ''),
          NULLIF(s.address->>'phone', ''),
          (SELECT NULLIF(o.address->>'phone', '')
           FROM orders o WHERE o.user_id = s.user_id
           ORDER BY o.created_at DESC LIMIT 1)
        ) AS customer_phone,
        sp.name AS plan_name, sp.frequency_days
      FROM subscriptions s
      LEFT JOIN users u               ON s.user_id = u.id
      LEFT JOIN subscription_plans sp ON s.plan_id  = sp.id
      WHERE s.is_active = true
        AND s.next_delivery BETWEEN $1 AND $2
      ORDER BY s.next_delivery ASC, u.name ASC
    `, [from, to])

    // Group by date
    const grouped = {}
    for (const row of rows) {
      const d = row.next_delivery instanceof Date
        ? row.next_delivery.toISOString().split('T')[0]
        : String(row.next_delivery).split('T')[0]
      if (!grouped[d]) grouped[d] = []
      grouped[d].push(row)
    }

    res.json({ from, to, calendar: grouped })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// ── Admin: generate orders for a given date ────────────────────────────────────
export async function generateOrders(req, res) {
  const client = await pool.connect()
  try {
    const targetDate = req.body.date || new Date().toISOString().split('T')[0]

    // ── Fix 1: Open the transaction BEFORE fetching subscriptions and use
    //    SELECT … FOR UPDATE to lock each subscription row.  This means a second
    //    concurrent admin request will block on the locks until the first commits,
    //    so the idempotency check inside the loop is always authoritative.
    await client.query('BEGIN')

    const { rows: dueSubs } = await client.query(`
      SELECT s.*,
        u.name  AS uname,
        u.email AS uemail,
        u.address AS uaddress,
        COALESCE(
          NULLIF(u.phone, ''),
          NULLIF(s.address->>'phone', ''),
          (SELECT NULLIF(o.address->>'phone', '')
           FROM orders o WHERE o.user_id = s.user_id
           ORDER BY o.created_at DESC LIMIT 1)
        ) AS uphone,
        sp.frequency_days
      FROM subscriptions s
      LEFT JOIN users u               ON s.user_id = u.id
      LEFT JOIN subscription_plans sp ON s.plan_id  = sp.id
      WHERE s.is_active = true AND s.next_delivery = $1
      FOR UPDATE OF s
    `, [targetDate])

    if (!dueSubs.length) {
      await client.query('ROLLBACK')
      return res.json({ generated: 0, skipped: 0, orders: [], failed: [], message: 'No subscriptions due on this date' })
    }

    const created = []
    const failed  = []

    for (const sub of dueSubs) {
      // Idempotency guard — locked rows mean we can't race here anymore, but the
      // UNIQUE constraint on subscription_deliveries is a DB-level safety net too.
      const { rows: existingDel } = await client.query(
        `SELECT id FROM subscription_deliveries WHERE subscription_id=$1 AND delivery_date=$2`,
        [sub.id, targetDate]
      )
      if (existingDel.length > 0) continue  // already generated in a prior run — skip

      const items = (() => { try { return Array.isArray(sub.items) ? sub.items : JSON.parse(sub.items || '[]') } catch { return [] } })()
      const address = (() => {
        const raw = sub.address || sub.uaddress
        if (!raw) return {}
        if (typeof raw !== 'string') return raw
        try { return JSON.parse(raw) } catch { return {} }
      })()
      const addr = {
        name:    sub.uname    || address.name    || '',
        phone:   sub.uphone   || address.phone   || '',
        email:   sub.uemail   || address.email   || '',
        address: address.address || address.street || '',
        notes:   `Subscription delivery (${sub.frequency})`,
      }

      // ── Fix 2: Strict stock check — skip the whole subscription if any item is
      //    short. Don't create orders the farm cannot fulfil. Collect failures and
      //    return them to the admin so they can restock and retry.
      const stockFailures = []
      const validatedItems = []

      for (const item of items) {
        if (!item.id) { validatedItems.push(item); continue }

        // Lock the product row so concurrent order placement can't race us
        const { rows: pRows } = await client.query(
          'SELECT id, name, stock FROM products WHERE id=$1 FOR UPDATE',
          [item.id]
        )
        const prod = pRows[0]
        if (!prod) { validatedItems.push(item); continue }  // product removed — skip gracefully

        const qty = Number(item.quantity) || 1
        if (prod.stock < qty) {
          stockFailures.push({ name: prod.name, need: qty, have: prod.stock })
          continue  // do NOT push to validatedItems — we will skip this subscription
        }

        // Atomic deduct — rowCount 0 means a concurrent request just took the last stock
        const { rowCount } = await client.query(
          `UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2 AND stock >= $1`,
          [qty, item.id]
        )
        if (rowCount === 0) {
          stockFailures.push({ name: prod.name, need: qty, have: 0 })
          continue
        }

        await client.query(
          `INSERT INTO inventory_logs (product_id, change, reason) VALUES ($1,$2,'subscription_order')`,
          [item.id, -qty]
        ).catch(() => {})

        validatedItems.push(item)
      }

      // If any item couldn't be stocked, skip this subscription entirely.
      // Roll back the stock deductions we just made for this sub's items.
      if (stockFailures.length > 0) {
        // Restore stock that was deducted for the items we did process before hitting the failure
        for (const item of validatedItems) {
          if (!item.id) continue
          const qty = Number(item.quantity) || 1
          await client.query(
            `UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2`,
            [qty, item.id]
          ).catch(() => {})
          await client.query(
            `INSERT INTO inventory_logs (product_id, change, reason) VALUES ($1,$2,'subscription_stock_restore')`,
            [item.id, qty]
          ).catch(() => {})
        }
        failed.push({
          subscription_id: sub.id,
          customer:        sub.uname,
          reason:          'Insufficient stock',
          items:           stockFailures,
        })
        continue  // move to next subscription — do not create an order
      }

      // Create order
      const { rows: oRows } = await client.query(
        `INSERT INTO orders
           (user_id, items, subtotal, delivery_fee, total, status, payment_method, address, notes)
         VALUES ($1,$2,$3,0,$3,'placed','cod',$4,$5)
         RETURNING id, reference_id`,
        [sub.user_id, JSON.stringify(validatedItems), sub.price_per_cycle,
         JSON.stringify(addr), `Subscription - ${sub.frequency}`]
      )
      const orderId = oRows[0].id

      // Record delivery entry (ON CONFLICT DO NOTHING as extra DB-level safety net)
      await client.query(
        `INSERT INTO subscription_deliveries
           (subscription_id, delivery_date, status, order_id, payment_status, payment_amount)
         VALUES ($1,$2,'pending',$3,'cod_due',$4)
         ON CONFLICT (subscription_id, delivery_date) DO NOTHING`,
        [sub.id, targetDate, orderId, sub.price_per_cycle]
      )

      // Bug 7: do NOT increment delivery_count here — only increment when actually delivered
      const days = sub.frequency_days || frequencyToDays(sub.frequency, sub.interval_days)
      await client.query(
        `UPDATE subscriptions
         SET next_delivery  = $1::date + ($2 || ' days')::interval,
             payment_status = 'cod_due',
             updated_at     = NOW()
         WHERE id = $3`,
        [targetDate, days, sub.id]
      )

      created.push({
        subscription_id: sub.id,
        order_id:        orderId,
        customer:        sub.uname,
        items:           validatedItems.length,
        amount:          sub.price_per_cycle,
      })
    }

    await client.query('COMMIT')
    res.json({
      generated: created.length,
      skipped:   failed.length,
      date:      targetDate,
      orders:    created,
      // failed array lets the admin see exactly which subscriptions need restocking
      failed:    failed.length > 0 ? failed : undefined,
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(err); res.status(500).json({ error: 'Something went wrong' })
  } finally {
    client.release()
  }
}

// ── Admin: full detail + delivery history ─────────────────────────────────────
export async function getSubscriptionDetail(req, res) {
  try {
    const { rows: sub } = await query(`${BASE_SELECT} WHERE s.id = $1`, [req.params.id])
    if (!sub[0]) return res.status(404).json({ error: 'Subscription not found' })

    const { rows: history } = await query(`
      SELECT sd.*, o.reference_id, o.status AS order_status
      FROM subscription_deliveries sd
      LEFT JOIN orders o ON sd.order_id = o.id
      WHERE sd.subscription_id = $1
      ORDER BY sd.delivery_date DESC
      LIMIT 50
    `, [req.params.id])

    res.json({ ...sub[0], history })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// ── Admin: full update (items, date, status, payment_status, notes) ────────────
export async function updateSubscriptionAdmin(req, res) {
  try {
    const { is_active, next_delivery, items, price_per_cycle, payment_status, notes } = req.body
    const sets = ['updated_at=NOW()']
    const vals = []

    if (is_active     !== undefined) { vals.push(is_active);                sets.push(`is_active=$${vals.length}`) }
    if (next_delivery)                { vals.push(next_delivery);             sets.push(`next_delivery=$${vals.length}`) }
    if (items)                        { vals.push(JSON.stringify(items));     sets.push(`items=$${vals.length}`) }
    if (price_per_cycle)              { vals.push(price_per_cycle);           sets.push(`price_per_cycle=$${vals.length}`) }
    if (payment_status)               { vals.push(payment_status);            sets.push(`payment_status=$${vals.length}`) }
    if (notes !== undefined)          { vals.push(notes);                     sets.push(`notes=$${vals.length}`) }

    vals.push(req.params.id)
    const { rows } = await query(
      `UPDATE subscriptions SET ${sets.join(', ')} WHERE id=$${vals.length} RETURNING *`,
      vals
    )
    if (!rows[0]) return res.status(404).json({ error: 'Subscription not found' })
    res.json(rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// ── Admin: get all subscriptions ───────────────────────────────────────────────
export async function getSubscriptions(req, res) {
  try {
    const { rows } = await query(`${BASE_SELECT} ORDER BY s.next_delivery ASC, s.created_at DESC`)
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// ── Customer: get own subscriptions ───────────────────────────────────────────
// ── Customer: create subscription ──────────────────────────────────────────────
export async function createSubscription(req, res) {
  try {
    const { items, frequency, start_date, address, custom_schedule, interval_days, plan_id } = req.body
    if (!items?.length || !frequency) return res.status(400).json({ error: 'items and frequency are required' })

    // Validate quantities and look up real prices from DB — never trust client-supplied prices
    const ids = items.map(it => it.id).filter(Boolean)
    if (ids.length !== items.length) return res.status(400).json({ error: 'Every item must have a valid product id' })
    const { rows: dbProducts } = await query(
      `SELECT id, price, offer_price, is_active FROM products WHERE id = ANY($1)`, [ids]
    )
    const productMap = Object.fromEntries(dbProducts.map(p => [String(p.id), p]))

    let pricePerCycle = 0
    const validatedItems = []
    for (const it of items) {
      const prod = productMap[String(it.id)]
      if (!prod) return res.status(400).json({ error: `Product ${it.id} not found` })
      if (!prod.is_active) return res.status(400).json({ error: `"${it.id}" is no longer available` })
      const qty = Math.floor(Number(it.quantity))
      if (!qty || qty < 1) return res.status(400).json({ error: `Invalid quantity for product ${it.id}` })
      const unitPrice = prod.offer_price ? Number(prod.offer_price) : Number(prod.price)
      pricePerCycle += unitPrice * qty
      validatedItems.push({ ...it, price: unitPrice, quantity: qty })
    }

    const startDate = start_date || new Date().toISOString().split('T')[0]

    const notes = custom_schedule
      ? JSON.stringify({ custom_schedule, interval_days: interval_days || null })
      : (interval_days ? JSON.stringify({ interval_days }) : null)

    const { rows } = await query(`
      INSERT INTO subscriptions
        (user_id, plan_id, items, price_per_cycle, frequency, next_delivery, start_date, is_active, address, notes)
      VALUES ($1,$2,$3,$4,$5,$6::date,$7::date,true,$8,$9)
      RETURNING *
    `, [
      req.user.id,
      plan_id || null,
      JSON.stringify(validatedItems),
      pricePerCycle,
      frequency,
      startDate,
      startDate,
      address ? JSON.stringify(address) : null,
      notes,
    ])
    res.status(201).json(rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

export async function getMySubscriptions(req, res) {
  try {
    const { rows } = await query(`${BASE_SELECT} WHERE s.user_id=$1 ORDER BY s.created_at DESC`, [req.user.id])
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// ── Admin: mark delivered — COD collected, payment auto-set to paid ────────────
export async function markDelivered(req, res) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Lock the subscription row so concurrent clicks queue up rather than both running
    const { rows: sub } = await client.query(
      `SELECT s.*, sp.frequency_days FROM subscriptions s
       LEFT JOIN subscription_plans sp ON s.plan_id=sp.id
       WHERE s.id=$1 FOR UPDATE OF s`,
      [req.params.id]
    )
    if (!sub[0]) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Subscription not found' })
    }

    const s    = sub[0]
    const days = s.frequency_days || frequencyToDays(s.frequency, s.interval_days)
    const today = new Date().toISOString().split('T')[0]
    const deliveryDate = s.next_delivery
      ? String(s.next_delivery).split('T')[0]
      : today

    // Bug 9: block marking delivered for future delivery dates
    if (deliveryDate > today) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: `Cannot mark delivered: next delivery is scheduled for ${deliveryDate}, not yet due.` })
    }

    // ── Fix 3: Idempotency — if a 'delivered' record already exists for this
    //    delivery date the cycle was already marked delivered (double-click or
    //    retry). Return the current subscription state without mutating anything.
    const { rows: existing } = await client.query(
      `SELECT id FROM subscription_deliveries
       WHERE subscription_id=$1 AND delivery_date=$2 AND status='delivered'`,
      [req.params.id, deliveryDate]
    )
    if (existing.length > 0) {
      await client.query('ROLLBACK')
      // Re-fetch without lock to return current state
      const { rows: cur } = await client.query(
        `SELECT s.* FROM subscriptions s WHERE s.id=$1`, [req.params.id]
      )
      return res.json({ ...cur[0], _idempotent: true })
    }

    // Bug 8: UPDATE the pending row created by generateOrders; INSERT if none exists (manual mark)
    await client.query(
      `INSERT INTO subscription_deliveries
         (subscription_id, delivery_date, status, payment_status, payment_amount)
       VALUES ($1,$2,'delivered','paid',$3)
       ON CONFLICT (subscription_id, delivery_date)
         DO UPDATE SET status='delivered', payment_status='paid'`,
      [req.params.id, deliveryDate, s.price_per_cycle]
    )

    // Advance next_delivery, increment delivery_count, mark this cycle paid
    const { rows } = await client.query(
      `UPDATE subscriptions
       SET delivery_count  = delivery_count + 1,
           next_delivery   = COALESCE(next_delivery, CURRENT_DATE) + ($1 || ' days')::interval,
           payment_status  = 'paid',
           updated_at      = NOW()
       WHERE id=$2 RETURNING *`,
      [days, req.params.id]
    )

    await client.query('COMMIT')
    res.json(rows[0])
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(err); res.status(500).json({ error: 'Something went wrong' })
  } finally {
    client.release()
  }
}

// ── Admin: skip next delivery ─────────────────────────────────────────────────
export async function skipDelivery(req, res) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Lock the row — same idempotency pattern as markDelivered
    const { rows: sub } = await client.query(
      `SELECT s.*, sp.frequency_days FROM subscriptions s
       LEFT JOIN subscription_plans sp ON s.plan_id=sp.id
       WHERE s.id=$1 FOR UPDATE OF s`,
      [req.params.id]
    )
    if (!sub[0]) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Subscription not found' })
    }

    const s    = sub[0]
    const days = s.frequency_days || frequencyToDays(s.frequency, s.interval_days)
    const today = new Date().toISOString().split('T')[0]
    const skipDate = s.next_delivery ? String(s.next_delivery).split('T')[0] : today

    // Bug 9: block skipping future deliveries (more than 1 day ahead)
    if (skipDate > today) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: `Cannot skip: next delivery is scheduled for ${skipDate}, not yet due.` })
    }

    // Idempotency: already skipped this date → return current state
    const { rows: existing } = await client.query(
      `SELECT id FROM subscription_deliveries
       WHERE subscription_id=$1 AND delivery_date=$2 AND status='skipped'`,
      [req.params.id, skipDate]
    )
    if (existing.length > 0) {
      await client.query('ROLLBACK')
      const { rows: cur } = await client.query(
        `SELECT s.* FROM subscriptions s WHERE s.id=$1`, [req.params.id]
      )
      return res.json({ ...cur[0], _idempotent: true })
    }

    await client.query(
      `INSERT INTO subscription_deliveries (subscription_id, delivery_date, status, payment_status, payment_amount)
       VALUES ($1,$2,'skipped','pending',0)
       ON CONFLICT (subscription_id, delivery_date) DO NOTHING`,
      [req.params.id, skipDate]
    )

    const { rows } = await client.query(
      `UPDATE subscriptions
       SET skipped_count = skipped_count + 1,
           next_delivery = COALESCE(next_delivery, CURRENT_DATE) + ($1 || ' days')::interval,
           updated_at    = NOW()
       WHERE id=$2 RETURNING *`,
      [days, req.params.id]
    )

    await client.query('COMMIT')
    res.json(rows[0])
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(err); res.status(500).json({ error: 'Something went wrong' })
  } finally {
    client.release()
  }
}

// ── Customer: pause or resume own subscription ─────────────────────────────────
export async function toggleMySubscription(req, res) {
  try {
    const { rows } = await query(
      `UPDATE subscriptions SET is_active=NOT is_active, updated_at=NOW()
       WHERE id=$1 AND user_id=$2 RETURNING *`,
      [req.params.id, req.user.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// ── Customer: cancel subscription ─────────────────────────────────────────────
export async function cancelMySubscription(req, res) {
  try {
    const { rows } = await query(
      `DELETE FROM subscriptions WHERE id=$1 AND user_id=$2 RETURNING id`,
      [req.params.id, req.user.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}
