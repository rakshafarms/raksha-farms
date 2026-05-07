import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useOrders } from '../context/OrdersContext'
import { useWishlist } from '../context/WishlistContext'
import { useAddresses } from '../context/AddressContext'

const LABEL_OPTIONS = ['Home', 'Work', 'Hostel', 'Other']
const LABEL_ICONS   = { Home: '🏠', Work: '🏢', Hostel: '🏫', Other: '📍' }

const EMPTY_FORM = { label: 'Home', name: '', phone: '', address: '', city: '', pincode: '', notes: '' }

export default function ProfilePage() {
  const { user, logout, isLoggedIn } = useAuth()
  const { orders }   = useOrders()
  const { wishlist } = useWishlist()
  const { addresses, addAddress, updateAddress, deleteAddress } = useAddresses()
  const navigate     = useNavigate()

  const [activeTab, setActiveTab] = useState('overview')

  // Subscriptions state
  const [mySubs, setMySubs]         = useState([])
  const [subsLoading, setSubsLoading] = useState(false)
  const [busySub, setBusySub]       = useState(null)

  useEffect(() => {
    if (activeTab === 'subscriptions') fetchMySubs()
  }, [activeTab])

  async function fetchMySubs() {
    setSubsLoading(true)
    try {
      const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`${BACKEND_URL}/api/subscriptions/mine`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setMySubs(Array.isArray(data) ? data : [])
    } catch(e) { console.error(e) }
    finally { setSubsLoading(false) }
  }

  async function toggleSub(id) {
    setBusySub(id)
    try {
      const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
      const token = localStorage.getItem('auth_token')
      await fetch(`${BACKEND_URL}/api/subscriptions/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      fetchMySubs()
    } catch(e) { console.error(e) }
    finally { setBusySub(null) }
  }

  async function cancelSub(id) {
    if (!confirm('Cancel this subscription? This cannot be undone.')) return
    setBusySub(id)
    try {
      const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
      const token = localStorage.getItem('auth_token')
      await fetch(`${BACKEND_URL}/api/subscriptions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      fetchMySubs()
    } catch(e) { console.error(e) }
    finally { setBusySub(null) }
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null
    return Math.ceil((new Date(dateStr) - new Date()) / 86400000)
  }

  // Address form state
  const [showForm, setShowForm]       = useState(false)
  const [editingId, setEditingId]     = useState(null)
  const [formData, setFormData]       = useState(EMPTY_FORM)
  const [formErrors, setFormErrors]   = useState({})
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
        <p className="text-gray-400 mb-5">Access your orders, wishlist, and preferences</p>
        <Link to="/login" className="btn-primary">Sign In / Sign Up</Link>
      </div>
    )
  }

  const deliveredOrders = orders.filter((o) => o.status === 'delivered')
  const totalSpent      = deliveredOrders.reduce((s, o) => s + o.total, 0)

  const TABS = [
    { id: 'overview',       label: 'Overview' },
    { id: 'subscriptions',  label: `Subscriptions${mySubs.length ? ` (${mySubs.length})` : ''}` },
    { id: 'addresses',      label: `Addresses${addresses.length ? ` (${addresses.length})` : ''}` },
    { id: 'orders',         label: `Orders (${orders.length})` },
  ]

  // ── Address form helpers ──────────────────────────────────────────────────
  function openAdd() {
    setEditingId(null)
    setFormData(EMPTY_FORM)
    setFormErrors({})
    setShowForm(true)
  }

  function openEdit(addr) {
    setEditingId(addr.id)
    setFormData({
      label:   addr.label   || 'Home',
      name:    addr.name    || '',
      phone:   addr.phone   || '',
      address: addr.address || '',
      city:    addr.city    || '',
      pincode: addr.pincode || '',
      notes:   addr.notes   || '',
    })
    setFormErrors({})
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setFormErrors({})
  }

  function setField(key, value) {
    setFormData(prev => ({ ...prev, [key]: value }))
    if (formErrors[key]) setFormErrors(prev => ({ ...prev, [key]: '' }))
  }

  function validate() {
    const errs = {}
    if (!formData.name.trim())    errs.name    = 'Name is required'
    if (!formData.phone.trim() || formData.phone.replace(/\D/g, '').length < 10)
                                   errs.phone   = 'Valid 10-digit phone required'
    if (!formData.address.trim()) errs.address = 'Address is required'
    if (!formData.city.trim())    errs.city    = 'City is required'
    if (!formData.pincode.trim() || formData.pincode.replace(/\D/g, '').length !== 6)
                                   errs.pincode = 'Valid 6-digit pincode required'
    return errs
  }

  function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length) { setFormErrors(errs); return }
    if (editingId) {
      updateAddress(editingId, formData)
    } else {
      addAddress(formData)
    }
    closeForm()
  }

  function handleDelete(id) {
    deleteAddress(id)
    setDeleteConfirm(null)
  }

  return (
    <div className="page-enter max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-8">

      {/* Profile header */}
      <div className="card p-6 mb-6 flex items-center gap-5 flex-wrap">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-forest-400 to-forest-600 flex items-center justify-center text-white font-black text-3xl shadow-forest flex-shrink-0 relative overflow-hidden">
          {user?.name?.[0]?.toUpperCase()}
          {user?.avatar && (
            <img
              src={user.avatar}
              alt={user.name}
              className="absolute inset-0 w-full h-full object-cover rounded-2xl"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-black text-gray-800">{user?.name}</h1>
          <p className="text-gray-400 text-sm">{user?.email}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="badge bg-forest-100 text-forest-600 text-[10px]">
              {user?.provider === 'google' ? 'Google Account' : 'Email Account'}
            </span>
            <span className="text-xs text-gray-400">Member since {user?.createdAt ? new Date(user.createdAt).getFullYear() : '2024'}</span>
          </div>
        </div>
        <button
          onClick={() => { logout(); navigate('/') }}
          className="text-sm text-red-400 hover:text-red-600 font-medium border border-red-200 hover:border-red-400 px-4 py-2 rounded-xl transition-all flex-shrink-0"
        >
          Sign Out
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatBox value={orders.length}  label="Total Orders" color="text-forest-500" />
        <StatBox value={deliveredOrders.length} label="Completed"   color="text-green-600" />
        <StatBox value={`₹${totalSpent}`} label="Total Spent" color="text-earth-600" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5 w-fit flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === t.id ? 'bg-white text-forest-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div className="space-y-4 animate-slide-up">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { icon: '📦', label: 'My Orders',           to: '/my-orders' },
              { icon: '❤️', label: `Wishlist (${wishlist.length})`, to: '/wishlist' },
              { icon: '📍', label: `Addresses (${addresses.length})`, onClick: () => setActiveTab('addresses') },
              { icon: '📞', label: 'Contact Support',      to: 'tel:+919346566945', external: true },
            ].map((item) =>
              item.external ? (
                <a key={item.label} href={item.to} className="card p-4 flex flex-col items-center gap-2 text-center hover:shadow-soft transition-all">
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-sm font-semibold text-gray-700">{item.label}</span>
                </a>
              ) : item.onClick ? (
                <button key={item.label} onClick={item.onClick} className="card p-4 flex flex-col items-center gap-2 text-center hover:shadow-soft transition-all w-full">
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-sm font-semibold text-gray-700">{item.label}</span>
                </button>
              ) : (
                <Link key={item.label} to={item.to} className="card p-4 flex flex-col items-center gap-2 text-center hover:shadow-soft transition-all">
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-sm font-semibold text-gray-700">{item.label}</span>
                </Link>
              )
            )}
          </div>
        </div>
      )}

      {/* ── ADDRESSES ── */}
      {/* ── SUBSCRIPTIONS ── */}
      {activeTab === 'subscriptions' && (
        <div className="animate-slide-up space-y-4">
          {subsLoading ? (
            <div className="card p-12 text-center text-gray-400">Loading your subscriptions…</div>
          ) : mySubs.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-4xl mb-3">🔄</p>
              <p className="font-semibold text-gray-600 mb-1">No active subscriptions</p>
              <p className="text-sm text-gray-400 mb-4">Subscribe during checkout to get regular deliveries</p>
              <Link to="/" className="btn-primary inline-flex text-sm">Shop & Subscribe</Link>
            </div>
          ) : (
            mySubs.map(sub => {
              const items = Array.isArray(sub.items) ? sub.items : []
              const days  = daysUntil(sub.next_delivery)
              const isBusy = busySub === sub.id

              let deliveryLabel = '—'
              let deliveryColor = 'text-gray-500'
              if (days !== null) {
                if (days < 0)   { deliveryLabel = `Overdue by ${Math.abs(days)} day${Math.abs(days)>1?'s':''}`; deliveryColor = 'text-red-500' }
                else if (days === 0) { deliveryLabel = 'Today!'; deliveryColor = 'text-green-600' }
                else if (days === 1) { deliveryLabel = 'Tomorrow'; deliveryColor = 'text-orange-500' }
                else               { deliveryLabel = `In ${days} days`; deliveryColor = 'text-gray-600' }
              }

              return (
                <div key={sub.id} className={`card p-5 ${!sub.is_active ? 'opacity-70' : ''}`}>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">🔄</span>
                        <p className="font-bold text-gray-900">{sub.plan_name || 'Subscription'}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sub.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {sub.is_active ? 'Active' : 'Paused'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 capitalize">{sub.frequency} delivery · ₹{parseFloat(sub.price_per_cycle||0).toFixed(0)}/cycle</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={isBusy}
                        onClick={() => toggleSub(sub.id)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${sub.is_active ? 'bg-orange-50 text-orange-600 hover:bg-orange-100' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
                      >
                        {sub.is_active ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        disabled={isBusy}
                        onClick={() => cancelSub(sub.id)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>

                  {/* Delivery countdown */}
                  <div className="bg-sage-50 rounded-xl p-3 mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Next Delivery</p>
                      <p className={`font-bold text-sm mt-0.5 ${deliveryColor}`}>{deliveryLabel}</p>
                      {sub.next_delivery && (
                        <p className="text-xs text-gray-400">{new Date(sub.next_delivery).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 font-medium">Deliveries Done</p>
                      <p className="font-bold text-2xl text-forest-600">{sub.delivery_count || 0}</p>
                    </div>
                  </div>

                  {/* Items */}
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Items</p>
                    <div className="space-y-1.5">
                      {items.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm text-gray-700">
                          <span>{item.emoji} {item.name} ×{item.quantity} {item.unit}</span>
                          <span className="font-medium">₹{item.price * item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {activeTab === 'addresses' && (
        <div className="animate-slide-up space-y-4">

          {/* Add address button */}
          <button
            onClick={openAdd}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-forest-300 hover:border-forest-500 hover:bg-forest-50 text-forest-600 font-semibold transition-all group"
          >
            <span className="w-9 h-9 rounded-full bg-forest-100 group-hover:bg-forest-200 flex items-center justify-center text-lg transition-colors flex-shrink-0">+</span>
            Add New Address
          </button>

          {/* Address list */}
          {addresses.length === 0 ? (
            <div className="text-center py-12 card">
              <p className="text-4xl mb-3">📍</p>
              <p className="font-semibold text-gray-600 mb-1">No saved addresses yet</p>
              <p className="text-sm text-gray-400 mb-4">Save your home, work or hostel address for faster checkout</p>
              <button onClick={openAdd} className="btn-primary inline-flex text-sm">Add Address</button>
            </div>
          ) : (
            <div className="space-y-3">
              {addresses.map((addr) => (
                <div key={addr.id} className="card p-4 flex items-start gap-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl bg-forest-50 flex items-center justify-center text-xl flex-shrink-0">
                    {LABEL_ICONS[addr.label] || '📍'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-gray-800 text-sm">{addr.label}</span>
                      <span className="text-xs text-gray-400">{addr.name} · {addr.phone}</span>
                    </div>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      {addr.address}, {addr.city} – {addr.pincode}
                    </p>
                    {addr.notes && (
                      <p className="text-xs text-gray-400 mt-0.5 italic">Note: {addr.notes}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(addr)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-700"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(addr.id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-500"
                      title="Delete"
                    >
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
        <div className="animate-slide-up space-y-3">
          {orders.length === 0 ? (
            <div className="text-center py-16 card">
              <p className="text-5xl mb-3">📦</p>
              <p className="font-semibold text-gray-600 mb-1">No orders yet</p>
              <p className="text-gray-400 text-sm mb-4">Your past orders will appear here</p>
              <Link to="/" className="btn-primary inline-flex text-sm">Shop Now</Link>
            </div>
          ) : (
            [...orders].reverse().map((order) => (
              <Link key={order.orderId} to={`/track/${order.orderId}`} className="card p-4 flex items-center gap-4 hover:shadow-soft transition-all block">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-sm font-bold text-gray-700">#{order.orderId.slice(-8)}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="text-xs text-gray-400">{new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-forest-500 text-lg">₹{order.total}</p>
                  <svg className="w-4 h-4 text-gray-300 ml-auto mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {/* ── Add / Edit Address Modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={closeForm}>
          <div
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-3xl sm:rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-gray-800">
                {editingId ? 'Edit Address' : 'Add New Address'}
              </h2>
              <button onClick={closeForm} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Label picker */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Save as</p>
                <div className="flex gap-2 flex-wrap">
                  {LABEL_OPTIONS.map(lbl => (
                    <button
                      key={lbl}
                      onClick={() => setField('label', lbl)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                        formData.label === lbl
                          ? 'border-forest-500 bg-forest-50 text-forest-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {LABEL_ICONS[lbl]} {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <AddrField label="Full Name" placeholder="e.g. Priya Sharma" value={formData.name}
                onChange={v => setField('name', v)} error={formErrors.name} required />

              {/* Phone */}
              <AddrField label="Mobile Number" placeholder="10-digit number" type="tel"
                value={formData.phone} onChange={v => setField('phone', v.replace(/\D/g, '').slice(0, 10))}
                error={formErrors.phone} required prefix="+91" />

              {/* Address */}
              <AddrField label="Street Address" placeholder="House no., Street, Locality"
                value={formData.address} onChange={v => setField('address', v)}
                error={formErrors.address} required textarea />

              {/* City + Pincode */}
              <div className="grid grid-cols-2 gap-3">
                <AddrField label="City" placeholder="e.g. Hyderabad"
                  value={formData.city} onChange={v => setField('city', v)}
                  error={formErrors.city} required />
                <AddrField label="Pincode" placeholder="6 digits" type="text"
                  value={formData.pincode} onChange={v => setField('pincode', v.replace(/\D/g, '').slice(0, 6))}
                  error={formErrors.pincode} required />
              </div>

              {/* Notes */}
              <AddrField label="Delivery Notes (optional)" placeholder="Gate code, landmark…"
                value={formData.notes} onChange={v => setField('notes', v)} textarea />

              {/* Save button */}
              <button onClick={handleSave} className="btn-primary w-full mt-2">
                {editingId ? 'Save Changes' : 'Save Address'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm dialog ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-3xl mb-3 text-center">🗑️</div>
            <h3 className="text-lg font-bold text-gray-800 text-center mb-1">Delete Address?</h3>
            <p className="text-sm text-gray-400 text-center mb-5">This address will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Sub-components ── */
function StatBox({ value, label, color }) {
  return (
    <div className="card p-4 text-center">
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5 font-medium">{label}</p>
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
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">
            {prefix}
          </span>
        )}
        {textarea ? (
          <textarea rows={2} className={cls + ' resize-none'} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
        ) : (
          <input type={type} className={cls} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
        )}
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    pending:          'bg-yellow-100 text-yellow-700',
    accepted:         'bg-blue-100 text-blue-700',
    out_for_delivery: 'bg-purple-100 text-purple-700',
    delivered:        'bg-forest-100 text-forest-700',
    rejected:         'bg-red-100 text-red-600',
  }
  return (
    <span className={`badge text-[10px] ${map[status] || map.pending}`}>
      {status?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
    </span>
  )
}
