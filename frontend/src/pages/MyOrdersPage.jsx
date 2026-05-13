import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useOrders } from '../context/OrdersContext'

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

// Format order ID as ddmmyyhhmmss in IST
const fmtOrderId = (iso) => {
  if (!iso) return '--------'
  const d = new Date(iso)
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000)
  const dd  = String(ist.getUTCDate()).padStart(2,'0')
  const mm  = String(ist.getUTCMonth()+1).padStart(2,'0')
  const yy  = String(ist.getUTCFullYear()).slice(-2)
  const hh  = String(ist.getUTCHours()).padStart(2,'0')
  const min = String(ist.getUTCMinutes()).padStart(2,'0')
  const ss  = String(ist.getUTCSeconds()).padStart(2,'0')
  return `${dd}${mm}${yy}${hh}${min}${ss}`
}

const STATUS_CONFIG = {
  pending:          { label: 'Pending',              dot: 'bg-amber-400',   pill: 'bg-amber-50 text-amber-700',     border: 'border-amber-200'  },
  accepted:         { label: 'Accepted',             dot: 'bg-blue-500',    pill: 'bg-blue-50 text-blue-700',       border: 'border-blue-200'   },
  preparing:        { label: 'Preparing',            dot: 'bg-indigo-400',  pill: 'bg-indigo-50 text-indigo-700',   border: 'border-indigo-200' },
  out_for_delivery: { label: 'On the way',           dot: 'bg-violet-500',  pill: 'bg-violet-50 text-violet-700',   border: 'border-violet-200' },
  delivered:        { label: 'Delivered',            dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200'},
  cancelled:        { label: 'Cancelled by Customer',dot: 'bg-gray-400',    pill: 'bg-gray-100 text-gray-500',      border: 'border-gray-200'   },
  rejected:         { label: 'Rejected by Admin',    dot: 'bg-red-400',     pill: 'bg-red-50 text-red-600',         border: 'border-red-200'    },
}

const FILTER_TABS = [
  { id: 'all',              label: 'All' },
  { id: 'pending',          label: 'Pending' },
  { id: 'accepted',         label: 'Active' },
  { id: 'out_for_delivery', label: 'On the way' },
  { id: 'delivered',        label: 'Delivered' },
  { id: 'cancelled',        label: 'Cancelled' },
  { id: 'rejected',         label: 'Rejected' },
]

export default function MyOrdersPage() {
  const { user, logout } = useAuth()
  const { getOrdersByUser, syncOrdersByUser, syncOrdersByPhone } = useOrders()
  const navigate = useNavigate()

  const [filter, setFilter]               = useState('all')
  const [syncing, setSyncing]             = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const didSync = useRef(false)

  // Auto-hide skeleton after 8 s so user isn't stuck staring at it while
  // the backend cold-starts. Token polling continues silently in background.
  useEffect(() => {
    const t = setTimeout(() => setSyncing(false), 8000)
    return () => clearTimeout(t)
  }, [])

  const allOrders = getOrdersByUser(user?.email)

  // Listen for session-expired or auth-failed events
  useEffect(() => {
    function onExpired() { setSessionExpired(true); setSyncing(false) }
    window.addEventListener('rf:session-expired', onExpired)
    window.addEventListener('rf:auth-failed',     onExpired)
    return () => {
      window.removeEventListener('rf:session-expired', onExpired)
      window.removeEventListener('rf:auth-failed',     onExpired)
    }
  }, [])

  useEffect(() => {
    async function doSync(isMount = false) {
      if (isMount) setSyncing(true)

      const token = localStorage.getItem('auth_token')
      if (token) {
        try { await syncOrdersByUser() } catch { /* silent */ }
        const phone = user?.phone
        if (phone) { try { await syncOrdersByPhone(phone) } catch { /* silent */ } }
      }
      // No token yet but user object exists — Google auth background retry is
      // still in progress (Render cold-start can take 20–40s). Poll quietly
      // until the token arrives; never time out to a fake "session expired".
      // The sessionExpired state is ONLY set by the explicit rf:session-expired
      // or rf:auth-failed events (real 401 or all retries exhausted).
      else if (user) {
        const started = Date.now()
        while (Date.now() - started < 50000) {          // wait up to 50 s
          await new Promise(r => setTimeout(r, 2000))
          const t = localStorage.getItem('auth_token')
          if (t) {
            try { await syncOrdersByUser() } catch { /* silent */ }
            break
          }
        }
        // Do NOT call setSessionExpired here — the event listeners handle that.
      }

      if (isMount) setSyncing(false)
    }

    if (!didSync.current) {
      didSync.current = true
      doSync(true)
    }

    const interval = setInterval(() => doSync(false), 30_000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line

  async function handleRefresh() {
    setSyncing(true)
    setSessionExpired(false)
    try {
      await syncOrdersByUser()
      const phone = user?.phone
      if (phone) await syncOrdersByPhone(phone)
    } catch { /* silent */ }
    setSyncing(false)
  }

  const filtered    = filter === 'all' ? allOrders : allOrders.filter(o => o.status === filter)
  const counts      = allOrders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc }, {})
  const delivered   = counts.delivered || 0
  const totalSpent  = allOrders.filter(o => o.status === 'delivered').reduce((s, o) => s + Number(o.total || 0), 0)

  // ── Full-page skeleton while initial load ─────────────────────────────
  if (syncing && allOrders.length === 0) {
    return (
      <div className="page-enter max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Orders</h1>
            <p className="text-sm text-gray-400 mt-0.5">{user?.name || 'Your order history'}</p>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-400 px-3 py-2">
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Loading…
          </div>
        </div>
        <div className="space-y-3 animate-pulse">
          {[1,2,3,4].map(i => (
            <div key={i} className="card p-4 flex items-center gap-4">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-200 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-36" />
                <div className="h-2.5 bg-gray-100 rounded w-24" />
                <div className="flex gap-1.5 mt-1">
                  <div className="h-5 bg-gray-100 rounded-full w-16" />
                  <div className="h-5 bg-gray-100 rounded-full w-14" />
                </div>
              </div>
              <div className="h-5 bg-gray-200 rounded w-14" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Orders</h1>
          <p className="text-sm text-gray-400 mt-0.5">{user?.name || 'Your order history'}</p>
        </div>
        <button onClick={handleRefresh} disabled={syncing}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 px-3 py-2 rounded-xl hover:bg-gray-100 transition border border-gray-200">
          <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {syncing ? 'Syncing…' : 'Refresh'}
        </button>
      </div>

      {/* Session expired banner */}
      {sessionExpired && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 mb-5">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-2xl flex-shrink-0">🔒</span>
            <div>
              <p className="font-bold text-amber-800">Session expired</p>
              <p className="text-amber-700 text-sm mt-0.5">Your login session has ended. Sign in again to see all your orders.</p>
            </div>
          </div>
          <Link to="/login"
            className="block w-full py-3 text-center bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors text-sm">
            Sign In Again →
          </Link>
        </div>
      )}

      {/* Stats row */}
      {allOrders.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="card p-3 text-center">
            <p className="text-xl font-black text-gray-800">{allOrders.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">Total Orders</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-xl font-black text-emerald-600">{delivered}</p>
            <p className="text-xs text-gray-400 mt-0.5">Delivered</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-xl font-black text-forest-600">₹{totalSpent.toLocaleString('en-IN')}</p>
            <p className="text-xs text-gray-400 mt-0.5">Spent</p>
          </div>
        </div>
      )}

      {/* Filter tabs — only show when there are orders */}
      {allOrders.length > 0 && (
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5 overflow-x-auto">
          {FILTER_TABS.filter(f => f.id === 'all' || counts[f.id] > 0).map(({ id, label }) => {
            const count = id === 'all' ? allOrders.length : counts[id] || 0
            return (
              <button key={id} onClick={() => setFilter(id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap flex items-center gap-1.5 flex-shrink-0 transition-all ${
                  filter === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {id !== 'all' && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_CONFIG[id]?.dot || 'bg-gray-400'}`} />}
                {label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${filter === id ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-400'}`}>{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Orders list or empty state */}
      {allOrders.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-3xl mx-auto mb-4">📦</div>
          <h3 className="text-base font-semibold text-gray-600 mb-1">No orders yet</h3>
          <p className="text-sm text-gray-400 mb-6">Start shopping to place your first order</p>
          <Link to="/" className="btn-primary inline-flex items-center gap-2 text-sm">
            <span>🌿</span> Shop Now
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-gray-400">No orders match this filter</p>
          <button onClick={() => setFilter('all')} className="mt-3 text-sm text-forest-600 underline">View all orders</button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => <OrderCard key={order.orderId} order={order} />)}
        </div>
      )}

      {allOrders.length > 0 && (
        <div className="text-center mt-8">
          <Link to="/" className="btn-primary inline-flex items-center gap-2 text-sm">
            <span>🛒</span> Continue Shopping
          </Link>
        </div>
      )}
    </div>
  )
}

function parseRejectionInfo(notes) {
  if (!notes) return null
  try {
    const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes
    if (parsed?.rejected_items?.length) return parsed
  } catch { /* not JSON */ }
  return null
}

function OrderCard({ order }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending

  const rejInfo             = parseRejectionInfo(order.notes)
  const hasPartialRejection = rejInfo && order.status === 'accepted'
  const hasFullRejection    = rejInfo && order.status === 'rejected'

  const isItemRejected = item => rejInfo?.rejected_items?.some(r => r.id === item.id || r.name === item.name)

  const deliveryFee      = Number(order.deliveryFee || 0)
  const allItemsTotal    = (order.items || []).reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 1), 0)
  const keptItemsTotal   = (order.items || []).filter(it => !isItemRejected(it)).reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 1), 0)
  const displayTotal     = hasPartialRejection && keptItemsTotal > 0 ? keptItemsTotal + deliveryFee : order.total
  const displayOrigTotal = hasPartialRejection && allItemsTotal > 0 ? allItemsTotal + deliveryFee : (rejInfo?.original_total || order.total)

  const isPartial = hasPartialRejection

  const formattedDate = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  return (
    <div className="card overflow-hidden">
      <button className="w-full text-left px-4 py-4" onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-3">
          {/* Status dot */}
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isPartial ? 'bg-amber-400' : cfg.dot}`} />

          {/* Order info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold text-gray-800">#{fmtOrderId(order.createdAt)}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isPartial ? 'bg-amber-50 text-amber-700' : cfg.pill}`}>
                {isPartial ? 'Partial' : cfg.label}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {formattedDate} · {order.items?.length || 0} item{order.items?.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Total + chevron */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              {isPartial && displayOrigTotal !== displayTotal && (
                <p className="text-[10px] text-gray-400 line-through">₹{displayOrigTotal}</p>
              )}
              <p className="font-bold text-gray-900">₹{displayTotal}</p>
            </div>
            <svg className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Item chips */}
        <div className="flex gap-1.5 mt-2.5 flex-wrap pl-5">
          {(order.items || []).slice(0, 4).map((item, i) => {
            const rejected = isItemRejected(item)
            return (
              <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${rejected ? 'bg-red-50 text-red-400 line-through' : 'bg-gray-100 text-gray-500'}`}>
                {item.emoji} {item.name}
              </span>
            )
          })}
          {(order.items?.length || 0) > 4 && (
            <span className="text-xs text-gray-400 px-1 py-0.5">+{order.items.length - 4} more</span>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-50 px-4 pb-4 pt-3 space-y-4">
          {/* Rejection / partial notice */}
          {(isPartial || hasFullRejection) && (
            <div className={`rounded-xl p-3 border text-sm ${isPartial ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
              <p className={`font-semibold mb-0.5 ${isPartial ? 'text-amber-700' : 'text-red-700'}`}>
                {isPartial ? '⚠️ Some items were not available' : '❌ Order rejected'}
              </p>
              {rejInfo?.remarks && <p className={`text-xs ${isPartial ? 'text-amber-600' : 'text-red-500'}`}>"{rejInfo.remarks}"</p>}
            </div>
          )}

          {/* Delivery address */}
          {order.customer?.address && (
            <div className="text-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Delivery address</p>
              <p className="text-gray-600">{order.customer.address}</p>
            </div>
          )}

          {/* Items */}
          {order.items?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Items</p>
              <div className="space-y-1.5">
                {order.items.map((item, i) => {
                  const rejected = isItemRejected(item)
                  return (
                    <div key={i} className={`flex justify-between items-center text-sm py-1.5 px-2 rounded-lg ${rejected ? 'bg-red-50' : ''}`}>
                      <span className={`flex items-center gap-1.5 ${rejected ? 'text-red-400 line-through' : 'text-gray-700'}`}>
                        {item.emoji} {item.name}
                        <span className="text-xs text-gray-400">×{item.quantity} {item.unit}</span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        {rejected && <span className="text-[10px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full font-semibold">Unavailable</span>}
                        <span className={`font-medium ${rejected ? 'text-red-400 line-through' : 'text-gray-700'}`}>₹{item.price * item.quantity}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="border-t border-gray-100 pt-3 space-y-1 text-sm">
            {isPartial && displayOrigTotal !== displayTotal && (
              <div className="flex justify-between text-gray-400 text-xs">
                <span>Original total</span>
                <span className="line-through">₹{displayOrigTotal}</span>
              </div>
            )}
            {deliveryFee > 0 && (
              <div className="flex justify-between text-gray-400 text-xs">
                <span>Delivery fee</span>
                <span>₹{deliveryFee}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-800 pt-1">
              <span>Total</span>
              <span className="text-forest-600">₹{displayTotal}</span>
            </div>
            <div className="flex justify-between text-gray-400 text-xs pt-0.5">
              <span>Payment</span>
              <span>{order.paymentMethod === 'razorpay' ? '💳 Online (Razorpay)' : order.paymentMethod === 'upi' ? '📱 UPI' : '💵 Cash on Delivery'}</span>
            </div>
          </div>

          {/* Track button */}
          <Link to={`/track/${order.orderId}`}
            className="block w-full text-center py-2.5 rounded-xl border border-forest-200 text-forest-600 font-semibold text-sm hover:bg-forest-50 transition-colors">
            Track Order →
          </Link>
        </div>
      )}
    </div>
  )
}
