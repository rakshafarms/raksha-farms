import { query } from '../config/database.js'

// ── Customer-facing: active products only ─────────────────────────────────────
export async function getProducts(req, res) {
  try {
    const { category, search, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit
    const params = []
    let where = 'WHERE is_active=true'
    if (category) { params.push(category);       where += ` AND category=$${params.length}` }
    if (search)   { params.push(`%${search}%`);  where += ` AND (name ILIKE $${params.length} OR category ILIKE $${params.length})` }

    const { rows } = await query(
      `SELECT * FROM products ${where} ORDER BY created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    )
    const cnt = await query(`SELECT COUNT(*) FROM products ${where}`, params)
    res.json({ products: rows, total: parseInt(cnt.rows[0].count), page: parseInt(page), limit: parseInt(limit) })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

// ── Admin-facing: all products with optional status/category filter ────────────
export async function getProductsAdmin(req, res) {
  try {
    const { category, search, status, page = 1, limit = 200 } = req.query
    const offset = (page - 1) * limit
    const params = []
    let where = 'WHERE 1=1'

    // Status filter
    if (status === 'active')    { where += ' AND is_active=true AND stock > 0' }
    if (status === 'inactive')  { where += ' AND is_active=false' }
    if (status === 'low_stock') { where += ' AND is_active=true AND stock > 0 AND stock <= 10' }
    if (status === 'out_of_stock') { where += ' AND (stock <= 0 OR is_active=false)' }

    if (category) { params.push(category);      where += ` AND category=$${params.length}` }
    if (search)   { params.push(`%${search}%`); where += ` AND (name ILIKE $${params.length} OR category ILIKE $${params.length})` }

    const { rows } = await query(
      `SELECT * FROM products ${where} ORDER BY is_active DESC, created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    )
    const cnt = await query(`SELECT COUNT(*) FROM products ${where}`, params)
    res.json({ products: rows, total: parseInt(cnt.rows[0].count), page: parseInt(page), limit: parseInt(limit) })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function getProduct(req, res) {
  try {
    const { rows } = await query('SELECT * FROM products WHERE id=$1', [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
}

// Helper: extract uploaded file URLs from req.files (fields) or req.file (single)
function extractImageUrls(req) {
  // Cover image (field name "image")
  const coverFile = req.files?.image?.[0] || req.file
  const image_url = coverFile ? `/uploads/${coverFile.filename}` : undefined
  // Gallery images (field name "images")
  const galleryFiles = req.files?.images || []
  const newGalleryUrls = galleryFiles.map(f => `/uploads/${f.filename}`)
  return { image_url, newGalleryUrls }
}

// Parse variants safely from FormData string or array
function parseVariants(raw) {
  if (raw === undefined || raw === null) return undefined
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return [] }
  }
  return []
}

export async function createProduct(req, res) {
  try {
    const { name, category, description, price, offer_price, stock, unit, variants, is_featured } = req.body
    if (!name || !category || price === undefined || stock === undefined)
      return res.status(400).json({ error: 'name, category, price, and stock are required' })
    const priceNum = Number(price); const stockNum = parseInt(stock, 10)
    if (isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'price must be a non-negative number' })
    if (isNaN(stockNum) || stockNum < 0) return res.status(400).json({ error: 'stock must be a non-negative integer' })

    const { image_url, newGalleryUrls } = extractImageUrls(req)
    const offerVal    = offer_price && Number(offer_price) > 0 ? Number(offer_price) : null
    const parsedVars  = parseVariants(variants) || []
    const imagesArr   = newGalleryUrls  // new product starts with empty gallery + newly uploaded

    const { rows } = await query(
      `INSERT INTO products (name, category, description, price, offer_price, stock, unit, image_url, variants, images, is_featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [name, category, description, priceNum, offerVal, stockNum, unit,
       image_url || null, JSON.stringify(parsedVars), JSON.stringify(imagesArr), is_featured || false]
    )
    res.status(201).json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function updateProduct(req, res) {
  try {
    const { name, category, description, price, offer_price, stock, unit,
            is_active, is_featured, variants, existing_images, remove_image } = req.body
    const offerVal    = offer_price && Number(offer_price) > 0 ? Number(offer_price) : null
    const activeVal   = is_active === true || is_active === 'true'
    const featuredVal = is_featured === true || is_featured === 'true'

    const { rows: existing } = await query('SELECT id, image_url, images FROM products WHERE id=$1', [req.params.id])
    if (!existing[0]) return res.status(404).json({ error: 'Product not found' })

    const { image_url: newCover, newGalleryUrls } = extractImageUrls(req)

    // Cover image: use new upload, or keep existing (unless admin explicitly removes it)
    const coverUrl = newCover
      ? newCover
      : (remove_image === 'true' ? null : existing[0].image_url)

    // Gallery images: start from what admin says still exists, then append new uploads
    let keptImages = []
    if (existing_images !== undefined) {
      try { keptImages = JSON.parse(existing_images) } catch { keptImages = [] }
    } else {
      // If not sent, keep all existing gallery images
      try { keptImages = JSON.parse(existing[0].images || '[]') } catch { keptImages = [] }
    }
    const finalImages = [...keptImages, ...newGalleryUrls]

    const sets = [
      `name=$1`, `category=$2`, `description=$3`, `price=$4`,
      `stock=$5`, `unit=$6`, `is_active=$7`, `is_featured=$8`,
      `offer_price=$9`, `image_url=$10`, `images=$11`, `updated_at=NOW()`
    ]
    const vals = [name, category, description, price, stock, unit,
                  activeVal, featuredVal, offerVal, coverUrl, JSON.stringify(finalImages)]

    // variants only updated when explicitly provided
    const parsedVars = parseVariants(variants)
    if (parsedVars !== undefined) {
      sets.push(`variants=$${vals.length + 1}`); vals.push(JSON.stringify(parsedVars))
    }

    const { rows } = await query(
      `UPDATE products SET ${sets.join(',')} WHERE id=$${vals.length + 1} RETURNING *`,
      [...vals, req.params.id]
    )
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
}

// Soft delete (archive) — preserves order history
export async function deleteProduct(req, res) {
  try {
    const { rows } = await query(
      `UPDATE products SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING id, name`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' })
    res.json({ message: `Product "${rows[0].name}" archived`, id: rows[0].id })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

// Hard delete — admin explicit action
export async function hardDeleteProduct(req, res) {
  try {
    const { rows } = await query('DELETE FROM products WHERE id=$1 RETURNING id', [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' })
    res.json({ message: 'Product permanently deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function updateStock(req, res) {
  try {
    const { stock, reason } = req.body
    const stockNum = parseInt(stock, 10)
    if (isNaN(stockNum) || stockNum < 0) return res.status(400).json({ error: 'stock must be a non-negative integer' })
    const { rows: prod } = await query('SELECT stock, name FROM products WHERE id=$1', [req.params.id])
    if (!prod[0]) return res.status(404).json({ error: 'Product not found' })
    const change = stockNum - prod[0].stock
    await query('UPDATE products SET stock=$1, updated_at=NOW() WHERE id=$2', [stockNum, req.params.id])
    await query('INSERT INTO inventory_logs (product_id, change, reason) VALUES ($1,$2,$3)',
      [req.params.id, change, reason || 'Manual update']).catch(() => {})
    res.json({ message: 'Stock updated', stock: stockNum })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function getLowStock(req, res) {
  try {
    const threshold = parseInt(req.query.threshold, 10) || 10
    const { rows } = await query(
      'SELECT id, name, category, stock, unit FROM products WHERE stock <= $1 AND is_active=true ORDER BY stock ASC',
      [threshold]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
}
