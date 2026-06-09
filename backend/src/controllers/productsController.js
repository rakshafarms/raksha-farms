import { query } from '../config/database.js'
import pool from '../config/database.js'
import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

// ── Customer-facing: active products only ─────────────────────────────────────
export async function getProducts(req, res) {
  try {
    const { category, search, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit
    const params = []
    let where = 'WHERE is_active=true AND stock > 0'
    if (category) { params.push(category);       where += ` AND category=$${params.length}` }
    if (search)   { params.push(`%${search}%`);  where += ` AND (name ILIKE $${params.length} OR category ILIKE $${params.length})` }

    const { rows } = await query(
      `SELECT * FROM products ${where} ORDER BY created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    )
    const cnt = await query(`SELECT COUNT(*) FROM products ${where}`, params)
    res.json({ products: rows, total: parseInt(cnt.rows[0].count), page: parseInt(page), limit: parseInt(limit) })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
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
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

export async function getProduct(req, res) {
  try {
    const { rows } = await query('SELECT * FROM products WHERE id=$1', [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' })
    res.json(rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// Helper: extract uploaded file URLs.
// Works with upload.any()  → req.files is a flat array [{fieldname, filename, …}]
// Works with upload.fields() → req.files is an object  { image:[…], images:[…] }
// Works with upload.single() → req.file  is a single object
function extractImageUrls(req) {
  const raw = req.files
  // Normalise to a flat array regardless of multer mode
  let allFiles = []
  if (Array.isArray(raw)) {
    allFiles = raw                              // upload.any()
  } else if (raw && typeof raw === 'object') {
    allFiles = Object.values(raw).flat()       // upload.fields()
  } else if (req.file) {
    allFiles = [req.file]                      // upload.single()
  }

  const coverFile      = allFiles.find(f => f.fieldname === 'image') || req.file
  const image_url      = coverFile ? `/uploads/${coverFile.filename}` : undefined
  const galleryFiles   = allFiles.filter(f => f.fieldname === 'images')
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
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
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
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
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
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// Hard delete — admin explicit action
export async function hardDeleteProduct(req, res) {
  try {
    const { rows } = await query('DELETE FROM products WHERE id=$1 RETURNING id', [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' })
    res.json({ message: 'Product permanently deleted' })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
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
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

export async function getLowStock(req, res) {
  try {
    const threshold = parseInt(req.query.threshold, 10) || 10
    const { rows } = await query(
      'SELECT id, name, category, stock, unit FROM products WHERE stock <= $1 AND is_active=true ORDER BY stock ASC',
      [threshold]
    )
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// ────────────────────────────────────────────────────────────────────────────
// Bulk import from Excel / CSV
// ────────────────────────────────────────────────────────────────────────────
//
// Accepts a JSON array of rows from an Excel/CSV uploaded by the admin.
// Each row may contain: id, name, category, description, price, offer_price,
// stock, unit, image_url, gallery_urls, is_active, is_featured.
//
// Matching strategy:
//   1. If `id` is provided AND matches an existing product → UPDATE that row
//   2. Else if `name` matches an existing active product (case-insensitive) → UPDATE
//   3. Else → INSERT a new product (requires at minimum: name, category, price, stock)
//
// Images:
//   - If `image_url` starts with http(s):// → backend downloads and saves locally,
//     replacing the URL with the local /uploads/... path
//   - If it starts with /uploads/ → kept as-is (already a local image)
//   - If empty/missing → kept as-is on UPDATE, set to null on INSERT
//   - Same logic for each comma-separated entry in `gallery_urls`
//
// Returns: { updated: N, created: N, skipped: [...], errors: [...] }
// ────────────────────────────────────────────────────────────────────────────

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')

// Download a remote image to /uploads and return its public path (or null on failure).
async function downloadImage(url) {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null
  // Already a local upload — keep as-is
  if (trimmed.startsWith('/uploads/')) return trimmed
  // Not http(s)? Reject — we don't trust other protocols
  if (!/^https?:\/\//i.test(trimmed)) return null
  try {
    const response = await fetch(trimmed, { redirect: 'follow' })
    if (!response.ok) return null
    const ct = response.headers.get('content-type') || ''
    if (!ct.startsWith('image/')) return null
    const ext = ct.split('/')[1].split(';')[0].replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg'
    const buf = Buffer.from(await response.arrayBuffer())
    // Guard against oversized images (5 MB cap)
    if (buf.length > 5 * 1024 * 1024) return null
    await fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {})
    const filename = `bulk-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
    await fs.writeFile(path.join(UPLOAD_DIR, filename), buf)
    return `/uploads/${filename}`
  } catch (err) {
    console.warn('downloadImage failed for', trimmed, '—', err.message)
    return null
  }
}

// Coerce a cell value to a number, returning null for blank/invalid.
function num(v) {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

// Coerce a cell value to a boolean.
function bool(v, fallback = true) {
  if (v === undefined || v === null || v === '') return fallback
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'active'].includes(s)) return true
  if (['false', '0', 'no', 'n', 'inactive'].includes(s)) return false
  return fallback
}

export async function bulkImportProducts(req, res) {
  const client = await pool.connect()
  let rowIdx = 0
  try {
    const rows = req.body?.rows
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No rows provided' })
    }
    if (rows.length > 1000) {
      return res.status(400).json({ error: 'Maximum 1000 rows per upload' })
    }

    const summary = { updated: 0, created: 0, skipped: [], errors: [] }
    await client.query('BEGIN')

    for (let i = 0; i < rows.length; i++) {
      rowIdx = i + 2 // +2 because row 1 is the header in Excel
      const row = rows[i] || {}
      try {
        const id           = String(row.id || '').trim() || null
        const name         = String(row.name || '').trim()
        const category     = String(row.category || '').trim()
        const description  = row.description != null ? String(row.description) : null
        const price        = num(row.price)
        const offer_price  = num(row.offer_price)
        const stock        = row.stock != null && row.stock !== '' ? Math.floor(Number(row.stock)) : null
        const unit         = row.unit != null ? String(row.unit).trim() : null
        const imageUrlRaw  = row.image_url != null ? String(row.image_url).trim() : ''
        const galleryRaw   = row.gallery_urls != null ? String(row.gallery_urls).trim() : ''
        const isActive     = bool(row.is_active, true)
        const isFeatured   = bool(row.is_featured, false)

        // ── Locate existing product (ID first, then name fallback) ───────
        let existing = null
        if (id) {
          const r1 = await client.query('SELECT * FROM products WHERE id=$1', [id])
          existing = r1.rows[0] || null
        }
        if (!existing && name) {
          const r2 = await client.query('SELECT * FROM products WHERE LOWER(name)=LOWER($1) LIMIT 1', [name])
          existing = r2.rows[0] || null
        }

        // ── Process image URLs (download remote, keep local) ─────────────
        const newCoverPath = imageUrlRaw ? await downloadImage(imageUrlRaw) : null
        const galleryItems = galleryRaw
          ? galleryRaw.split(',').map(s => s.trim()).filter(Boolean)
          : []
        const newGalleryPaths = []
        for (const g of galleryItems) {
          const p = await downloadImage(g)
          if (p) newGalleryPaths.push(p)
        }

        if (existing) {
          // ── UPDATE ─────────────────────────────────────────────────────
          // For each editable column, keep existing value if the cell is blank.
          const finalName        = name || existing.name
          const finalCategory    = category || existing.category
          const finalDescription = description !== null ? description : existing.description
          const finalPrice       = price !== null ? price : existing.price
          const finalOfferPrice  = offer_price !== null ? offer_price : existing.offer_price
          const finalStock       = stock !== null ? stock : existing.stock
          const finalUnit        = unit !== null ? unit : existing.unit
          // Image: only replace if a new URL was provided AND downloaded successfully
          const finalCover       = imageUrlRaw ? (newCoverPath || existing.image_url) : existing.image_url
          // Gallery: only replace if at least one new URL was provided
          const finalGallery     = galleryItems.length > 0
            ? JSON.stringify(newGalleryPaths)
            : existing.images
          // is_active / is_featured: only apply if cell is non-blank
          const finalActive      = row.is_active   !== undefined && row.is_active   !== '' ? isActive   : existing.is_active
          const finalFeatured    = row.is_featured !== undefined && row.is_featured !== '' ? isFeatured : existing.is_featured

          const prevStock = Number(existing.stock || 0)

          await client.query(
            `UPDATE products SET
                name=$1, category=$2, description=$3, price=$4, offer_price=$5,
                stock=$6, unit=$7, image_url=$8, images=$9, is_active=$10, is_featured=$11,
                updated_at=NOW()
             WHERE id=$12`,
            [finalName, finalCategory, finalDescription, finalPrice, finalOfferPrice,
             finalStock, finalUnit, finalCover, finalGallery, finalActive, finalFeatured,
             existing.id]
          )

          // Log stock change if it changed
          if (finalStock !== prevStock) {
            await client.query(
              `INSERT INTO inventory_logs (product_id, change, reason) VALUES ($1, $2, 'bulk_import')`,
              [existing.id, finalStock - prevStock]
            ).catch(() => {})
          }
          summary.updated++
        } else {
          // ── INSERT (new product) ───────────────────────────────────────
          // Only name, category, and price are strictly required.
          // Stock defaults to 0 if missing — admin can update it via the
          // Inventory page or another bulk upload. Forgetting the stock cell
          // shouldn't block product creation.
          const missing = []
          if (!name)           missing.push('name')
          if (!category)       missing.push('category')
          if (price === null)  missing.push('price')
          if (missing.length) {
            summary.skipped.push({
              row: rowIdx,
              name,
              reason: `Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
            })
            continue
          }
          const finalStock = stock !== null ? stock : 0
          await client.query(
            `INSERT INTO products
                (name, category, description, price, offer_price, stock, unit,
                 image_url, images, is_active, is_featured)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [name, category, description, price, offer_price, finalStock, unit,
             newCoverPath, JSON.stringify(newGalleryPaths), isActive, isFeatured]
          )
          summary.created++
        }
      } catch (err) {
        summary.errors.push({ row: rowIdx, name: row.name || '', error: err.message })
      }
    }

    await client.query('COMMIT')
    res.json(summary)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('bulkImportProducts failed at row', rowIdx, '—', err)
    res.status(500).json({ error: 'Something went wrong' })
  } finally {
    client.release()
  }
}
