import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function StarRow({ rating, size = 'w-4 h-4', onPick = null }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < Math.round(rating)
        return (
          <svg
            key={i}
            onClick={onPick ? () => onPick(i + 1) : undefined}
            className={`${size} ${filled ? 'text-earth-500' : 'text-gray-200'} ${onPick ? 'cursor-pointer hover:scale-110 transition-transform' : ''}`}
            fill="currentColor" viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        )
      })}
    </div>
  )
}

export default function ProductReviews({ productId }) {
  const { user, isLoggedIn } = useAuth()
  const { addToast } = useToast()

  const [reviews, setReviews]     = useState([])
  const [avgRating, setAvgRating] = useState(null)
  const [count, setCount]         = useState(0)
  const [loading, setLoading]     = useState(true)

  const [showForm, setShowForm]   = useState(false)
  const [name, setName]           = useState(user?.name || '')
  const [rating, setRating]       = useState(5)
  const [comment, setComment]     = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/products/${productId}/reviews`)
      const data = await res.json()
      setReviews(data.reviews || [])
      setAvgRating(data.avg_rating)
      setCount(data.review_count || 0)
    } catch { /* keep previous state on transient failure */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [productId])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { addToast('Please enter your name', 'error'); return }
    setSubmitting(true)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`${BACKEND_URL}/api/products/${productId}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: name.trim(), rating, comment: comment.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { addToast(data.error || 'Could not submit review', 'error'); return }
      addToast('Thanks for your review!', 'success')
      setComment(''); setShowForm(false)
      load() // real-time refresh — new review + updated average show immediately
    } catch { addToast('Could not submit review', 'error') }
    finally { setSubmitting(false) }
  }

  return (
    <section className="mt-14">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Ratings & Reviews</h2>
          {avgRating != null ? (
            <div className="flex items-center gap-2 mt-1">
              <StarRow rating={avgRating} />
              <span className="text-sm text-gray-500 font-medium">{avgRating} · {count} review{count !== 1 ? 's' : ''}</span>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-1">No reviews yet — be the first!</p>
          )}
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 rounded-xl bg-forest-500 hover:bg-forest-600 text-white text-sm font-bold transition-colors"
        >
          {showForm ? 'Cancel' : 'Write a Review'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-sage-50 rounded-2xl p-4 sm:p-5 mb-6 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Your Rating</label>
            <StarRow rating={rating} size="w-7 h-7" onPick={setRating} />
          </div>
          {!isLoggedIn && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Your Name</label>
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Comment <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              value={comment} onChange={e => setComment(e.target.value)} rows={3}
              placeholder="Share your experience with this product…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 resize-none"
            />
          </div>
          <button
            type="submit" disabled={submitting}
            className="w-full py-2.5 rounded-xl bg-forest-500 hover:bg-forest-600 disabled:opacity-50 text-white text-sm font-bold transition-colors"
          >
            {submitting ? 'Submitting…' : 'Submit Review'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-gray-400">No reviews yet for this product.</p>
      ) : (
        <div className="space-y-4">
          {reviews.map(r => (
            <div key={r.id} className="border-b border-gray-100 pb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-gray-800 text-sm">{r.name}</span>
                <span className="text-xs text-gray-400">
                  {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <StarRow rating={r.rating} size="w-3.5 h-3.5" />
              {r.comment && <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
