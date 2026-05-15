import pool, { query } from '../config/database.js'

const DELIVERY_KEYS = ['free_delivery_threshold', 'delivery_fee_standard', 'delivery_fee_express']
const DEFAULTS = { free_delivery_threshold: 500, delivery_fee_standard: 30, delivery_fee_express: 60 }

// Ensure the table exists — safe to call multiple times
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS store_settings (
      key        VARCHAR(100) PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  // Seed defaults
  await query(`
    INSERT INTO store_settings (key, value) VALUES
      ('free_delivery_threshold', '500'),
      ('delivery_fee_standard', '30'),
      ('delivery_fee_express', '60')
    ON CONFLICT (key) DO NOTHING
  `)
}

export async function getDeliverySettings(req, res) {
  try {
    await ensureTable()
    const { rows } = await query(
      `SELECT key, value FROM store_settings WHERE key = ANY($1)`,
      [DELIVERY_KEYS]
    )
    const settings = { ...DEFAULTS }
    for (const r of rows) settings[r.key] = parseFloat(r.value)
    res.json(settings)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

export async function updateDeliverySettings(req, res) {
  const client = await pool.connect()
  try {
    await ensureTable()
    const { free_delivery_threshold, delivery_fee_standard, delivery_fee_express } = req.body
    const updates = [
      ['free_delivery_threshold', free_delivery_threshold],
      ['delivery_fee_standard',   delivery_fee_standard],
      ['delivery_fee_express',    delivery_fee_express],
    ].filter(([, v]) => v !== undefined && v !== null && !isNaN(Number(v)))

    if (!updates.length) return res.status(400).json({ error: 'No valid values provided' })

    await client.query('BEGIN')
    for (const [key, value] of updates) {
      await client.query(
        `INSERT INTO store_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, String(Number(value))]
      )
    }
    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(err); res.status(500).json({ error: 'Something went wrong' })
  } finally { client.release() }
}
