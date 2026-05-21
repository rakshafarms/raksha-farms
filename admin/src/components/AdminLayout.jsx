'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import { Bell, Menu, Package } from 'lucide-react'
import Cookies from 'js-cookie'
import { ordersAPI, productsAPI } from '../lib/api'

const SEEN_KEY       = 'rf_admin_seen_orders'
const SEEN_STOCK_KEY = 'rf_admin_seen_lowstock'
const LOW_STOCK_THRESHOLD = 5

function getSeenIds(key = SEEN_KEY) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')) } catch { return new Set() }
}
function markAllSeen(ids, key = SEEN_KEY) {
  localStorage.setItem(key, JSON.stringify([...ids]))
}

export default function AdminLayout({ children, title }) {
  const router = useRouter()
  const [user, setUser] = useState(null)

  // Sidebar mobile state
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Order notifications
  const [newOrders, setNewOrders]     = useState([])
  const [unreadOrders, setUnreadOrders] = useState(0)

  // Low-stock notifications
  const [lowStockItems, setLowStockItems]     = useState([])
  const [unreadStock, setUnreadStock]         = useState(0)

  // Bell dropdown
  const [open, setOpen]   = useState(false)
  const [tab, setTab]     = useState('orders') // 'orders' | 'stock'
  const [liveNotice, setLiveNotice] = useState(null)
  const bellRef           = useRef(null)

  useEffect(() => {
    function getToken() {
      return localStorage.getItem('admin_token')
        || sessionStorage.getItem('admin_token')
        || Cookies.get('admin_token')
    }

    function tryAuth(token) {
      if (!token) return false
      try {
        const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
        const payload = JSON.parse(atob(b64))
        if (!payload?.id) return false
        // Reject expired JWTs — the server would reject them anyway, but checking
        // here also stops a stale token from rendering the layout for a split second.
        if (payload.exp && Date.now() / 1000 > payload.exp) return false
        setUser(payload)
        return true
      } catch { return false }
    }

    // ── Hard-redirect helper that bypasses bfcache ──────────────────────────
    // window.location.replace() alone is restored from bfcache when the user
    // hits Back, defeating the redirect. Setting location.href forces a fresh
    // navigation that the browser won't put in bfcache.
    function redirectToLogin() {
      // Clear in-memory state first so React unmounts the admin UI immediately
      setUser(null)
      window.location.replace('/login')
    }

    // First attempt
    if (tryAuth(getToken())) {
      // Re-validate every time the page becomes visible OR is restored from
      // bfcache (back/forward cache). Without this, clicking the browser Back
      // button after logout restores the rendered admin page from memory,
      // exposing admin data even though the token is gone.
      const recheck = (e) => {
        if (!tryAuth(getToken())) {
          // Token disappeared (logout in another tab, expiry, cookie cleared)
          redirectToLogin()
        }
      }
      window.addEventListener('pageshow', recheck)         // fires on bfcache restore
      window.addEventListener('visibilitychange', recheck) // fires when tab regains focus
      window.addEventListener('focus', recheck)            // fires on window focus
      window.addEventListener('storage', recheck)          // fires when another tab logs out
      return () => {
        window.removeEventListener('pageshow', recheck)
        window.removeEventListener('visibilitychange', recheck)
        window.removeEventListener('focus', recheck)
        window.removeEventListener('storage', recheck)
      }
    }

    // Second attempt after 300ms — handles any browser storage async quirks
    const timer = setTimeout(() => {
      if (!tryAuth(getToken())) {
        redirectToLogin()
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    try { setSidebarCollapsed(localStorage.getItem('rf_admin_sidebar_collapsed') === '1') } catch {}
  }, [])

  function toggleSidebarCollapsed() {
    setSidebarCollapsed(v => {
      const next = !v
      try { localStorage.setItem('rf_admin_sidebar_collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }

  // Idle timeout — log out after 30 minutes of inactivity
  useEffect(() => {
    if (!user) return
    const IDLE_MS = 30 * 60 * 1000
    let timer
    function resetTimer() {
      clearTimeout(timer)
      timer = setTimeout(() => {
        fetch('/api/set-token', { method: 'DELETE' }).catch(() => {})
        localStorage.removeItem('admin_token')
        window.location.href = '/login'
      }, IDLE_MS)
    }
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()
    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [user])

  // Poll orders every 30s
  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await ordersAPI.getAll({ status: 'placed', limit: 10, page: 1 })
      const orders = data.orders || []
      setNewOrders(orders)
      const seen = getSeenIds(SEEN_KEY)
      setUnreadOrders(orders.filter(o => !seen.has(o.id)).length)
    } catch { /* silent */ }
  }, [])

  // Poll low stock every 5 min
  const fetchLowStock = useCallback(async () => {
    try {
      const { data } = await productsAPI.getLowStock(LOW_STOCK_THRESHOLD)
      const items = Array.isArray(data) ? data : (data.products || [])
      setLowStockItems(items)
      const seen = getSeenIds(SEEN_STOCK_KEY)
      setUnreadStock(items.filter(p => !seen.has(p.id)).length)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    if (!user) return
    fetchOrders()
    fetchLowStock()
    const t1 = setInterval(fetchOrders,  30_000)
    const t2 = setInterval(fetchLowStock, 300_000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [user, fetchOrders, fetchLowStock])

  useEffect(() => {
    if (!user || typeof EventSource === 'undefined') return
    // withCredentials sends the admin_token cookie automatically — no token in URL
    const source = new EventSource(ordersAPI.eventsUrl(), { withCredentials: true })

    source.addEventListener('order_created', (event) => {
      try {
        const payload = JSON.parse(event.data)
        const order = payload.order
        const addr = typeof order.address === 'string' ? JSON.parse(order.address || '{}') : (order.address || {})
        const name = order.customer_name || addr.name || 'Guest'
        setNewOrders(prev => [order, ...prev.filter(o => o.id !== order.id)].slice(0, 10))
        setUnreadOrders(n => n + 1)
        setTab('orders')
        setLiveNotice({ title: 'New order received', text: `${name} placed an order for ₹${Number(order.total || 0).toLocaleString('en-IN')}` })
        window.setTimeout(() => setLiveNotice(null), 6500)
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext
          const ctx = new AudioCtx()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.frequency.value = 880
          gain.gain.value = 0.04
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start()
          osc.stop(ctx.currentTime + 0.16)
        } catch {}
      } catch {}
    })

    return () => source.close()
  }, [user])

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const totalUnread = unreadOrders + unreadStock

  function toggleBell() {
    setOpen(v => {
      if (!v) {
        // Only mark the currently visible tab as seen when opening
        if (tab === 'orders') {
          markAllSeen(newOrders.map(o => o.id), SEEN_KEY)
          setUnreadOrders(0)
        } else {
          markAllSeen(lowStockItems.map(p => p.id), SEEN_STOCK_KEY)
          setUnreadStock(0)
        }
      }
      return !v
    })
  }

  function goToOrders() { setOpen(false); router.push('/orders') }
  function goToInventory() { setOpen(false); router.push('/inventory') }

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
      />

      {/* Main content — offset by sidebar width on md+ */}
      <div className={`flex-1 ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'} flex flex-col min-h-screen transition-all duration-300`}>

        {/* Header */}
        <header className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center justify-between gap-3">

          {/* Hamburger — visible on mobile only */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            aria-label="Open menu"
          >
            <Menu size={20} className="text-gray-700" />
          </button>

          <h1 className="text-xl font-bold text-gray-800 flex-1 truncate">{title}</h1>

          <div className="flex items-center gap-3">

            {/* Notification bell */}
            <div className="relative" ref={bellRef}>
              <button
                onClick={toggleBell}
                className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Notifications"
              >
                <Bell size={20} className={totalUnread > 0 ? 'text-[#1B4332]' : 'text-gray-500'} />
                {totalUnread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-0.5 flex items-center justify-center">
                    {totalUnread > 9 ? '9+' : totalUnread}
                  </span>
                )}
              </button>

              {/* Dropdown */}
              {open && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">

                  {/* Tabs */}
                  <div className="flex border-b border-gray-100">
                    <button
                      onClick={() => {
                        setTab('orders')
                        markAllSeen(newOrders.map(o => o.id), SEEN_KEY)
                        setUnreadOrders(0)
                      }}
                      className={`flex-1 px-4 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors
                        ${tab === 'orders' ? 'text-[#1B4332] border-b-2 border-[#1B4332]' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      🛒 New Orders
                      {unreadOrders > 0 && (
                        <span className="bg-blue-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{unreadOrders}</span>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setTab('stock')
                        markAllSeen(lowStockItems.map(p => p.id), SEEN_STOCK_KEY)
                        setUnreadStock(0)
                      }}
                      className={`flex-1 px-4 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors
                        ${tab === 'stock' ? 'text-[#1B4332] border-b-2 border-[#1B4332]' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      📦 Low Stock
                      {unreadStock > 0 && (
                        <span className="bg-orange-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{unreadStock}</span>
                      )}
                    </button>
                  </div>

                  {/* Orders tab */}
                  {tab === 'orders' && (
                    <>
                      {newOrders.length === 0 ? (
                        <div className="px-4 py-8 text-center text-gray-400 text-sm">
                          🎉 No pending orders right now
                        </div>
                      ) : (
                        <ul className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                          {newOrders.map(o => {
                            const addr = (() => { try { return typeof o.address === 'string' ? JSON.parse(o.address || '{}') : (o.address || {}) } catch { return {} } })()
                            const name  = o.customer_name || addr.name || 'Guest'
                            const items = Array.isArray(o.items) ? o.items.length : 0
                            const time  = new Date(o.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                            return (
                              <li key={o.id} onClick={goToOrders}
                                className="flex items-start gap-3 px-4 py-3 hover:bg-green-50 cursor-pointer transition-colors">
                                <div className="w-9 h-9 bg-[#1B4332] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <span className="text-white text-sm font-bold">{name[0]?.toUpperCase()}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-gray-800 text-sm truncate">{name}</p>
                                  <p className="text-xs text-gray-500">{items} item{items !== 1 ? 's' : ''} · ₹{Number(o.total).toLocaleString()}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">{time}</p>
                                </div>
                                <span className="text-[10px] bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full self-center flex-shrink-0">
                                  Placed
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                        <p className="text-xs text-gray-400">Refreshes every 30s</p>
                        <button onClick={goToOrders} className="text-xs text-[#1B4332] font-semibold hover:underline">
                          View all →
                        </button>
                      </div>
                    </>
                  )}

                  {/* Low Stock tab */}
                  {tab === 'stock' && (
                    <>
                      {lowStockItems.length === 0 ? (
                        <div className="px-4 py-8 text-center text-gray-400 text-sm">
                          ✅ All products are well stocked
                        </div>
                      ) : (
                        <>
                          <div className="px-4 py-2 bg-orange-50 border-b border-orange-100">
                            <p className="text-xs text-orange-700 font-semibold">
                              ⚠️ {lowStockItems.length} product{lowStockItems.length !== 1 ? 's' : ''} below {LOW_STOCK_THRESHOLD} units
                            </p>
                          </div>
                          <ul className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                            {lowStockItems.map(p => (
                              <li key={p.id} onClick={goToInventory}
                                className="flex items-center gap-3 px-4 py-3 hover:bg-orange-50 cursor-pointer transition-colors">
                                <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                  <Package size={16} className="text-orange-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-gray-800 text-sm truncate">{p.name}</p>
                                  <p className="text-xs text-gray-500">{p.category || 'Uncategorized'}</p>
                                </div>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0
                                  ${p.stock === 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                  {p.stock === 0 ? 'OUT' : `${p.stock} left`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                        <p className="text-xs text-gray-400">Threshold: &lt;{LOW_STOCK_THRESHOLD} units · Checks every 5 min</p>
                        <button onClick={goToInventory} className="text-xs text-[#1B4332] font-semibold hover:underline">
                          Manage →
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* User avatar */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#1B4332] rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{user.name?.[0]?.toUpperCase()}</span>
              </div>
              <span className="hidden sm:block text-sm font-medium text-gray-700">{user.name}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
      {liveNotice && (
        <button
          onClick={goToOrders}
          className="fixed right-5 bottom-5 z-[100] w-80 max-w-[calc(100vw-2.5rem)] rounded-2xl bg-[#1B4332] text-white shadow-2xl p-4 text-left hover:bg-[#15362a] transition-colors"
        >
          <p className="text-sm font-bold">{liveNotice.title}</p>
          <p className="text-xs text-green-100 mt-1">{liveNotice.text}</p>
        </button>
      )}
    </div>
  )
}
