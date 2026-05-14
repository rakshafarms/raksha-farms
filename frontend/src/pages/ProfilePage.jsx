import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useOrders } from '../context/OrdersContext'
import { useWishlist } from '../context/WishlistContext'
import { useAddresses } from '../context/AddressContext'
import { useToast } from '../context/ToastContext'

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

const LABEL_OPTIONS = ['Home', 'Work', 'Hostel', 'Other']
const LABEL_ICONS   = { Home: '🏠', Work: '🏢', Hostel: '🏫', Other: '📍' }
const EMPTY_FORM    = { label: 'Home', name: '', phone: '', address: '', city: '', pincode: '', notes: '' }

function fmtFrequency(freq) {
  if (!freq) return '—'
  if (freq === 'daily')     return 'Every day'
  if (freq === 'custom')    return 'Custom schedule'
  if (freq === 'once')      return 'One-time'
  if (freq === 'weekly')    return 'Every 7 days'
  if (freq === 'bi-weekly') return 'Every 14 days'
  if (freq === 'monthly')   return 'Every 30 days'
  const m = freq.match(/^interval_(\d+)$/)
  if (m) return `Every ${m[1]} days`
  return freq
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000)
}

function FreqPill({ freq }) {
  const isInterval = freq?.startsWith('interval_') || ['weekly','bi-weekly','monthly'].includes(freq)
  const cls = freq === 'daily'  ? 'bg-blue-50 text-blue-700' :
              freq === 'custom' ? 'bg-purple-50 text-purple-700' :
              freq === 'once'   ? 'bg-gray-100 text-gray-500' :
              isInterval        ? 'bg-amber-50 text-amber-700' :
              'bg-gray-100 text-gray-500'
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${cls}`}>
      {fmtFrequency(freq)}
    </span>
  )
}

export default function ProfilePage() {
  const { user, logout, isLoggedIn } = useAuth()
  const { getOrdersByUser, syncOrdersByUser } = useOrders()
  const orders = getOrdersByUser(user?.email)

  const { wishlist } = useWishlist()
  const { addresses, addAddress, updateAddress, deleteAddress } = useAddresses()
  const { addToast } = useToast()
  const navigate     = useNavigate()

  const [activeTab, setActiveTab]             = useState('orders')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [cancelConfirmId, setCancelConfirmId] = useState(null)
  const [ordersLoading, setOrdersLoading]     = useState(true)
  const [sessionExpired, setSessionExpired]   = useState(false)
  const [needsReauth, setNeedsReauth]         = useState(false)

  // Sync on mount and listen for session-expired / auth-failed events.
  useEffect(() => {
    function onExpired() { setSessionExpired(true); setOrdersLoading(false) }
    window.addEventListener('rf:session-expired', onExpired)
    window.addEventListener('rf:auth-failed',     onExpired)

    async function init() {
      setOrdersLoading(true)

      const token = localStorage.getItem('auth_token')
      if (token) {
        await syncOrdersByUser().catch(() => {})
        setOrdersLoading(false)
      } else if (user) {
        // No token — give Google One Tap ~4 s to fire silently.
        // If it doesn't arrive, auto-redirect to login.
        let gotToken = false
        for (let i = 0; i < 4; i++) {
          await new Promise(r => setTimeout(r, 1000))
          if (localStorage.getItem('auth_token')) {
            await syncOrdersByUser().catch(() => {})
            gotToken = true
            break
          }
        }
        if (!gotToken && !localStorage.getItem('auth_token')) {
          logout()
          navigate('/login', { state: { from: '/profile' } })
          return
        }
        setOrdersLoading(false)
      } else {
        setOrdersLoading(false)
      }
    }
    init()

    // Hard cap — skeleton never shows longer than 6 s
    const t = setTimeout(() => setOrdersLoading(false), 6000)

    return () => {
      clearTimeout(t)
      window.removeEventListener('rf:session-expired', onExpired)
      window.removeEventListener('rf:auth-failed',     onExpired)
    }
  }, []) // eslint-disable-line

  // Subscriptions
  const [mySubs, setMySubs]           = useState([])
  const [subsLoading, setSubsLoading] = useState(false)
  const [busySub, setBusySub]         = useState(null)

  useEffect(() => {
    if (activeTab === 'subscriptions') fetchMySubs()
  }, [activeTab])

  async function fetchMySubs() {
    setSubsLoading(true)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`${BACKEND_URL}/api/subscriptions/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { setMySubs([]); return }
      const data = await res.json()
      setMySubs(Array.isArray(data) ? data : [])
    } catch (e) { console.error(e); setMySubs([]) }
    finally { setSubsLoading(false) }
  }

  async function toggleSub(id) {
    setBusySub(id)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`${BACKEND_URL}/api/subscriptions/${id}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) fetchMySubs()
      else addToast('Failed to update subscription. Please try again.', 'error')
    } catch (e) { console.error(e); addToast('Network error. Please try again.', 'error') }
    finally { setBusySub(null) }
  }

  async function cancelSub(id) {
    setBusySub(id)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`${BACKEND_URL}/api/subscriptions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) { fetchMySubs(); addToast('Subscription cancelled.', 'info') }
      else addToast('Failed to cancel subscription. Please try again.', 'error')
    } catch (e) { console.error(e); addToast('Network error. Please try again.', 'error') }
    finally { setBusySub(null); setCancelConfirmId(null) }
  }

  // Address form
  const [showForm, setShowForm]           = useState(false)
  const [editingId, setEditingId]         = useState(null)
  const [formData, setFormData]           = useState(EMPTY_FORM)
  const [formErrors, setFormErrors]       = useState({})
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  if (!isLoggedIn) {
    return (
      <div className="page-enter min-h-[50vh] flex flex-col items-center justify-center text-center px-4">
        <div className="w-20 h-20 rounded-full bg-sage-100 flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-700 mb-2">Sign in to view your profile</h2>
        <p className="text-gray-400 mb-5">Access your orders, subscriptions, and preferences</p>
        <Link to="/login" className="btn-primary">Sign In / Sign Up</Link>
      </div>
    )
  }

  const deliveredOrders = orders.filter(o => o.status === 'delivered')
  // Total value of all orders placed (all statuses)
  const totalSpent      = orders.reduce((s, o) => s + Number(o.total || 0), 0)
  const activeSubs      = mySubs.filter(s => s.is_active).length

  const TABS = [
    { id: 'orders',        label: `Orders${orders.length ? ` (${orders.length})` : ''}` },
    { id: 'subscriptions', label: `Subscriptions${mySubs.length ? ` (${mySubs.length})` : ''}` },
    { id: 'addresses',     label: `Addresses${addresses.length ? ` (${addresses.length})` : ''}` },
  ]

  function openAdd() { setEditingId(null); setFormData(EMPTY_FORM); setFormErrors({}); setShowForm(true) }
  function openEdit(addr) {
    setEditingId(addr.id)
    setFormData({ label: addr.label || 'Home', name: addr.name || '', phone: addr.phone || '', address: addr.address || '', city: addr.city || '', pincode: addr.pincode || '', notes: addr.notes || '' })
    setFormErrors({})
    setShowForm(true)
  }
  function closeForm() { setShowForm(false); setEditingId(null); setFormErrors({}) }
  function setField(key, value) { setFormData(p => ({ ...p, [key]: value })); if (formErrors[key]) setFormErrors(p => ({ ...p, [key]: '' })) }
  function validate() {
    const errs = {}
    if (!formData.name.trim())    errs.name    = 'Name is required'
    if (!formData.phone.trim() || formData.phone.replace(/\D/g, '').length < 10) errs.phone = 'Valid 10-digit phone required'
    if (!formData.address.trim()) errs.address = 'Address is required'
    if (!formData.city.trim())    errs.city    = 'City is required'
    if (!formData.pincode.trim() || formData.pincode.replace(/\D/g, '').length !== 6) errs.pincode = 'Valid 6-digit pincode required'
    return errs
  }
  function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length) { setFormErrors(errs); return }
    if (editingId) updateAddress(editingId, formData); else addAddress(formData)
    closeForm()
  }

  return (
    <div className="page-enter max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-8">

      {/* Profile header */}
      <div className="card p-5 mb-6 flex items-center gap-4 flex-wrap">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-forest-400 to-forest-600 flex items-center justify-center text-white font-black text-2xl shadow-forest flex-shrink-0 relative overflow-hidden">
          {user?.name?.[0]?.toUpperCase()}
          {user?.avatar && (
            <img src={user.avatar} alt={user.name} className="absolute inset-0 w-full h-full object-cover rounded-2xl"
              onError={e => { e.currentTarget.style.display = 'none' }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-800">{user?.name}</h1>
          <p className="text-gray-400 text-sm truncate">{user?.email}</p>
          <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-forest-50 text-forest-600 mt-1">
            {user?.provider === 'google' ? 'Google Account' : 'Email Account'}
          </span>
        </div>
        <button onClick={() => setShowLogoutConfirm(true)}
          className="text-sm text-red-400 hover:text-red-600 font-medium border border-red-100 hover:border-red-300 px-4 py-2 rounded-xl transition-all flex-shrink-0">
          Sign Out
        </button>
      </div>

      {/* Session expired banner — only for real 401 events */}
      {sessionExpired && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 mb-5">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-2xl flex-shrink-0">🔒</span>
            <div>
              <p className="font-bold text-amber-800">Session expired</p>
              <p className="text-amber-700 text-sm mt-0.5">Please sign in again to see your orders and profile.</p>
            </div>
          </div>
          <button onClick={() => { logout(); navigate('/login', { state: { from: '/profile' } }) }}
            className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors text-sm">
            Sign In Again →
          </button>
        </div>
      )}

      {/* Stats — tap to jump to tab */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
        <button onClick={() => setActiveTab('orders')} className="card p-3 sm:p-4 text-center hover:shadow-soft transition-all w-full">
          {ordersLoading
            ? <div className="h-6 w-8 bg-gray-200 rounded animate-pulse mx-auto mb-1" />
            : <p className="text-lg sm:text-xl font-black text-forest-500 truncate">{orders.length}</p>}
          <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 font-medium">Orders</p>
        </button>
        <button onClick={() => setActiveTab('subscriptions')} className="card p-3 sm:p-4 text-center hover:shadow-soft transition-all w-full">
          <p className="text-lg sm:text-xl font-black text-blue-600 truncate">{activeSubs}</p>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 font-medium">Active Subs</p>
        </button>
        <div className="card p-3 sm:p-4 text-center">
          {ordersLoading
            ? <div className="h-6 w-14 bg-gray-200 rounded animate-pulse mx-auto mb-1" />
            : <p className="text-lg sm:text-xl font-black text-earth-600 truncate">₹{totalSpent.toLocaleString('en-IN')}</p>}
          <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 font-medium">Order Value</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
              activeTab === t.id ? 'bg-white text-forest-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── SUBSCRIPTIONS ── */}
      {activeTab === 'subscriptions' && (
        <div className="animate-slide-up space-y-3">
          {subsLoading ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Loading your subscriptions…</div>
          ) : mySubs.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-4xl mb-3">🔄</p>
              <p className="font-semibold text-gray-700 mb-1">No subscriptions yet</p>
              <p className="text-sm text-gray-400 mb-5">Choose Daily, Custom, or On Interval at checkout to get regular deliveries</p>
              <Link to="/" className="btn-primary inline-flex text-sm">Start Shopping</Link>
            </div>
          ) : (
            mySubs.map(sub => <SubCard key={sub.id} sub={sub} busySub={busySub} onToggle={toggleSub} onCancel={cancelSub} />)
          )}
        </div>
      )}

      {/* ── ADDRESSES ── */}
      {activeTab === 'addresses' && (
        <div className="animate-slide-up space-y-4">
          <button onClick={openAdd}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-forest-200 hover:border-forest-400 hover:bg-forest-50 text-forest-600 font-semibold transition-all group">
            <span className="w-8 h-8 rounded-full bg-forest-100 group-hover:bg-forest-200 flex items-center justify-center text-base transition-colors flex-shrink-0">+</span>
            Add New Address
          </button>

          {addresses.length === 0 ? (
            <div className="text-center py-12 card">
              <p className="text-4xl mb-3">📍</p>
              <p className="font-semibold text-gray-600 mb-1">No saved addresses</p>
              <p className="text-sm text-gray-400 mb-4">Save your home or work address for faster checkout</p>
              <button onClick={openAdd} className="btn-primary inline-flex text-sm">Add Address</button>
            </div>
          ) : (
            <div className="space-y-3">
              {addresses.map(addr => (
                <div key={addr.id} className="card p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-forest-50 flex items-center justify-center text-lg flex-shrink-0">
                    {LABEL_ICONS[addr.label] || '📍'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-gray-800 text-sm">{addr.label}</span>
                      <span className="text-xs text-gray-400">{addr.name} · {addr.phone}</span>
                    </div>
                    <p className="text-sm text-gray-500">{addr.address}, {addr.city} – {addr.pincode}</p>
                    {addr.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{addr.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(addr)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => setDeleteConfirm(addr.id)} className="p-2 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ORDERS ── */}
      {activeTab === 'orders' && (
        <div className="animate-slide-up space-y-2">
          {ordersLoading ? (
            // Skeleton cards while syncing
            <div className="space-y-2 animate-pulse">
              {[1,2,3].map(i => (
                <div key={i} className="card p-4 flex items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-40" />
                    <div className="h-2.5 bg-gray-100 rounded w-28" />
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-14" />
                </div>
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-16 card">
              <p className="text-5xl mb-3">📦</p>
              <p className="font-semibold text-gray-600 mb-1">No orders yet</p>
              <p className="text-gray-400 text-sm mb-4">Your past orders will appear here</p>
              <Link to="/" className="btn-primary inline-flex text-sm">Shop Now</Link>
            </div>
          ) : (
            [...orders].reverse().map(order => (
              <Link key={order.orderId} to={`/track/${order.orderId}`}
                className="card p-4 flex items-center gap-4 hover:shadow-soft transition-all block">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-mono text-sm font-bold text-gray-700">#{fmtOrderId(order.createdAt)}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="text-xs text-gray-400">{new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right flex-shrink-0 flex items-center gap-2">
                  <p className="font-bold text-forest-500">₹{order.total}</p>
                  <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {/* ── Quick links ── */}
      <div className="flex gap-3 mt-6">
        <Link to="/wishlist" className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          ❤️ Wishlist {wishlist.length > 0 && <span className="text-xs bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full">{wishlist.length}</span>}
        </Link>
        <a href="tel:+919346566945" className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          📞 Support
        </a>
      </div>

      {/* ── Address Form Modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={closeForm}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-3xl sm:rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-gray-800">{editingId ? 'Edit Address' : 'Add New Address'}</h2>
              <button onClick={closeForm} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Save as</p>
                <div className="flex gap-2 flex-wrap">
                  {LABEL_OPTIONS.map(lbl => (
                    <button key={lbl} onClick={() => setField('label', lbl)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                        formData.label === lbl ? 'border-forest-500 bg-forest-50 text-forest-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {LABEL_ICONS[lbl]} {lbl}
                    </button>
                  ))}
                </div>
              </div>
              <AddrField label="Full Name" placeholder="e.g. Priya Sharma" value={formData.name} onChange={v => setField('name', v)} error={formErrors.name} required />
              <AddrField label="Mobile Number" placeholder="10-digit number" type="tel" value={formData.phone} onChange={v => setField('phone', v.replace(/\D/g, '').slice(0, 10))} error={formErrors.phone} required prefix="+91" />
              <AddrField label="Street Address" placeholder="House no., Street, Locality" value={formData.address} onChange={v => setField('address', v)} error={formErrors.address} required textarea />
              <div className="grid grid-cols-2 gap-3">
                <AddrField label="City" placeholder="e.g. Hyderabad" value={formData.city} onChange={v => setField('city', v)} error={formErrors.city} required />
                <AddrField label="Pincode" placeholder="6 digits" value={formData.pincode} onChange={v => setField('pincode', v.replace(/\D/g, '').slice(0, 6))} error={formErrors.pincode} required />
              </div>
              <AddrField label="Delivery Notes (optional)" placeholder="Gate code, landmark…" value={formData.notes} onChange={v => setField('notes', v)} textarea />
              <button onClick={handleSave} className="btn-primary w-full mt-2">
                {editingId ? 'Save Changes' : 'Save Address'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-3xl mb-3 text-center">🗑️</div>
            <h3 className="text-lg font-bold text-gray-800 text-center mb-1">Delete Address?</h3>
            <p className="text-sm text-gray-400 text-center mb-5">This address will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={() => { deleteAddress(deleteConfirm); setDeleteConfirm(null) }} className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Logout confirmation modal ── */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowLogoutConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center pt-7 pb-4 px-6">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-gray-800">Sign out of Raksha Farms?</h3>
              <p className="text-sm text-gray-400 text-center mt-1">You'll need to sign in again to view your orders and wishlist.</p>
            </div>
            <div className="border-t border-gray-100">
              <button
                onClick={() => { logout(); navigate('/'); setShowLogoutConfirm(false) }}
                className="w-full py-3.5 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors border-b border-gray-100"
              >
                Yes, Sign Out
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="w-full py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Subscription card ── */
function SubCard({ sub, busySub, onToggle, onCancel }) {
  const items  = Array.isArray(sub.items) ? sub.items : []
  const isBusy = busySub === sub.id
  const [confirmCancel, setConfirmCancel] = React.useState(false)
  const days   = daysUntil(sub.next_delivery)

  let nextLabel = '—'
  let nextColor = 'text-gray-500'
  if (days !== null) {
    if (days < 0)      { nextLabel = `Overdue by ${Math.abs(days)}d`; nextColor = 'text-red-500' }
    else if (days === 0) { nextLabel = 'Today';    nextColor = 'text-green-600' }
    else if (days === 1) { nextLabel = 'Tomorrow'; nextColor = 'text-amber-600' }
    else                 { nextLabel = `In ${days} days`; nextColor = 'text-gray-700' }
  }

  const customSchedule = (() => {
    try { const p = JSON.parse(sub.sub_notes || '{}'); return p.custom_schedule || null } catch { return null }
  })()
  const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  return (
    <div className={`card overflow-hidden ${!sub.is_active ? 'opacity-60' : ''}`}>
      {/* Top row */}
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <FreqPill freq={sub.frequency} />
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sub.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {sub.is_active ? 'Active' : 'Paused'}
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-800">
            {items.length} item{items.length !== 1 ? 's' : ''} · <span className="text-forest-600 font-bold">₹{parseFloat(sub.price_per_cycle || 0).toFixed(0)}</span> per cycle
          </p>
          {sub.frequency === 'custom' && customSchedule && (
            <p className="text-xs text-purple-500 mt-0.5">
              {DAYS_SHORT.filter(d => customSchedule[d] > 0).map(d => `${d}×${customSchedule[d]}`).join('  ')}
            </p>
          )}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button disabled={isBusy} onClick={() => onToggle(sub.id)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
              sub.is_active ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-green-50 text-green-700 hover:bg-green-100'
            }`}>
            {sub.is_active ? 'Pause' : 'Resume'}
          </button>
          {confirmCancel ? (
            <div className="flex items-center gap-1">
              <button disabled={isBusy} onClick={() => onCancel(sub.id)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition">
                {isBusy ? '…' : 'Yes, cancel'}
              </button>
              <button onClick={() => setConfirmCancel(false)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                Keep
              </button>
            </div>
          ) : (
            <button disabled={isBusy} onClick={() => setConfirmCancel(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Next delivery strip */}
      <div className="border-t border-gray-50 px-4 py-3 flex items-center justify-between bg-gray-50/60">
        <div>
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Next delivery</p>
          <p className={`text-sm font-bold ${nextColor}`}>{nextLabel}</p>
          {sub.next_delivery && <p className="text-xs text-gray-400">{fmtDate(sub.next_delivery)}</p>}
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Completed</p>
          <p className="text-xl font-black text-forest-600">{sub.delivery_count || 0}</p>
        </div>
      </div>

      {/* Items */}
      {items.length > 0 && (
        <div className="border-t border-gray-50 px-4 py-3 space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between text-sm text-gray-600">
              <span>{item.emoji} {item.name} <span className="text-gray-400 text-xs">×{item.quantity} {item.unit}</span></span>
              <span className="font-medium text-gray-700">₹{(item.price * item.quantity).toFixed(0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function AddrField({ label, placeholder, value, onChange, error, required, textarea, type = 'text', prefix }) {
  const cls = `input-field ${error ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''} ${prefix ? 'pl-12' : ''}`
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">{prefix}</span>}
        {textarea
          ? <textarea rows={2} className={cls + ' resize-none'} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
          : <input type={type} className={cls} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
        }
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    pending:          'bg-amber-100 text-amber-700',
    accepted:         'bg-blue-100 text-blue-700',
    preparing:        'bg-indigo-100 text-indigo-700',
    out_for_delivery: 'bg-violet-100 text-violet-700',
    delivered:        'bg-emerald-100 text-emerald-700',
    cancelled:        'bg-gray-100 text-gray-500',
    rejected:         'bg-red-100 text-red-600',
  }
  const labels = {
    pending:          'Order Placed',
    accepted:         'Accepted',
    preparing:        'Preparing',
    out_for_delivery: 'Out for Delivery 🛵',
    delivered:        'Delivered ✓',
    cancelled:        'Cancelled',
    rejected:         'Rejected',
  }
  return (
    <span className={`badge text-[10px] ${map[status] || map.pending}`}>
      {labels[status] || status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  )
}
