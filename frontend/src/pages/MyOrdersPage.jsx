import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useOrders } from '../context/OrdersContext'

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const STATUS_STYLES = {
  pending:          { label: 'Pending',          icon: '⏳', bg: 'bg-yellow-50',  text: 'text-yellow-700',  border: 'border-yellow-200',  dot: 'bg-yellow-400' },
  accepted:         { label: 'Accepted',          icon: '✅', bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-200',   dot: 'bg-green-500'  },
  out_for_delivery: { label: 'Out for Delivery',  icon: '🚚', bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500'   },
  delivered:        { label: 'Delivered',         icon: '🎉', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500'},
  rejected:         { label: 'Rejected',          icon: '❌', bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-400'    },
}

export default function MyOrdersPage() {
  const { user, logout } = useAuth()
  const { getOrdersByUser, syncOrdersByUser, syncOrdersByPhone } = useOrders()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [syncing, setSyncing] = useState(true)
  const [syncMsg, setSyncMsg] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneSyncing, setPhoneSyncing] = useState(false)
  const [debug, setDebug] = useState(null)
  const [showDebug, setShowDebug] = useState(false)
  const didSync = useRef(false)

  const allOrders = getOrdersByUser(user?.email)
  const hasToken = !!localStorage.getItem('auth_token')

  // Pre-fill phone from user profile
  useEffect(() => {
    if (user?.phone) setPhoneInput(user.phone)
  }, [user?.phone])

  // Sync on mount + every 30s in background (picks up status/rejection changes from admin)
  useEffect(() => {
    async function doSync(isMount = false) {
      if (isMount) {
        setSyncing(true)
        setSyncMsg('Checking server for your orders…')
      }

      const token = localStorage.getItem('auth_token')

      // 1. JWT sync — fetches /api/orders/mine and applies ALL fields
      if (token) {
        try {
          await syncOrdersByUser()
          if (isMount) setSyncMsg('Orders synced ✓')
        } catch { /* silent */ }
      }

      // 2. Phone sync — picks up rejection notes for orders found by phone
      const phone = user?.phone
      if (phone) {
        if (isMount && !token) setSyncMsg(`Searching by phone ${phone}…`)
        try { await syncOrdersByPhone(phone) } catch { /* silent */ }
      }

      if (isMount) setSyncing(false)
    }

    // Run immediately on mount (only once — guards against React StrictMode double-fire)
    if (!didSync.current) {
      didSync.current = true
      doSync(true)
    }

    // Background refresh every 30s to pick up admin changes (rejection, status updates)
    const interval = setInterval(() => doSync(false), 30_000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line

  async function handlePhoneSync() {
    const digits = phoneInput.replace(/\D/g, '')
    if (digits.length < 10) return
    setPhoneSyncing(true)
    setSyncMsg(`Searching orders for +91 ${digits}…`)
    await syncOrdersByPhone(digits)
    setPhoneSyncing(false)
    setSyncMsg('')
  }

  async function handleForceSync() {
    setSyncing(true)
    await syncOrdersByUser()
    const phone = user?.phone || allOrders[0]?.customer?.phone
    if (phone) await syncOrdersByPhone(phone)
    setSyncing(false)
  }

  async function loadDebug() {
    const info = {
      hasToken,
      userEmail: user?.email,
      userProvider: user?.provider,
      localOrders: allOrders.length,
      savedPhone: user?.phone || 'none',
      backendVersion: null,
      apiOrdersResult: null,
    }
    try {
      const h = await fetch(`${BACKEND_URL}/health`)
      const hd = await h.json()
      info.backendVersion = hd.version
    } catch { info.backendVersion = 'unreachable' }

    const token = localStorage.getItem('auth_token')
    if (token) {
      try {
        const r = await fetch(`${BACKEND_URL}/api/orders/mine`, { headers: { Authorization: `Bearer ${token}` } })
        const d = await r.json()
        info.apiOrdersResult = r.ok ? `${d.length} orders returned` : `Error ${r.status}: ${d.error}`
      } catch (e) { info.apiOrdersResult = `Failed: ${e.message}` }
    } else {
      info.apiOrdersResult = 'No token — skipped'
    }
    setDebug(info)
    setShowDebug(true)
  }

  const filtered = filter === 'all' ? allOrders : allOrders.filter((o) => o.status === filter)
  const counts = allOrders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc }, {})

  return (
    <div className="page-enter max-w-3xl mx-auto px-4 sm:px-6 py-10">

      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white font-black text-xl flex-shrink-0 shadow-sm overflow-hidden relative">
            {user?.name?.[0]?.toUpperCase() || '?'}
            {user?.avatar && (
              <img
                src={user.avatar}
                alt={user.name}
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">My Orders</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {user?.name} · {user?.email}
              {user?.provider === 'google' && (
                <span className="ml-2 inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-xs font-medium px-2 py-0.5 rounded-full">
                  <svg className="w-3 h-3" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Google
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleForceSync} disabled={syncing} title="Sync" className="text-sm text-green-600 border border-green-100 hover:border-green-300 px-3 py-2 rounded-xl flex items-center gap-1.5">
            <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
          <button onClick={() => { logout(); navigate('/') }} className="text-sm text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 px-4 py-2 rounded-xl">
            🚪 Sign Out
          </button>
        </div>
      </div>

      {/* Sync status bar */}
      {syncMsg && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700 flex items-center gap-2">
          {syncing && <svg className="animate-spin w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
          {syncMsg}
        </div>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Total Orders', value: allOrders.length, icon: '📦' },
          { label: 'Delivered',    value: counts.delivered || 0, icon: '🎉' },
          { label: 'In Progress',  value: (counts.pending || 0) + (counts.accepted || 0) + (counts.out_for_delivery || 0), icon: '🚚' },
          { label: 'Total Spent',  value: `₹${allOrders.reduce((s, o) => s + o.total, 0)}`, icon: '💰' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="card p-4 text-center">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-xl font-black text-gray-800">{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── PHONE SYNC PANEL (always visible when 0 orders or no token) ── */}
      {(allOrders.length === 0 || !hasToken) && (
        <div className="mb-6 bg-green-50 border-2 border-green-200 rounded-2xl p-5">
          <p className="font-bold text-green-800 mb-1">📱 Find your orders by phone number</p>
          <p className="text-sm text-green-600 mb-4">
            Enter the mobile number you used when placing your orders
          </p>
          <div className="flex gap-2">
            <input
              type="tel"
              inputMode="numeric"
              placeholder="Enter 10-digit mobile number"
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="flex-1 border-2 border-green-200 focus:border-green-400 rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none"
            />
            <button
              onClick={handlePhoneSync}
              disabled={phoneSyncing || phoneInput.replace(/\D/g,'').length < 10}
              className="px-5 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-bold rounded-xl text-sm transition-colors whitespace-nowrap"
            >
              {phoneSyncing ? '…' : 'Find Orders'}
            </button>
          </div>
          {allOrders.length === 0 && !hasToken && (
            <div className="mt-4 pt-4 border-t border-green-200">
              <p className="text-xs text-green-600 mb-2">Or sign in again to sync automatically:</p>
              <button
                onClick={() => { logout(); navigate('/login') }}
                className="w-full py-2.5 bg-white border-2 border-green-300 hover:border-green-500 text-green-700 font-bold rounded-xl text-sm transition-colors"
              >
                🔄 Sign Out &amp; Sign In Again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap mb-6">
        {[
          { id: 'all', label: 'All' },
          { id: 'pending', label: 'Pending' },
          { id: 'accepted', label: 'Accepted' },
          { id: 'out_for_delivery', label: 'On the Way' },
          { id: 'delivered', label: 'Delivered' },
        ].map(({ id, label }) => {
          const s = STATUS_STYLES[id]
          const count = id === 'all' ? allOrders.length : counts[id] || 0
          return (
            <button key={id} onClick={() => setFilter(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                filter === id ? 'bg-green-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-green-300 hover:text-green-700'
              }`}
            >
              {s?.icon || '📋'} {label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${filter === id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Orders list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-3">📦</div>
          <h3 className="text-lg font-bold text-gray-700 mb-1">
            {allOrders.length === 0 ? 'No orders found' : 'No orders in this category'}
          </h3>
          <p className="text-gray-400 text-sm mb-6">
            {allOrders.length === 0
              ? 'Enter your phone number above to find past orders'
              : 'Try a different filter'}
          </p>
          {allOrders.length === 0 && (
            <Link to="/" className="btn-primary inline-flex items-center gap-2">
              <span>🌿</span> Shop Now
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((order) => (
            <OrderCard key={order.orderId} order={order} />
          ))}
        </div>
      )}

      {allOrders.length > 0 && (
        <div className="text-center mt-10">
          <Link to="/" className="btn-primary inline-flex items-center gap-2">
            <span>🛒</span> Continue Shopping
          </Link>
        </div>
      )}

      {/* Debug panel */}
      <div className="mt-10 text-center">
        <button onClick={loadDebug} className="text-xs text-gray-300 hover:text-gray-400 underline">
          show sync info
        </button>
      </div>
      {showDebug && debug && (
        <div className="mt-3 bg-gray-50 border border-gray-200 rounded-2xl p-4 text-xs font-mono space-y-1 text-left">
          <p className="font-bold text-gray-600 mb-2">Sync Diagnostics</p>
          <p>Backend version: <span className={debug.backendVersion?.includes('v12') || debug.backendVersion?.includes('v13') ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{debug.backendVersion}</span></p>
          <p>Has auth token: <span className={debug.hasToken ? 'text-green-600' : 'text-red-500'}>{String(debug.hasToken)}</span></p>
          <p>Logged in as: {debug.userEmail} ({debug.userProvider})</p>
          <p>Local orders: {debug.localOrders}</p>
          <p>Saved phone: {debug.savedPhone}</p>
          <p>API result: <span className={debug.apiOrdersResult?.includes('Error') ? 'text-red-500' : 'text-green-600'}>{debug.apiOrdersResult}</span></p>
          <button onClick={() => setShowDebug(false)} className="mt-2 text-gray-400 hover:text-gray-600">close</button>
        </div>
      )}
    </div>
  )
}

// Parse rejection info from order.notes JSON
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
  const s = STATUS_STYLES[order.status] || STATUS_STYLES.pending

  const rejInfo = parseRejectionInfo(order.notes)
  const hasPartialRejection = rejInfo && order.status === 'accepted'
  const hasFullRejection    = rejInfo && order.status === 'rejected'

  const formattedDate = order.createdAt
    ? new Date(order.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Unknown date'

  // Check if an item was rejected
  function isItemRejected(item) {
    return rejInfo?.rejected_items?.some(r => r.id === item.id || r.name === item.name)
  }

  // For partial rejections: compute correct totals from item prices
  // (avoids ₹0 bug when backend stored wrong total or parse failed)
  const deliveryFee = Number(order.deliveryFee || 0)
  const allItemsSubtotal = (order.items || []).reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 1), 0)
  const keptItemsSubtotal = (order.items || [])
    .filter(item => !isItemRejected(item))
    .reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 1), 0)

  // displayTotal: for partial rejection use kept-items calc; fall back to stored total
  const displayTotal = hasPartialRejection && keptItemsSubtotal > 0
    ? keptItemsSubtotal + deliveryFee
    : order.total

  // originalTotal: for partial rejection use all-items calc; fall back to rejInfo or stored total
  const displayOriginalTotal = hasPartialRejection && allItemsSubtotal > 0
    ? allItemsSubtotal + deliveryFee
    : (rejInfo?.original_total || order.total)

  return (
    <div className={`card overflow-hidden border-l-4 ${hasPartialRejection ? 'border-orange-300' : s.border}`}>
      <button className="w-full text-left p-5" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${hasPartialRejection ? 'bg-orange-50' : s.bg} rounded-xl flex items-center justify-center text-xl flex-shrink-0`}>
              {hasPartialRejection ? '⚠️' : s.icon}
            </div>
            <div>
              <p className="font-bold text-gray-800 text-sm">Order #{order.orderId}</p>
              <p className="text-gray-400 text-xs mt-0.5">{formattedDate}</p>
              {hasPartialRejection && (
                <p className="text-orange-600 text-xs font-semibold mt-0.5">⚠️ Some items were not available</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              {/* Show original total crossed out when partial rejection reduced it */}
              {hasPartialRejection && displayOriginalTotal !== displayTotal && (
                <p className="text-gray-400 text-xs line-through">₹{displayOriginalTotal}</p>
              )}
              <p className="font-black text-green-700 text-lg">₹{displayTotal}</p>
              <p className="text-gray-400 text-xs">{order.items?.length || 0} item(s)</p>
            </div>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full ${hasPartialRejection ? 'bg-orange-50 text-orange-700' : `${s.bg} ${s.text}`}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${hasPartialRejection ? 'bg-orange-400' : s.dot}`} />
              {hasPartialRejection ? 'Partial' : s.label}
            </span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {(order.items || []).slice(0, 5).map((item, i) => {
            const rejected = isItemRejected(item)
            return (
              <span key={i} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${rejected ? 'bg-red-50 text-red-400 line-through' : 'bg-gray-50 text-gray-600'}`}>
                {item.emoji} {item.name}
                {rejected && <span className="no-underline ml-0.5 text-red-400">✕</span>}
              </span>
            )
          })}
          {(order.items?.length || 0) > 5 && <span className="text-xs text-gray-400 px-2 py-1">+{order.items.length - 5} more</span>}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-50 px-5 pb-5">
          {/* Rejection notice banner */}
          {(hasPartialRejection || hasFullRejection) && (
            <div className={`mt-4 rounded-xl p-4 border ${hasPartialRejection ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`font-bold text-sm mb-1 ${hasPartialRejection ? 'text-orange-700' : 'text-red-700'}`}>
                {hasPartialRejection ? '⚠️ Partial Order — Some Items Not Available' : '❌ Order Rejected'}
              </p>
              {rejInfo?.remarks && (
                <p className={`text-sm ${hasPartialRejection ? 'text-orange-600' : 'text-red-600'}`}>
                  "{rejInfo.remarks}"
                </p>
              )}
              {hasPartialRejection && rejInfo?.rejected_amount > 0 && (
                <p className="text-xs text-orange-500 mt-1">
                  ₹{rejInfo.rejected_amount} deducted for unavailable items
                </p>
              )}
            </div>
          )}

          {order.customer?.address && (
            <div className="mt-4 bg-gray-50 rounded-xl p-3 text-sm">
              <p className="font-semibold text-gray-700 mb-1">📍 Delivery Address</p>
              <p className="text-gray-500">{order.customer.address}</p>
            </div>
          )}

          {(order.items?.length > 0) && (
            <div className="mt-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Items</p>
              <div className="space-y-2">
                {order.items.map((item, i) => {
                  const rejected = isItemRejected(item)
                  return (
                    <div key={i} className={`flex items-center justify-between text-sm rounded-lg px-3 py-2 ${rejected ? 'bg-red-50' : 'bg-gray-50'}`}>
                      <span className={`flex items-center gap-2 ${rejected ? 'text-red-400 line-through' : 'text-gray-700'}`}>
                        <span>{item.emoji}</span>
                        <span>{item.name}</span>
                        <span className={`text-xs ${rejected ? 'text-red-300' : 'text-gray-400'}`}>× {item.quantity} {item.unit}</span>
                      </span>
                      <div className="text-right">
                        <span className={`font-semibold ${rejected ? 'text-red-400 line-through' : 'text-gray-800'}`}>
                          ₹{item.price * item.quantity}
                        </span>
                        {rejected && <span className="ml-1.5 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold no-underline">Not available</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mt-4 border-t pt-3 space-y-1.5 text-sm">
            {/* Original total crossed out for partial rejections */}
            {hasPartialRejection && displayOriginalTotal !== displayTotal && (
              <div className="flex justify-between text-gray-400 text-xs">
                <span>Original Total</span>
                <span className="line-through">₹{displayOriginalTotal}</span>
              </div>
            )}
            {/* Deducted amount — compute from items if rejInfo.rejected_amount is 0/missing */}
            {hasPartialRejection && (() => {
              const deducted = rejInfo?.rejected_amount > 0
                ? rejInfo.rejected_amount
                : (displayOriginalTotal - displayTotal)
              return deducted > 0 ? (
                <div className="flex justify-between text-red-500 text-xs">
                  <span>Deducted (unavailable items)</span>
                  <span>− ₹{deducted}</span>
                </div>
              ) : null
            })()}
            {deliveryFee > 0 && (
              <div className="flex justify-between text-gray-400 text-xs">
                <span>Delivery fee</span>
                <span>₹{deliveryFee}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-800 pt-1 border-t">
              <span>Amount to Pay</span>
              <span className="text-green-700 text-base">₹{displayTotal}</span>
            </div>
            <div className="flex justify-between text-gray-400 text-xs">
              <span>Payment</span>
              <span>{order.paymentMethod === 'upi' ? '📱 UPI' : '💵 Cash on Delivery'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
