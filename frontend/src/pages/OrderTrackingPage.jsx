import React, { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrders } from '../context/OrdersContext'

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

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

// Normalise a raw backend order row into the same shape the UI expects
function normaliseBackendOrder(b) {
  const addr = (() => {
    try { return typeof b.address === 'string' ? JSON.parse(b.address) : (b.address || {}) }
    catch { return {} }
  })()
  const parsedItems = (() => {
    try { return Array.isArray(b.items) ? b.items : JSON.parse(b.items || '[]') }
    catch { return [] }
  })()
  const STATUS_MAP = {
    placed: 'pending', accepted: 'accepted', preparing: 'accepted',
    out_for_delivery: 'out_for_delivery', delivered: 'delivered',
    cancelled: 'cancelled', rejected: 'rejected',
  }
  return {
    orderId:       b.reference_id || b.id,
    backendId:     b.id,
    status:        STATUS_MAP[b.status] || b.status,
    total:         Number(b.total),
    deliveryFee:   Number(b.delivery_fee || 0),
    subtotal:      Number(b.subtotal || 0),
    items:         parsedItems,
    customer:      addr,
    paymentMethod: b.payment_method,
    notes:         b.notes || null,
    createdAt:     b.created_at,
    updatedAt:     b.updated_at || b.created_at,
  }
}

const STATUS_FLOW = [
  { key: 'pending',          label: 'Order Placed',      icon: '📋', desc: 'Your order has been received' },
  { key: 'accepted',         label: 'Confirmed',          icon: '✅', desc: 'Farmer has confirmed your order' },
  { key: 'out_for_delivery', label: 'Out for Delivery',   icon: '🚚', desc: 'Your order is on the way' },
  { key: 'delivered',        label: 'Delivered',          icon: '🎉', desc: 'Order successfully delivered' },
]

const STATUS_INDEX = {
  pending:          0,
  accepted:         1,
  out_for_delivery: 2,
  delivered:        3,
  cancelled:        -1,
  rejected:         -1,
}

// Parse rejection metadata stored in order.notes
function parseRejectionInfo(notes) {
  if (!notes) return null
  try {
    const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes
    if (parsed?.rejected_items?.length) return parsed
  } catch { /* plain text */ }
  return null
}


export default function OrderTrackingPage() {
  const { orderId } = useParams()
  const { orders, syncOrdersByUser, syncOrdersByPhone, applyBackendOrders } = useOrders()
  const [syncing, setSyncing]         = useState(false)
  // initialLoad is true until the first sync attempt completes — prevents flash of "not found"
  const [initialLoad, setInitialLoad] = useState(true)
  // backendOrder is set when the order isn't in local cache but was fetched directly from API
  const [backendOrder, setBackendOrder] = useState(null)
  const fetchedRef = useRef(false)
  // ref always holds latest order so the polling interval isn't stale
  const orderRef   = useRef(null)

  // Derive order: prefer local cache (has richer merged data), fall back to direct fetch
  const order = orders.find((o) => o.orderId === orderId || o.backendId === orderId) || backendOrder
  orderRef.current = order

  // Fetch the order directly from the backend when it's not in local state.
  // Handles: fresh browser, new device, shared tracking link, cleared cache.
  async function fetchFromBackend() {
    if (fetchedRef.current) return
    fetchedRef.current = true
    try {
      const token = localStorage.getItem('auth_token')
      const headers = token ? { Authorization: `Bearer ${token}` } : {}

      // Try reference_id route first (RF-... style IDs)
      let res = await fetch(`${BACKEND_URL}/api/orders/track-ref/${encodeURIComponent(orderId)}`, { headers })
      if (!res.ok) {
        // Try UUID route (backend DB id)
        res = await fetch(`${BACKEND_URL}/api/orders/track/${encodeURIComponent(orderId)}`, { headers })
      }
      if (!res.ok) return  // genuinely not found

      const minimal = await res.json()  // { id, status, updatedAt }
      // Now fetch the full order so we can show items, customer info, totals
      if (token && minimal.id) {
        // Logged-in: mine endpoint has the full row
        const mineRes = await fetch(`${BACKEND_URL}/api/orders/mine`, { headers })
        if (mineRes.ok) {
          const all = await mineRes.json()
          const match = all.find(b => b.id === minimal.id || b.reference_id === orderId)
          if (match) {
            const normalised = normaliseBackendOrder(match)
            setBackendOrder(normalised)
            applyBackendOrders([match])  // merge into context so 30s polling works
            return
          }
        }
      }
      // Guest or mine fetch failed — try by-phone if we have the phone from URL or localStorage
      // As last resort, set a minimal skeleton so at least the status is shown
      setBackendOrder({
        orderId,
        backendId: minimal.id,
        status:    { placed:'pending', accepted:'accepted', preparing:'accepted',
                     out_for_delivery:'out_for_delivery', delivered:'delivered',
                     cancelled:'cancelled', rejected:'rejected' }[minimal.status] || minimal.status,
        total: 0, deliveryFee: 0, subtotal: 0,
        items: [], customer: {}, paymentMethod: '', notes: null,
        createdAt: minimal.updatedAt, updatedAt: minimal.updatedAt,
        _partial: true,  // flag for the UI to show a limited view
      })
    } catch { /* silent — will show "not found" */ }
  }

  // On mount: sync from DB, then fall back to direct fetch if still missing
  useEffect(() => {
    async function sync() {
      setSyncing(true)
      await syncOrdersByUser()
      setSyncing(false)
      setInitialLoad(false)
    }
    sync()
    const interval = setInterval(async () => {
      setSyncing(true)
      await syncOrdersByUser()
      // Use ref so we always read the latest order, not the stale closure value
      const latest = orderRef.current
      if (latest?.customer?.phone) await syncOrdersByPhone(latest.customer.phone)
      setSyncing(false)
    }, 30_000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line

  // After initial sync: if order still not found, try fetching directly from backend
  useEffect(() => {
    if (!initialLoad && !order) fetchFromBackend()
  }, [initialLoad]) // eslint-disable-line

  // Loading state — shown only during initial sync to avoid flash of "not found"
  if (initialLoad) {
    return (
      <div className="page-enter min-h-[50vh] flex flex-col items-center justify-center text-center px-4">
        <svg className="animate-spin w-8 h-8 text-forest-500 mb-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <p className="text-gray-400 text-sm">Loading your order…</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="page-enter min-h-[50vh] flex flex-col items-center justify-center text-center px-4">
        <p className="text-5xl mb-4">📦</p>
        <h2 className="text-xl font-bold text-gray-700 mb-2">Order not found</h2>
        <p className="text-gray-400 mb-5">Check your order ID or visit My Orders</p>
        <Link to="/my-orders" className="btn-primary">My Orders</Link>
      </div>
    )
  }

  // Partial view — we have status but couldn't fetch full order details (guest + no cache)
  if (order._partial) {
    const currentStep    = STATUS_INDEX[order.status] ?? 0
    const isRejected     = order.status === 'rejected'
    const isCancelled    = order.status === 'cancelled'
    const isTerminal     = isRejected || isCancelled
    return (
      <div className="page-enter max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-8">
        <div className="mb-6">
          <Link to="/my-orders" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-forest-500 transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to My Orders
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">Track Order</h1>
          <p className="text-gray-400 text-sm mt-0.5 font-mono">Order #---</p>
        </div>
        {isTerminal ? (
          <div className={`card p-6 mb-5 text-center ${isRejected ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'}`}>
            <p className="text-4xl mb-3">{isRejected ? '❌' : '🚫'}</p>
            <h2 className={`font-bold text-lg ${isRejected ? 'text-red-700' : 'text-gray-700'}`}>
              {isRejected ? 'Rejected by Admin' : 'Cancelled by Customer'}
            </h2>
            <p className={`text-sm mt-2 ${isRejected ? 'text-red-400' : 'text-gray-400'}`}>
              {isRejected ? 'This order could not be fulfilled.' : 'This order was cancelled.'}
            </p>
            {isRejected && <a href="tel:+919346566945" className="btn-primary mt-4 inline-flex bg-red-500 hover:bg-red-600">Call Support</a>}
          </div>
        ) : (
          <div className="card p-6 mb-5 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-forest-500 flex items-center justify-center text-3xl shadow-forest mb-3">
              {STATUS_FLOW[currentStep]?.icon}
            </div>
            <h2 className="font-bold text-gray-800 text-xl">{STATUS_FLOW[currentStep]?.label}</h2>
            <p className="text-gray-400 text-sm mt-1">{STATUS_FLOW[currentStep]?.desc}</p>
          </div>
        )}
        <div className="card p-4 text-center text-sm text-gray-500">
          <p>Log in to see full order details</p>
          <Link to="/login" className="btn-primary mt-3 inline-flex text-xs">Sign In</Link>
        </div>
      </div>
    )
  }

  const currentStep       = STATUS_INDEX[order.status] ?? 0
  const isRejected        = order.status === 'rejected'
  const isCancelled       = order.status === 'cancelled'
  const isTerminal        = isRejected || isCancelled
  const rejInfo           = parseRejectionInfo(order.notes)
  const hasPartialReject  = !!rejInfo && order.status === 'accepted'

  function isItemRejected(item) {
    return rejInfo?.rejected_items?.some(r => r.id === item.id || r.name === item.name)
  }

  return (
    <div className="page-enter max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-8">
      {/* Header */}
      <div className="mb-6">
        <Link to="/my-orders" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-forest-500 transition-colors mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to My Orders
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">Track Order</h1>
          {syncing && (
            <span className="flex items-center gap-1 text-xs text-forest-500 font-medium">
              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Syncing…
            </span>
          )}
        </div>
        <p className="text-gray-400 text-sm mt-0.5 font-mono font-bold">Order #{fmtOrderId(order.createdAt)}</p>
      </div>

      {/* Partial rejection alert — appears above tracker when some items rejected */}
      {hasPartialReject && (
        <div className="card p-5 mb-5 bg-orange-50 border border-orange-200">
          <div className="flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">⚠️</span>
            <div>
              <h3 className="font-bold text-orange-700">Some items were not available</h3>
              {rejInfo.remarks && (
                <p className="text-sm text-orange-600 mt-1">"{rejInfo.remarks}"</p>
              )}
              <p className="text-xs text-orange-500 mt-2">
                Your order will be delivered with the available items. The price has been adjusted accordingly.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Status tracker */}
      {isTerminal ? (
        <div className={`card p-6 mb-5 text-center ${isRejected ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'}`}>
          <p className="text-4xl mb-3">{isRejected ? '❌' : '🚫'}</p>
          <h2 className={`font-bold text-lg ${isRejected ? 'text-red-700' : 'text-gray-700'}`}>
            {isRejected ? 'Rejected by Admin' : 'Cancelled by Customer'}
          </h2>
          {rejInfo?.remarks && (
            <p className="text-red-600 text-sm mt-1 font-medium">"{rejInfo.remarks}"</p>
          )}
          <p className={`text-sm mt-2 ${isRejected ? 'text-red-400' : 'text-gray-400'}`}>
            {isRejected ? 'This order could not be fulfilled. Please contact us for assistance.' : 'This order was cancelled.'}
          </p>
          {isRejected && (
            <a href="tel:+919346566945" className="btn-primary mt-4 inline-flex bg-red-500 hover:bg-red-600">
              Call Support
            </a>
          )}
        </div>
      ) : (
        <div className="card p-6 mb-5">
          {/* Current status highlight */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-forest-500 flex items-center justify-center text-3xl shadow-forest mb-3">
              {STATUS_FLOW[currentStep]?.icon}
            </div>
            <h2 className="font-bold text-gray-800 text-xl">{STATUS_FLOW[currentStep]?.label}</h2>
            <p className="text-gray-400 text-sm mt-1">{STATUS_FLOW[currentStep]?.desc}</p>
            {order.deliveryTime && (
              <p className="text-forest-600 font-semibold text-sm mt-2">
                Estimated: {order.deliveryTime}
              </p>
            )}
          </div>

          {/* Timeline */}
          <div className="relative">
            {STATUS_FLOW.map((step, i) => {
              const done    = i < currentStep
              const active  = i === currentStep
              const pending = i > currentStep
              return (
                <div key={step.key} className="flex gap-4 pb-5 last:pb-0">
                  {/* Dot + line */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base transition-all duration-500 ${
                      done    ? 'bg-forest-500 text-white shadow-forest' :
                      active  ? 'bg-forest-500 text-white shadow-forest ring-4 ring-forest-100' :
                                'bg-gray-100 text-gray-400'
                    }`}>
                      {done ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : step.icon}
                    </div>
                    {i < STATUS_FLOW.length - 1 && (
                      <div className={`w-0.5 flex-1 mt-1 transition-all duration-500 ${done ? 'bg-forest-500' : 'bg-gray-200'}`} style={{ minHeight: '24px' }} />
                    )}
                  </div>
                  {/* Label */}
                  <div className="pt-2 pb-1">
                    <p className={`font-semibold text-sm ${done || active ? 'text-gray-800' : 'text-gray-400'}`}>{step.label}</p>
                    {(done || active) && (
                      <p className="text-xs text-gray-400 mt-0.5">{step.desc}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Order details */}
      <div className="card p-5 mb-4">
        <h3 className="font-bold text-gray-800 mb-4">Order Details</h3>
        {/* Customer info */}
        <div className="space-y-2 text-sm mb-4">
          <div className="flex gap-2">
            <span className="text-gray-400 w-16 flex-shrink-0">Name</span>
            <span className="font-medium text-gray-700">{order.customer.name}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-400 w-16 flex-shrink-0">Phone</span>
            <span className="font-medium text-gray-700">+91 {order.customer.phone}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-400 w-16 flex-shrink-0">Address</span>
            <span className="font-medium text-gray-700">{order.customer.address}</span>
          </div>
          {order.deliverySlot && (
            <div className="flex gap-2">
              <span className="text-gray-400 w-16 flex-shrink-0">Slot</span>
              <span className="font-medium text-gray-700">{order.deliverySlot}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="text-gray-400 w-16 flex-shrink-0">Payment</span>
            <span className="font-medium text-gray-700 capitalize">{order.paymentMethod === 'cod' ? 'Cash on Delivery' : order.paymentMethod?.toUpperCase()}</span>
          </div>
        </div>

        {/* Items */}
        <div className="border-t pt-4 space-y-2">
          {order.items.map((item) => {
            const rejected = isItemRejected(item)
            return (
              <div key={item.id || item.name} className={`flex items-center justify-between text-sm rounded-lg px-2 py-1.5 ${rejected ? 'bg-red-50' : ''}`}>
                <div className={`flex items-center gap-2 ${rejected ? 'text-red-400' : 'text-gray-600'}`}>
                  <span>{item.emoji || '🌿'}</span>
                  <span className={`font-medium ${rejected ? 'line-through' : ''}`}>{item.name}</span>
                  <span className={`text-xs ${rejected ? 'text-red-300' : 'text-gray-400'}`}>×{item.quantity} {item.unit}</span>
                  {rejected && (
                    <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">Not available</span>
                  )}
                </div>
                <span className={`font-semibold ${rejected ? 'text-red-400 line-through' : 'text-gray-800'}`}>
                  ₹{item.price * item.quantity}
                </span>
              </div>
            )
          })}
        </div>

        {/* Totals */}
        <div className="border-t mt-3 pt-3 space-y-1.5 text-sm">
          {/* Show original total crossed out if a partial rejection changed the price */}
          {rejInfo?.original_total && rejInfo.original_total !== order.total && (
            <div className="flex justify-between text-gray-400 text-xs">
              <span>Original Total</span>
              <span className="line-through">₹{rejInfo.original_total}</span>
            </div>
          )}
          {rejInfo?.rejected_amount > 0 && (
            <div className="flex justify-between text-red-500 text-xs">
              <span>Deducted (items not available)</span>
              <span>− ₹{rejInfo.rejected_amount}</span>
            </div>
          )}
          {!rejInfo && (
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span><span>₹{order.subtotal}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-500">
            <span>Delivery</span>
            <span>{order.deliveryFee === 0 ? 'FREE' : `₹${order.deliveryFee}`}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-800 text-base border-t pt-2 mt-1">
            <span>Amount to Pay</span>
            <span className="text-forest-500">₹{order.total}</span>
          </div>
        </div>
      </div>

      {/* Help */}
      <div className="card p-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-forest-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-forest-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-700 text-sm">Need help with your order?</p>
          <p className="text-xs text-gray-400">Available 7AM – 8PM daily</p>
        </div>
        <a href="tel:+919346566945" className="btn-primary text-xs px-4 py-2 flex-shrink-0">Call Us</a>
      </div>
    </div>
  )
}
