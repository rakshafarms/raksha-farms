'use client'
import { useEffect, useState, useCallback } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { customersAPI } from '../../lib/api'
import {
  Search, UserCheck, UserX, X, ShoppingBag,
  Phone, Mail, Calendar, TrendingUp, Users, Shield, Ban
} from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────────────────────
const fmt    = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '—'
const timeAgo = (iso) => {
  if (!iso) return '—'
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30)  return `${d}d ago`
  if (d < 365) return `${Math.floor(d/30)}mo ago`
  return `${Math.floor(d/365)}y ago`
}

// Deterministic avatar color from name
const AVATAR_COLORS = [
  'from-blue-500 to-blue-700', 'from-violet-500 to-violet-700',
  'from-emerald-500 to-emerald-700', 'from-rose-500 to-rose-700',
  'from-amber-500 to-amber-700', 'from-cyan-500 to-cyan-700',
]
const avatarColor = (name = '') =>
  AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length]

// ── Stat card ─────────────────────────────────────────────────────────────────
function Stat({ label, value, icon, color }) {
  return (
    <div className={`bg-white rounded-2xl px-5 py-4 border border-gray-100 shadow-sm flex items-center gap-4`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-extrabold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-400 font-medium mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ── Order drawer ──────────────────────────────────────────────────────────────
function OrderDrawer({ customer, onClose }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    customersAPI.getOrders(customer.id)
      .then(r => setOrders(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [customer.id])

  const STATUS_PILL = {
    placed:           'bg-blue-50 text-blue-700',
    accepted:         'bg-teal-50 text-teal-700',
    preparing:        'bg-amber-50 text-amber-700',
    out_for_delivery: 'bg-violet-50 text-violet-700',
    delivered:        'bg-emerald-50 text-emerald-700',
    cancelled:        'bg-gray-100 text-gray-500',
    rejected:         'bg-red-50 text-red-600',
  }
  const STATUS_LABEL = {
    placed:'Placed', accepted:'Accepted', preparing:'Preparing',
    out_for_delivery:'Out for Delivery', delivered:'Delivered',
    cancelled:'Cust. Cancelled', rejected:'Admin Cancelled',
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarColor(customer.name)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
            {customer.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 truncate">{customer.name}</p>
            <p className="text-xs text-gray-400 truncate">{customer.email}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors flex-shrink-0">
            <X size={16}/>
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-px bg-gray-100 border-b border-gray-100">
          {[
            { label: 'Orders', value: customer.total_orders },
            { label: 'Spent', value: fmt(customer.total_spent) },
            { label: 'Last Order', value: timeAgo(customer.last_order_at) },
          ].map(s => (
            <div key={s.label} className="bg-white px-4 py-3 text-center">
              <p className="text-sm font-extrabold text-gray-900">{s.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Order list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin"/>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
              <ShoppingBag size={32} className="opacity-30"/>
              <p className="text-sm">No orders yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {orders.map(o => {
                const items = Array.isArray(o.items) ? o.items : []
                return (
                  <div key={o.id} className="px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 mb-1">{fmtDate(o.created_at)}</p>
                        <p className="text-sm text-gray-600 truncate">
                          {items.slice(0,2).map(i => i.name).join(', ')}
                          {items.length > 2 ? ` +${items.length-2}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="font-bold text-gray-900 text-sm">{fmt(o.total)}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_PILL[o.status] || 'bg-gray-100 text-gray-500'}`}>
                          {STATUS_LABEL[o.status] || o.status}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const [customers, setCustomers] = useState([])
  const [total, setTotal]         = useState(0)
  const [pages, setPages]         = useState(1)
  const [page, setPage]           = useState(1)
  const [stats, setStats]         = useState({})
  const [search, setSearch]       = useState('')
  const [filter, setFilter]       = useState('')   // '' | 'active' | 'blocked'
  const [loading, setLoading]     = useState(true)
  const [drawer, setDrawer]       = useState(null) // customer obj

  const load = useCallback(async (overrides = {}) => {
    setLoading(true)
    try {
      const params = {
        search: overrides.search ?? search,
        status: overrides.filter ?? filter,
        page:   overrides.page   ?? page,
        limit:  15,
      }
      Object.keys(params).forEach(k => !params[k] && delete params[k])
      const { data } = await customersAPI.getAll(params)
      setCustomers(data.customers)
      setTotal(data.total)
      setPages(data.pages || 1)
      if (data.stats) setStats(data.stats)
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }, [search, filter, page])

  useEffect(() => { load() }, [page, filter])

  function applySearch() { setPage(1); load({ page: 1 }) }
  function setF(f) { setFilter(f); setPage(1); load({ filter: f, page: 1 }) }

  async function toggle(id) {
    try {
      const { data } = await customersAPI.toggle(id)
      setCustomers(prev => prev.map(c => c.id === id ? { ...c, is_active: data.is_active } : c))
      if (drawer?.id === id) setDrawer(prev => ({ ...prev, is_active: data.is_active }))
    } catch { alert('Action failed') }
  }

  return (
    <AdminLayout title="Customers">
      {drawer && <OrderDrawer customer={drawer} onClose={() => setDrawer(null)}/>}

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <Stat label="Total Customers" value={stats.total || 0}   icon={<Users size={20} className="text-white"/>}  color="bg-gradient-to-br from-[#1B4332] to-emerald-600"/>
        <Stat label="Active"          value={stats.active || 0}  icon={<Shield size={20} className="text-white"/>} color="bg-gradient-to-br from-blue-500 to-blue-700"/>
        <Stat label="Blocked"         value={stats.blocked || 0} icon={<Ban size={20} className="text-white"/>}    color="bg-gradient-to-br from-red-500 to-red-700"/>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-52">
          <Search size={14} className="text-gray-400 flex-shrink-0"/>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && applySearch()}
            placeholder="Search by name, email or phone…" className="outline-none text-sm flex-1 bg-transparent"/>
          {search && <button onClick={() => { setSearch(''); load({ search: '' }) }}><X size={12} className="text-gray-400 hover:text-gray-600"/></button>}
        </div>

        <div className="flex gap-1.5">
          {[['', 'All'], ['active', 'Active'], ['blocked', 'Blocked']].map(([val, label]) => (
            <button key={val} onClick={() => setF(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                filter === val
                  ? val === '' ? 'bg-gray-900 text-white border-gray-900'
                  : val === 'active' ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-red-500 text-white border-red-500'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-400 ml-auto">{total} customer{total !== 1 ? 's' : ''}</p>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100">
              {['Customer', 'Contact', 'Orders', 'Total Spent', 'Last Order', 'Joined', 'Status', ''].map(h => (
                <th key={h} className={`px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider ${h === 'Orders' || h === 'Total Spent' ? 'text-right' : h === 'Status' ? 'text-center' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-16 text-center">
                <div className="inline-block w-6 h-6 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin"/>
              </td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={8} className="py-16 text-center text-gray-400">
                <Users size={32} className="mx-auto mb-2 opacity-20"/>
                <p className="text-sm">No customers found</p>
              </td></tr>
            ) : customers.map(c => (
              <tr key={c.id}
                onClick={() => setDrawer(c)}
                className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors">

                {/* Avatar + name */}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarColor(c.name)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                      {c.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[180px]">{c.email}</p>
                    </div>
                  </div>
                </td>

                {/* Contact */}
                <td className="px-4 py-3.5">
                  {c.phone
                    ? <span className="flex items-center gap-1.5 text-xs text-gray-600"><Phone size={11} className="text-gray-400"/>{c.phone}</span>
                    : <span className="text-gray-300 text-xs">—</span>
                  }
                </td>

                {/* Orders */}
                <td className="px-4 py-3.5 text-right">
                  <span className="font-bold text-gray-900">{c.total_orders}</span>
                </td>

                {/* Spent */}
                <td className="px-4 py-3.5 text-right">
                  <span className="font-bold text-emerald-700">{fmt(c.total_spent)}</span>
                </td>

                {/* Last order */}
                <td className="px-4 py-3.5">
                  <span className="text-xs text-gray-500">{timeAgo(c.last_order_at)}</span>
                </td>

                {/* Joined */}
                <td className="px-4 py-3.5">
                  <span className="text-xs text-gray-400">{fmtDate(c.created_at)}</span>
                </td>

                {/* Status */}
                <td className="px-4 py-3.5 text-center">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                    c.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${c.is_active ? 'bg-emerald-500' : 'bg-red-500'}`}/>
                    {c.is_active ? 'Active' : 'Blocked'}
                  </span>
                </td>

                {/* Action */}
                <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => toggle(c.id)}
                    title={c.is_active ? 'Block customer' : 'Unblock customer'}
                    className={`p-2 rounded-xl transition-colors ${
                      c.is_active
                        ? 'text-red-400 hover:bg-red-50 hover:text-red-600'
                        : 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700'
                    }`}>
                    {c.is_active ? <UserX size={15}/> : <UserCheck size={15}/>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {!loading && total > 15 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Showing {((page-1)*15)+1}–{Math.min(page*15, total)} of <span className="font-semibold text-gray-700">{total}</span>
            </p>
            <div className="flex gap-1.5">
              <button disabled={page <= 1} onClick={() => setPage(p => p-1)}
                className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50 transition-colors">← Prev</button>
              <span className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-gray-100 rounded-lg">Page {page}</span>
              <button disabled={page >= pages} onClick={() => setPage(p => p+1)}
                className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50 transition-colors">Next →</button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
