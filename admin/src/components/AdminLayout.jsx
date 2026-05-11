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

  // Order notifications
  const [newOrders, setNewOrders]     = useState([])
  const [unreadOrders, setUnreadOrders] = useState(0)

  // Low-stock notifications
  const [lowStockItems, setLowStockItems]     = useState([])
  const [unreadStock, setUnreadStock]         = useState(0)

  // Bell dropdown
  const [open, setOpen]   = useState(false)
  const [tab, setTab]     = useState('orders') // 'orders' | 'stock'
  const bellRef           = useRef(null)

  useEffect(() => {
    const token = Cookies.get('admin_token') || localStorage.getItem('admin_token')
    if (!token) { router.replace('/login'); return }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      setUser(payload)
    } catch { router.replace('/login') }
  }, [])

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
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content — offset by sidebar width on md+ */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">

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
    </div>
  )
}
