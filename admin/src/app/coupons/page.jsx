'use client'
import { useEffect, useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { couponsAPI } from '../../lib/api'
import { Plus, Trash2, Pencil, X, ToggleLeft, ToggleRight, Shuffle, Tag, TrendingUp, Clock, Users } from 'lucide-react'

const EMPTY = {
  code: '', type: 'percent', value: '', min_order: '0',
  max_discount: '', max_uses: '100', expires_at: '',
  description: '', first_order_only: false,
}

function randomCode() {
  const adj = ['FARM', 'FRESH', 'GREEN', 'ORGANIC', 'RAKSHA', 'HARVEST', 'PURE']
  const num = Math.floor(10 + Math.random() * 90)
  return adj[Math.floor(Math.random() * adj.length)] + num
}

function daysLeft(expiresAt) {
  if (!expiresAt) return null
  const diff = Math.ceil((new Date(expiresAt) - Date.now()) / 86400000)
  return diff
}

function ExpiryBadge({ expiresAt }) {
  if (!expiresAt) return <span className="text-xs text-gray-400">No expiry</span>
  const d = daysLeft(expiresAt)
  if (d < 0) return <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Expired</span>
  if (d === 0) return <span className="text-xs font-medium text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">Expires today</span>
  if (d <= 3)  return <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Expires in {d}d</span>
  return <span className="text-xs text-gray-400">{new Date(expiresAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</span>
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(null)
  const [filter, setFilter] = useState('all') // all | active | inactive | expired

  async function load() {
    try { const { data } = await couponsAPI.getAll(); setCoupons(data) } catch(e) { console.error(e) }
  }
  useEffect(() => { load() }, [])

  function openAdd() { setEditing(null); setForm(EMPTY); setShowModal(true) }
  function openEdit(c) {
    setEditing(c.id)
    setForm({
      code: c.code, type: c.type, value: c.value,
      min_order: c.min_order ?? '0',
      max_discount: c.max_discount ?? '',
      max_uses: c.max_uses ?? '100',
      expires_at: c.expires_at ? c.expires_at.split('T')[0] : '',
      description: c.description ?? '',
      first_order_only: c.first_order_only ?? false,
    })
    setShowModal(true)
  }

  async function handleSave(e) {
    e.preventDefault(); setSaving(true)
    try {
      const payload = {
        ...form,
        max_discount: form.max_discount === '' ? null : Number(form.max_discount),
        first_order_only: !!form.first_order_only,
      }
      if (editing) await couponsAPI.update(editing, payload)
      else await couponsAPI.create(payload)
      setShowModal(false); load()
    } catch(e) { alert(e.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  async function handleToggle(id) {
    setToggling(id)
    try { await couponsAPI.toggle(id); load() } catch(e) { alert('Failed') }
    finally { setToggling(null) }
  }

  async function del(id) {
    if (!confirm('Delete this coupon? This cannot be undone.')) return
    try { await couponsAPI.delete(id); load() } catch(e) { alert('Failed') }
  }

  const filtered = coupons.filter(c => {
    if (filter === 'active')   return c.is_active && (daysLeft(c.expires_at) === null || daysLeft(c.expires_at) >= 0)
    if (filter === 'inactive') return !c.is_active
    if (filter === 'expired')  return c.expires_at && daysLeft(c.expires_at) < 0
    return true
  })

  const totalSavings = coupons.reduce((acc, c) => {
    // approximate total savings generated
    return acc + (c.used_count || 0)
  }, 0)

  const activeCoupons = coupons.filter(c => c.is_active && (daysLeft(c.expires_at) === null || daysLeft(c.expires_at) >= 0))
  const expiredCoupons = coupons.filter(c => c.expires_at && daysLeft(c.expires_at) < 0)

  return (
    <AdminLayout title="Coupons">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Coupons', value: coupons.length, icon: <Tag size={16}/>, color: 'text-[#1B4332] bg-green-50' },
          { label: 'Active', value: activeCoupons.length, icon: <ToggleRight size={16}/>, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Total Uses', value: coupons.reduce((a, c) => a + (c.used_count || 0), 0), icon: <TrendingUp size={16}/>, color: 'text-blue-600 bg-blue-50' },
          { label: 'Expired', value: expiredCoupons.length, icon: <Clock size={16}/>, color: 'text-red-500 bg-red-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${s.color}`}>{s.icon}</div>
            <div>
              <p className="text-xl font-bold text-gray-800">{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {['all', 'active', 'inactive', 'expired'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === f ? 'bg-white text-[#1B4332] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>{f}</button>
          ))}
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-[#1B4332] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-[#163826] transition-colors">
          <Plus size={16}/> Create Coupon
        </button>
      </div>

      {/* Coupon cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Tag size={40} className="mx-auto mb-3 opacity-30"/>
          <p className="font-medium">No coupons found</p>
          <p className="text-sm mt-1">Create your first coupon to offer discounts</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(c => {
            const expired = c.expires_at && daysLeft(c.expires_at) < 0
            const usagePct = c.max_uses > 0 ? Math.min((c.used_count / c.max_uses) * 100, 100) : 0
            return (
              <div key={c.id} className={`bg-white border rounded-2xl p-5 shadow-sm transition-all ${
                !c.is_active || expired ? 'opacity-60 border-gray-100' : 'border-gray-100 hover:border-[#1B4332]/30 hover:shadow-md'
              }`}>
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-lg font-bold text-[#1B4332] font-mono tracking-wide">{c.code}</p>
                      {c.first_order_only && (
                        <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                          <Users size={9}/> New users
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-700 mt-0.5">
                      {c.type === 'percent'
                        ? `${c.value}% off${c.max_discount ? ` (max ₹${c.max_discount})` : ''}`
                        : `₹${c.value} off`}
                    </p>
                    {c.description && <p className="text-xs text-gray-400 mt-1 truncate">{c.description}</p>}
                    {c.min_order > 0 && <p className="text-xs text-gray-400 mt-0.5">Min order ₹{c.min_order}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0 ml-2">
                    <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-400 transition-colors" title="Edit"><Pencil size={14}/></button>
                    <button onClick={() => del(c.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-400 transition-colors" title="Delete"><Trash2 size={14}/></button>
                  </div>
                </div>

                {/* Usage bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>{c.used_count} used</span>
                    <span>{c.max_uses} max</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${usagePct >= 90 ? 'bg-red-400' : usagePct >= 70 ? 'bg-amber-400' : 'bg-[#1B4332]'}`}
                      style={{ width: `${usagePct}%` }}/>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <ExpiryBadge expiresAt={c.expires_at} />
                  <button
                    onClick={() => handleToggle(c.id)}
                    disabled={toggling === c.id}
                    className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
                      c.is_active
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                    title={c.is_active ? 'Click to deactivate' : 'Click to activate'}
                  >
                    {toggling === c.id ? (
                      <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"/>
                    ) : c.is_active ? (
                      <ToggleRight size={14}/>
                    ) : (
                      <ToggleLeft size={14}/>
                    )}
                    {c.is_active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold">{editing ? 'Edit Coupon' : 'Create Coupon'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors"><X size={20} className="text-gray-400"/></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              {/* Code + generator */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Coupon Code *</label>
                <div className="flex gap-2">
                  <input required value={form.code}
                    onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase().replace(/\s/g,'') }))}
                    disabled={!!editing}
                    placeholder="e.g. WELCOME20"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#1B4332] disabled:bg-gray-50"/>
                  {!editing && (
                    <button type="button" onClick={() => setForm(p => ({ ...p, code: randomCode() }))}
                      className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors flex items-center gap-1" title="Generate random code">
                      <Shuffle size={14}/>
                    </button>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (shown to customers)</label>
                <input value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="e.g. Welcome offer for new customers"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value, max_discount: '' }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]">
                    <option value="percent">Percentage (%)</option>
                    <option value="flat">Flat Amount (₹)</option>
                  </select>
                </div>

                {/* Value */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {form.type === 'percent' ? 'Percentage (%)' : 'Amount (₹)'} *
                  </label>
                  <input required type="number" min="0" max={form.type === 'percent' ? '100' : undefined} step="0.01"
                    value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))}
                    placeholder={form.type === 'percent' ? '10' : '50'}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
                </div>

                {/* Max discount — only for percent type */}
                {form.type === 'percent' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Discount (₹) <span className="text-gray-400 font-normal">optional</span></label>
                    <input type="number" min="0" step="1"
                      value={form.max_discount} onChange={e => setForm(p => ({ ...p, max_discount: e.target.value }))}
                      placeholder="e.g. 100"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
                  </div>
                )}

                {/* Min order */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Order (₹)</label>
                  <input type="number" min="0" value={form.min_order}
                    onChange={e => setForm(p => ({ ...p, min_order: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
                </div>

                {/* Max uses */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Uses</label>
                  <input type="number" min="1" value={form.max_uses}
                    onChange={e => setForm(p => ({ ...p, max_uses: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
                </div>

                {/* Expiry */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                  <input type="date" value={form.expires_at}
                    onChange={e => setForm(p => ({ ...p, expires_at: e.target.value }))}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
                </div>
              </div>

              {/* First order only toggle */}
              <div className="flex items-center justify-between p-4 bg-purple-50 rounded-xl border border-purple-100">
                <div>
                  <p className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Users size={14} className="text-purple-600"/> First Order Only</p>
                  <p className="text-xs text-gray-500 mt-0.5">Only valid for a customer's first order</p>
                </div>
                <button type="button"
                  onClick={() => setForm(p => ({ ...p, first_order_only: !p.first_order_only }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.first_order_only ? 'bg-purple-600' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.first_order_only ? 'translate-x-5' : ''}`}/>
                </button>
              </div>

              {/* Preview */}
              {form.value && (
                <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-sm text-green-700">
                  <span className="font-semibold">Preview: </span>
                  {form.type === 'percent'
                    ? `${form.value}% off${form.max_discount ? ` (up to ₹${form.max_discount})` : ''}`
                    : `₹${form.value} flat discount`}
                  {form.min_order > 0 ? ` on orders above ₹${form.min_order}` : ' on any order'}
                  {form.first_order_only ? ' · First order only' : ''}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-[#1B4332] text-white rounded-xl text-sm font-medium hover:bg-[#163826] disabled:opacity-50 transition-colors">
                  {saving ? 'Saving…' : editing ? 'Update Coupon' : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
