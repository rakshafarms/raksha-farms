import express from 'express'
import crypto  from 'crypto'
import Razorpay from 'razorpay'

const router = express.Router()

// Lazily create one shared Razorpay instance so missing env vars at startup
// don't crash the server — they'll surface as a 500 when the route is first hit.
let _rzp = null
function getRazorpay() {
  if (_rzp) return _rzp
  const key_id     = process.env.RAZORPAY_KEY_ID
  const key_secret = process.env.RAZORPAY_KEY_SECRET
  if (!key_id || !key_secret) {
    throw new Error('Razorpay credentials are not configured on this server')
  }
  _rzp = new Razorpay({ key_id, key_secret })
  return _rzp
}

// ── POST /api/payments/create-order ─────────────────────────────────────────
// Creates a Razorpay order and returns the order details + public key.
// Called by the frontend before opening the Razorpay checkout modal.
router.post('/create-order', async (req, res) => {
  try {
    const { amount } = req.body   // amount in PAISE (₹1 = 100 paise)
    if (!amount || typeof amount !== 'number' || amount < 100) {
      return res.status(400).json({ error: 'Invalid amount — must be ≥ ₹1 (100 paise)' })
    }

    const rzp   = getRazorpay()
    const order = await rzp.orders.create({
      amount:   Math.round(amount),
      currency: 'INR',
      receipt:  `rf_${Date.now()}`,   // short internal reference
    })

    res.json({
      order_id: order.id,
      amount:   order.amount,
      currency: order.currency,
      key:      process.env.RAZORPAY_KEY_ID,   // public key is safe to expose to frontend
    })
  } catch (err) {
    console.error('Razorpay create-order error:', err.message)
    res.status(500).json({ error: err.message || 'Failed to create payment order' })
  }
})

// ── POST /api/payments/verify ────────────────────────────────────────────────
// Verifies the HMAC signature returned by Razorpay after a successful payment.
// Must be called before the order is recorded in the database.
router.post('/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay payment fields' })
    }

    const key_secret = process.env.RAZORPAY_KEY_SECRET
    if (!key_secret) {
      return res.status(500).json({ error: 'Payment gateway not configured' })
    }

    // Razorpay signature = HMAC-SHA256(order_id + "|" + payment_id, key_secret)
    const body     = `${razorpay_order_id}|${razorpay_payment_id}`
    const expected = crypto
      .createHmac('sha256', key_secret)
      .update(body)
      .digest('hex')

    if (expected !== razorpay_signature) {
      console.warn('Razorpay signature mismatch — possible tampering')
      return res.status(400).json({ error: 'Payment verification failed — invalid signature' })
    }

    res.json({ verified: true, payment_id: razorpay_payment_id })
  } catch (err) {
    console.error('Razorpay verify error:', err.message)
    res.status(500).json({ error: 'Verification error' })
  }
})

export default router
