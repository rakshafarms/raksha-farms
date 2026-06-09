/**
 * One-time migration script — moves all /uploads/ product images from the old
 * Render server to Cloudflare R2 and updates the DB with the new URLs.
 *
 * Run WHILE RENDER IS STILL UP (so images are still accessible):
 *   cd backend
 *   OLD_BACKEND_URL=https://raksha-farms.onrender.com node src/config/migrateImagesToR2.js
 *
 * Requires all R2 env vars to be set (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL) — put them in backend/.env first.
 */

import 'dotenv/config'
import { query } from './database.js'
import { uploadToR2 } from '../middleware/upload.js'

const OLD_BACKEND = (process.env.OLD_BACKEND_URL || 'https://raksha-farms.onrender.com').replace(/\/$/, '')

async function migrateUrl(url) {
  if (!url || typeof url !== 'string') return url
  const trimmed = url.trim()
  // Only migrate /uploads/ paths — absolute URLs are already fine
  if (!trimmed.startsWith('/uploads/')) return trimmed
  const fullUrl = `${OLD_BACKEND}${trimmed}`
  try {
    const res = await fetch(fullUrl, { redirect: 'follow' })
    if (!res.ok) { console.warn(`  SKIP (HTTP ${res.status}): ${trimmed}`); return trimmed }
    const ct = res.headers.get('content-type') || 'image/jpeg'
    if (!ct.startsWith('image/')) { console.warn(`  SKIP (not image): ${trimmed}`); return trimmed }
    const buf = Buffer.from(await res.arrayBuffer())
    const ext = ct.split('/')[1]?.split(';')[0]?.replace('jpeg', 'jpg') || 'jpg'
    const r2url = await uploadToR2(buf, `migrate.${ext}`, ct.split(';')[0])
    console.log(`  OK: ${trimmed} → ${r2url}`)
    return r2url
  } catch (err) {
    console.warn(`  ERROR: ${trimmed} — ${err.message}`)
    return trimmed
  }
}

async function run() {
  console.log('Fetching products with /uploads/ image URLs…')
  const { rows } = await query(`
    SELECT id, name, image_url, images
    FROM products
    WHERE image_url LIKE '/uploads/%'
       OR images::text LIKE '%/uploads/%'
  `)
  console.log(`Found ${rows.length} products to migrate\n`)

  let updated = 0
  for (const p of rows) {
    console.log(`Product: ${p.name} (${p.id})`)

    const newCover = await migrateUrl(p.image_url)

    let oldImages = []
    try { oldImages = JSON.parse(p.images || '[]') } catch {}
    const newImages = await Promise.all(oldImages.map(migrateUrl))

    await query(
      `UPDATE products SET image_url=$1, images=$2, updated_at=NOW() WHERE id=$3`,
      [newCover, JSON.stringify(newImages), p.id]
    )
    updated++
  }

  console.log(`\nDone — migrated ${updated} products.`)
  process.exit(0)
}

run().catch(err => { console.error(err); process.exit(1) })
