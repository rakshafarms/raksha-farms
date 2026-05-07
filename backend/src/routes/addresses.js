import { Router } from 'express'
import { verifyToken } from '../middleware/auth.js'
import { query } from '../config/database.js'
const r = Router()

// GET /api/addresses — return all saved addresses for the logged-in user
r.get('/', verifyToken, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, label, name, phone, address, city, pincode, notes, created_at
       FROM user_addresses WHERE user_id=$1 ORDER BY created_at DESC`,
      [req.user.id]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/addresses — save a new address (skips duplicates by address+city+pincode+name)
r.post('/', verifyToken, async (req, res) => {
  try {
    const { label, name, phone, address, city, pincode, notes } = req.body
    // Check for an existing identical address first
    const existing = await query(
      `SELECT * FROM user_addresses
       WHERE user_id=$1
         AND LOWER(TRIM(address))=$2
         AND LOWER(TRIM(city))=$3
         AND LOWER(TRIM(pincode))=$4
         AND LOWER(TRIM(name))=$5
       LIMIT 1`,
      [req.user.id,
       (address||'').trim().toLowerCase(),
       (city||'').trim().toLowerCase(),
       (pincode||'').trim().toLowerCase(),
       (name||'').trim().toLowerCase()]
    )
    if (existing.rows.length > 0) {
      // Already exists — return the existing row (treat as success)
      return res.status(200).json(existing.rows[0])
    }
    const { rows } = await query(
      `INSERT INTO user_addresses (user_id, label, name, phone, address, city, pincode, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, label||'Home', name||'', phone||'', address||'', city||'', pincode||'', notes||'']
    )
    res.status(201).json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT /api/addresses/:id — update an address
r.put('/:id', verifyToken, async (req, res) => {
  try {
    const { label, name, phone, address, city, pincode, notes } = req.body
    const { rows } = await query(
      `UPDATE user_addresses SET label=$1, name=$2, phone=$3, address=$4, city=$5, pincode=$6, notes=$7
       WHERE id=$8 AND user_id=$9 RETURNING *`,
      [label||'Home', name||'', phone||'', address||'', city||'', pincode||'', notes||'', req.params.id, req.user.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Address not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/addresses/:id — remove a saved address
r.delete('/:id', verifyToken, async (req, res) => {
  try {
    await query('DELETE FROM user_addresses WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default r
