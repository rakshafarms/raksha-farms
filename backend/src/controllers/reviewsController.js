import { query } from '../config/database.js'

// ── Public: list reviews for a product (newest first) ──────────────────────
export async function getProductReviews(req, res) {
  try {
    const { rows } = await query(
      `SELECT id, name, rating, comment, created_at, user_id
       FROM product_reviews WHERE product_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [req.params.id]
    )
    const { rows: agg } = await query(
      `SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*) AS review_count
       FROM product_reviews WHERE product_id=$1`,
      [req.params.id]
    )
    res.json({
      reviews: rows,
      avg_rating: agg[0].avg_rating ? Number(agg[0].avg_rating) : null,
      review_count: parseInt(agg[0].review_count),
    })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// ── Public (optionally authenticated): submit/update a review ──────────────
// Logged-in users can only have one review per product (re-submitting
// updates it). Guests can post freely under whatever name they give.
export async function createReview(req, res) {
  try {
    const { name, rating, comment } = req.body
    const ratingNum = parseInt(rating, 10)
    if (!name?.trim())  return res.status(400).json({ error: 'Name is required' })
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5)
      return res.status(400).json({ error: 'Rating must be between 1 and 5' })

    const { rows: prod } = await query('SELECT id FROM products WHERE id=$1', [req.params.id])
    if (!prod[0]) return res.status(404).json({ error: 'Product not found' })

    const userId = req.user?.id || null

    let result
    if (userId) {
      result = await query(
        `INSERT INTO product_reviews (product_id, user_id, name, rating, comment)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (product_id, user_id) WHERE user_id IS NOT NULL DO UPDATE
           SET name=$3, rating=$4, comment=$5, updated_at=NOW()
         RETURNING *`,
        [req.params.id, userId, name.trim(), ratingNum, comment?.trim() || null]
      )
    } else {
      result = await query(
        `INSERT INTO product_reviews (product_id, name, rating, comment)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.params.id, name.trim(), ratingNum, comment?.trim() || null]
      )
    }
    res.status(201).json(result.rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}

// ── Admin: delete a review (moderation) ─────────────────────────────────────
export async function deleteReview(req, res) {
  try {
    const { rows } = await query('DELETE FROM product_reviews WHERE id=$1 RETURNING id', [req.params.reviewId])
    if (!rows[0]) return res.status(404).json({ error: 'Review not found' })
    res.json({ message: 'Review deleted' })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Something went wrong' }) }
}
