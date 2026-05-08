import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useOrders } from '../context/OrdersContext'

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const STATUS_CONFIG = {
  pending:          { label: 'Pending',         dot: 'bg-amber-400',   pill: 'bg-amber-50 text-amber-700',   border: 'border-amber-200' },
  accepted:         { label: 'Accepted',         dot: 'bg-blue-500',    pill: 'bg-blue-50 text-blue-700',     border: 'border-blue-200'  },
  preparing:        { label: 'Preparing',        dot: 'bg-indigo-400',  pill: 'bg-indigo-50 text-indigo-700', border: 'border-indigo-200'},
  out_for_delivery: { label: 'On the way',       dot: 'bg-violet-500',  pill: 'bg-violet-50 text-violet-700', border: 'border-violet-200'},
  delivered:        { label: 'Delivered',        dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200' },
  cancelled:        { label: 'Cancelled',        dot: 'bg-gray-400',    pill: 'bg-gray-100 text-gray-500',    border: 'border-gray-200'  },
  rejected:         { label: 'Rejected',         dot: 'bg-red-400',     pill: 'bg-red-50 text-red-600',       border: 'border-red-200'   },
}

const FILTER_TABS = [
  { id: 'all',              label: 'All' },
  { id: 'pending',          label: 'Pending' },
  { id: 'out_for_delivery', label: 'On the way' },
  { id: 'delivered',        label: 'Delivered' },
  { id: 'rejected',         label: 'Rejected' },
]

export default function MyOrdersPage() {
  const { user, logout } = useAuth()
  const { getOrdersByUser, syncOrdersByUser, syncOrdersByPhone } = useOrders()
  const navigate = useNavigate()

  const [filter, setFilter]         = useState('all')
  const [syncing, setSyncing]       = useState(true)
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneSyncing, setPhoneSyncing] = useState(false)
  const didSync = useRef(false)

  const allOrders = getOrdersByUser(user?.email)
  const hasToken  = !!localStorage.getItem('auth_token')

  useEffect(() => {
    if (user?.phone) setPhoneInput(user.phone)
  }, [user?.phone])

  useEffect(() => {
    async function doSync(isMount = false) {
      if (isMount) setSyncing(true)
      const token = localStorage.getItem('auth_token')
      if (token) {
        try { await syncOrdersByUser() } catch { /* silent */ }
      }
      const phone = user?.phone
      if (phone) {
        try { await syncOrdersByPhone(phone) } catch { /* silent */ }
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

  async function handlePhoneSync() {
    const digits = phoneInput.replace(/\D/g, '')
    if (digits.length < 10) return
    setPhoneSyncing(true)
    await syncOrdersByPhone(digits)
    setPhoneSyncing(false)
  }

  async function handleRefresh() {
    setSyncing(true)
    await syncOrdersByUser()
    const phone = user?.phone || allOrders[0]?.customer?.phone
    if (phone) await syncOrdersByPhone(phone)
    setSyncing(false)
  }

  const filtered = filter === 'all' ? allOrders : allOrders.filter(o => o.status === filter)
  const counts   = allOrders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc }, {})
  const delivered = counts.delivered || 0
  const inProgress = (counts.pending || 0) + (counts.accepted || 0) + (counts.preparing || 0) + (counts.out_for_delivery || 0)
  const totalSpent = allOrders.filter(o => o.status === 'delivered').reduce((s, o) => s + Number(o.total || 0), 0)

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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {syncing ? 'Syncing…' : 'Refresh'}
        </button>
      </div>

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

      {/* Phone lookup — show when 0 orders or no token */}
      {(allOrders.length === 0 || !hasToken) && (
        <div className="card p-5 mb-6">
          <p className="font-semibold text-gray-800 mb-0.5">Find orders by phone</p>
          <p className="text-sm text-gray-400 mb-4">Enter the number you used when placing orders</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">+91</span>
              <input type="tel" inputMode="numeric" placeholder="10-digit number"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="input-field pl-12 w-full" />
            </div>
            <button onClick={handlePhoneSync}
              disabled={phoneSyncing || phoneInput.replace(/\D/g,'').length < 10}
              className="px-4 py-2.5 bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors whitespace-nowrap">
              {phoneSyncing ? '…' : 'Find Orders'}
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
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

      {/* Orders list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-3xl mx-auto mb-4">📦</div>
          <h3 className="text-base font-semibold text-gray-600 mb-1">
            {allOrders.length === 0 ? 'No orders found' : 'No orders here'}
          </h3>
          <p className="text-sm text-gray-400 mb-6">
            {allOrders.length === 0 ? 'Enter your phone number above to find past orders' : 'Try a different filter'}
          </p>
          {allOrders.length === 0 && (
            <Link to="/" className="btn-primary inline-flex items-center gap-2 text-sm">
              <span>🌿</span> Shop Now
            </Link>
          )}
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

  const deliveryFee        = Number(order.deliveryFee || 0)
  const allItemsTotal      = (order.items || []).reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 1), 0)
  const keptItemsTotal     = (order.items || []).filter(it => !isItemRejected(it)).reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 1), 0)
  const displayTotal       = hasPartialRejection && keptItemsTotal > 0 ? keptItemsTotal + deliveryFee : order.total
  const displayOrigTotal   = hasPartialRejection && allItemsTotal > 0 ? allItemsTotal + deliveryFee : (rejInfo?.original_total || order.total)

  const isPartial = hasPartialRejection

  const formattedDate = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  return (
    <div className={`card overflow-hidden`}>
      <button className="w-full text-left px-4 py-4" onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-3">
          {/* Status dot */}
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isPartial ? 'bg-amber-400' : cfg.dot}`} />

          {/* Order info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold text-gray-800">#{order.orderId?.slice(-8)}</span>
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
              <span>{order.paymentMethod === 'upi' ? '📱 UPI' : '💵 Cash on Delivery'}</span>
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
