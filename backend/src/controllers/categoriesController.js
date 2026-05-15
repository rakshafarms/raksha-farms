import { query } from '../config/database.js'

export async function getCategories(req, res) {
  try {
    const { rows } = await query(`
      SELECT c.*, COUNT(p.id)::int AS product_count
      FROM categories c
      LEFT JOIN products p ON p.category = c.slug AND p.is_active = true
      WHERE c.is_active = true
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.name ASC
    `)
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

export async function getAllCategories(req, res) {
  try {
    const { rows } = await query(`
      SELECT c.*, COUNT(p.id)::int AS product_count
      FROM categories c
      LEFT JOIN products p ON p.category = c.slug
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.name ASC
    `)
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

export async function createCategory(req, res) {
  try {
    const { slug, name, emoji = '🌿', color = '#22c55e', tagline = '' } = req.body
    if (!slug || !name) return res.status(400).json({ error: 'slug and name required' })
    const { rows } = await query(
      `INSERT INTO categories (slug, name, emoji, color, tagline)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [slug.toLowerCase().trim(), name.trim(), emoji, color, tagline]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Slug already exists' })
    console.error(err); res.status(500).json({ error: 'Something went wrong' })
  }
}

export async function updateCategory(req, res) {
  try {
    const { name, emoji, color, tagline, sort_order, is_active } = req.body
    const { rows } = await query(
      `UPDATE categories SET name=$1, emoji=$2, color=$3, tagline=$4, sort_order=$5, is_active=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [name, emoji, color, tagline, sort_order, is_active, req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

export async function deleteCategory(req, res) {
  try {
    const { rows } = await query('DELETE FROM categories WHERE id=$1 RETURNING id', [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json({ message: 'Deleted' })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}
