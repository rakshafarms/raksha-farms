import { query } from '../config/database.js'

// Get all subscription plans (public - visible to customers)
export async function getPlans(req, res) {
  try {
    const { rows } = await query(`
      SELECT * FROM subscription_plans
      WHERE is_active = true
      ORDER BY frequency_days ASC
    `)
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// Get all subscription plans (admin - includes inactive)
export async function getPlansAdmin(req, res) {
  try {
    const { rows } = await query(`
      SELECT * FROM subscription_plans
      ORDER BY frequency_days ASC
    `)
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// Create subscription plan (admin only)
export async function createPlan(req, res) {
  try {
    const { name, frequency, frequency_days, base_price, margin_percent, discount_percent, description } = req.body

    if (!name || !frequency) {
      return res.status(400).json({ error: 'Name and frequency required' })
    }

    const { rows } = await query(
      `INSERT INTO subscription_plans (name, frequency, frequency_days, base_price, margin_percent, discount_percent, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, frequency, frequency_days || null, base_price || 0, margin_percent || 0, discount_percent || 0, description || '']
    )
    res.status(201).json(rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// Update subscription plan (admin only)
export async function updatePlan(req, res) {
  try {
    const { name, frequency, frequency_days, base_price, margin_percent, discount_percent, description, is_active } = req.body
    const { id } = req.params

    const { rows } = await query(
      `UPDATE subscription_plans
       SET name = $1, frequency = $2, frequency_days = $3, base_price = $4,
           margin_percent = $5, discount_percent = $6, description = $7, is_active = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [name, frequency, frequency_days || null, base_price || 0, margin_percent || 0, discount_percent || 0, description || '', is_active !== false, id]
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Plan not found' })
    }

    res.json(rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// Delete subscription plan (admin only)
export async function deletePlan(req, res) {
  try {
    const { id } = req.params

    const { rows } = await query(
      `DELETE FROM subscription_plans WHERE id = $1 RETURNING id`,
      [id]
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Plan not found' })
    }

    res.json({ success: true, id })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}
