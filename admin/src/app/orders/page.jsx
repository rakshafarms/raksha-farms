'use client'
import React, { useEffect, useState, useCallback, useRef } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { ordersAPI } from '../../lib/api'
import {
  Search, RefreshCw, Download, X, AlertTriangle,
  CheckCircle, ChevronDown, ChevronUp, Phone, MapPin,
  Package, Clock, CreditCard, Smartphone, Banknote,
  Calendar, Filter
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUSES = ['placed','accepted','preparing','out_for_delivery','delivered','cancelled','rejected']
const STATUS_META = {
  placed:           { label: 'Placed',          dot: 'bg-blue-500',    pill: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  accepted:         { label: 'Accepted',         dot: 'bg-teal-500',    pill: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200' },
  preparing:        { label: 'Preparing',        dot: 'bg-amber-500',   pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  out_for_delivery: { label: 'Out for Delivery', dot: 'bg-violet-500',  pill: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
  delivered:        { label: 'Delivered',        dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  cancelled:        { label: 'Cancelled by Customer', dot: 'bg-gray-400',    pill: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200' },
  rejected:         { label: 'Rejected by Admin',   dot: 'bg-red-500',     pill: 'bg-red-50 text-red-600 ring-1 ring-red-200' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt    = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`
// Format order ID as ddmmyyhhmmss in IST
const fmtOrderId = (iso) => {
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
const parseAddr = (o) => {
  try { return typeof o.address === 'string' ? JSON.parse(o.address || '{}') : (o.address || {}) }
  catch { return {} }
}
const parseNotes = (o) => {
  try {
    if (!o.notes) return null
    const p = typeof o.notes === 'string' ? JSON.parse(o.notes) : o.notes
    return p?.rejected_items?.length ? p : null
  } catch { return null }
}

// Date label for grouping – returns "Today", "Yesterday", or "DD MMM YYYY"
const dateGroupLabel = (iso) => {
  const d   = new Date(iso)
  const now = new Date()
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const ordDay    = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (+ordDay === +today)     return 'Today'
  if (+ordDay === +yesterday) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
}

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true })

// ── Status Badge ─────────────────────────────────────────────────────────────
function StatusPill({ status, isPartial }) {
  if (isPartial)
    return <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 ring-1 ring-orange-200">
      <span className="w-1.5 h-1.5 rounded-full bg-orange-500"/>{'⚠️'} Partial
    </span>
  const m = STATUS_META[status] || { label: status, dot:'bg-gray-400', pill:'bg-gray-100 text-gray-600 ring-1 ring-gray-200' }
  return <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${m.pill}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`}/>{m.label}
  </span>
}

// ── Reject Modal ──────────────────────────────────────────────────────────────
function RejectModal({ order, onClose, onConfirm }) {
  const items = Array.isArray(order.items) ? order.items : []
  const [checkedIds, setCheckedIds] = useState(new Set())
  const [remarks, setRemarks]       = useState('')
  const [submitting, setSubmitting] = useState(false)

  const toggle = (idx) => setCheckedIds(prev => {
    const next = new Set(prev); next.has(idx) ? next.delete(idx) : next.add(idx); return next
  })
  const allSelected  = checkedIds.size === items.length && items.length > 0
  const noneSelected = checkedIds.size === 0
  const isPartial    = checkedIds.size > 0 && checkedIds.size < items.length
  const rejTotal     = items.filter((_,i) => checkedIds.has(i)).reduce((s,it) => s + it.price * it.quantity, 0)

  async function submit() {
    if (noneSelected) { alert('Select at least one item'); return }
    setSubmitting(true)
    const rejected = items.filter((_,i) => checkedIds.has(i))
      .map(it => ({ id:it.id, name:it.name, quantity:it.quantity, price:it.price, unit:it.unit, emoji:it.emoji }))
    await onConfirm(allSelected ? 'rejected' : 'accepted', remarks, rejected)
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Reject Order Items</h2>
            <p className="text-xs text-gray-400 mt-0.5 font-mono font-bold">#{order.created_at ? fmtOrderId(order.created_at) : order.id?.slice(0,8)}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><X size={16}/></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Select items to reject</p>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {items.map((item, i) => (
                <label key={i} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${checkedIds.has(i) ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100 hover:border-gray-200'}`}>
                  <input type="checkbox" checked={checkedIds.has(i)} onChange={() => toggle(i)} className="w-4 h-4 accent-red-500 flex-shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.emoji} {item.name}</p>
                    <p className="text-xs text-gray-400">× {item.quantity} {item.unit} · {fmt(item.price * item.quantity)}</p>
                  </div>
                  {checkedIds.has(i) && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold flex-shrink-0">Reject</span>}
                </label>
              ))}
            </div>
          </div>

          {!noneSelected && (
            <div className={`p-3 rounded-xl text-xs ${allSelected ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
              <p className={`font-bold ${allSelected ? 'text-red-700' : 'text-amber-700'}`}>
                {allSelected ? '❌ Full rejection → status: Rejected' : `⚠️ Partial rejection (${checkedIds.size}/${items.length} items) → status: Accepted`}
              </p>
              <p className="text-gray-500 mt-0.5">Rejected value: {fmt(rejTotal)} — stock restored automatically</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Reason <span className="font-normal normal-case text-gray-400">(shown to customer)</span></label>
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
              placeholder="e.g. Out of stock, quality issue…" rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"/>
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 text-sm transition-colors">Cancel</button>
          <button onClick={submit} disabled={submitting || noneSelected}
            className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-colors">
            {submitting ? 'Processing…' : allSelected ? 'Reject Order' : 'Partial Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Order Row (expanded card) ──────────────────────────────────────────────────
function OrderRow({ o, expanded, onToggle, onChangeStatus, onReject }) {
  const isOpen  = expanded === o.id
  const addr    = parseAddr(o)
  const notes   = parseNotes(o)
  const partial = notes && o.status === 'accepted'
  const isFinal = ['delivered','cancelled','rejected'].includes(o.status)
  const phone   = addr.phone || o.customer_phone || ''
  const name    = addr.name  || o.customer_name  || 'Guest'

  return (
    <div className={`border border-gray-100 rounded-2xl overflow-hidden transition-shadow hover:shadow-md ${isOpen ? 'shadow-md' : 'shadow-sm'}`}>
      {/* ── Summary row ── */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 bg-white cursor-pointer select-none"
        onClick={onToggle}
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1B4332] to-emerald-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {name[0]?.toUpperCase()}
        </div>

        {/* Name + time */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            <span className="font-mono font-bold text-gray-600">#{fmtOrderId(o.created_at)}</span>
            <span className="mx-1">·</span>{fmtTime(o.created_at)}
          </p>
        </div>

        {/* Items preview */}
        <div className="hidden sm:block flex-1 min-w-0 text-xs text-gray-500 truncate px-2">
          {(Array.isArray(o.items) ? o.items : []).slice(0,2).map(it => it.name).join(', ')}
          {(o.items?.length || 0) > 2 ? ` +${o.items.length - 2} more` : ''}
        </div>

        {/* Payment */}
        <div className="hidden md:flex flex-shrink-0">
          {o.payment_method === 'upi'
            ? <span className="flex items-center gap-1 text-xs font-medium text-violet-600 bg-violet-50 px-2 py-1 rounded-lg"><Smartphone size={11}/>UPI</span>
            : o.payment_method === 'card'
            ? <span className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-lg"><CreditCard size={11}/>Card</span>
            : <span className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-lg"><Banknote size={11}/>COD</span>
          }
        </div>

        {/* Amount */}
        <div className="flex-shrink-0 text-right">
          {notes && notes.original_total > Number(o.total) && (
            <p className="text-[10px] text-gray-400 line-through leading-none">{fmt(notes.original_total)}</p>
          )}
          <p className="font-bold text-gray-900 text-sm">{fmt(o.total)}</p>
        </div>

        {/* Status */}
        <div className="flex-shrink-0 ml-2">
          <StatusPill status={o.status} isPartial={partial}/>
        </div>

        {/* Actions (stop propagation) */}
        <div className="flex-shrink-0 flex items-center gap-1.5 ml-2" onClick={e => e.stopPropagation()}>
          <select
            value={o.status}
            onChange={e => onChangeStatus(o.id, e.target.value)}
            disabled={isFinal}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B4332] bg-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>)}
          </select>
          {!isFinal && (
            <button
              onClick={() => onReject({ ...o, items: Array.isArray(o.items) ? o.items : [] })}
              title="Reject items"
              className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
            >
              <AlertTriangle size={14}/>
            </button>
          )}
        </div>

        {/* Expand icon */}
        <div className="flex-shrink-0 text-gray-300">
          {isOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {isOpen && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">

            {/* Items list — 3 cols */}
            <div className="md:col-span-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">Items Ordered</p>

              {/* Partial rejection banner */}
              {notes?.rejected_items?.length > 0 && (
                <div className={`mb-3 px-3 py-2.5 rounded-xl text-xs border ${partial ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                  <p className={`font-bold mb-1.5 ${partial ? 'text-amber-700' : 'text-red-700'}`}>
                    {partial ? '⚠️ Partially Rejected' : '❌ All Items Rejected'}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {notes.rejected_items.map((r, i) => (
                      <span key={i} className="px-2 py-0.5 bg-red-100 text-red-700 font-semibold rounded-full">
                        ✕ {r.name}
                      </span>
                    ))}
                  </div>
                  {notes.remarks && <p className="mt-1.5 text-gray-500 italic">"{notes.remarks}"</p>}
                </div>
              )}

              <div className="space-y-1.5">
                {(Array.isArray(o.items) ? o.items : []).map((item, i) => {
                  const rej = notes?.rejected_items?.some(r => r.id === item.id || r.name === item.name)
                  return (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm ${rej ? 'bg-red-50 opacity-60' : 'bg-white border border-gray-100'}`}>
                      <span className={`flex items-center gap-2 ${rej ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                        <span>{item.emoji}</span>
                        <span>{item.name}</span>
                        <span className="text-gray-400 text-xs">× {item.quantity} {item.unit}</span>
                        {rej && <span className="no-underline not-italic text-[10px] bg-red-200 text-red-700 px-1.5 py-0.5 rounded-full font-bold ml-1">Rejected</span>}
                      </span>
                      <span className={`font-semibold flex-shrink-0 ml-2 ${rej ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {fmt(item.price * item.quantity)}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="flex justify-between items-center mt-2.5 px-3 py-2 bg-white rounded-xl border border-gray-100 font-bold text-gray-900 text-sm">
                <span>Order Total</span>
                <span>{fmt(o.total)}</span>
              </div>
            </div>

            {/* Delivery info — 2 cols */}
            <div className="md:col-span-2 space-y-3">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">Delivery Details</p>
                <div className="bg-white border border-gray-100 rounded-xl p-3 space-y-2.5 text-sm">
                  <div className="flex items-start gap-2">
                    <Package size={13} className="text-gray-400 mt-0.5 flex-shrink-0"/>
                    <div>
                      <p className="font-semibold text-gray-800">{addr.name || o.customer_name || '—'}</p>
                      {o.customer_email && <p className="text-xs text-gray-400">{o.customer_email}</p>}
                    </div>
                  </div>
                  {phone && (
                    <div className="flex items-center gap-2">
                      <Phone size={13} className="text-gray-400 flex-shrink-0"/>
                      <a href={`tel:+91${phone.replace(/\D/g,'').slice(-10)}`} className="text-gray-700 hover:text-[#1B4332] font-medium text-sm">{phone}</a>
                    </div>
                  )}
                  {addr.address && (
                    <div className="flex items-start gap-2">
                      <MapPin size={13} className="text-gray-400 mt-0.5 flex-shrink-0"/>
                      <p className="text-gray-600 text-xs leading-relaxed">{addr.address}{addr.city ? `, ${addr.city}` : ''}{addr.pincode ? ` — ${addr.pincode}` : ''}</p>
                    </div>
                  )}
                  {addr.slot && (
                    <div className="flex items-center gap-2">
                      <Clock size={13} className="text-gray-400 flex-shrink-0"/>
                      <span className="text-xs text-gray-600">{addr.slot}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick call */}
              {phone && (
                <a href={`tel:+91${phone.replace(/\D/g,'').slice(-10)}`}
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#1B4332] hover:bg-[#15362a] text-white text-xs font-bold rounded-xl transition-colors">
                  <Phone size={13}/> Call Customer
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const [orders, setOrders]         = useState([])
  const [total, setTotal]           = useState(0)
  const [pages, setPages]           = useState(1)
  const [page, setPage]             = useState(1)
  const [status, setStatus]         = useState('')
  const [search, setSearch]         = useState('')
  const [fromDate, setFromDate]     = useState('')
  const [toDate, setToDate]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [expanded, setExpanded]     = useState(null)
  const [rejectOrder, setRejectOrder] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [toast, setToast]           = useState(null)
  const [tick, setTick]             = useState(0)
  const filtersRef = useRef({ page, status, search, fromDate, toDate })

  useEffect(() => { filtersRef.current = { page, status, search, fromDate, toDate } }, [page, status, search, fromDate, toDate])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async (overrides = {}) => {
    setLoading(true)
    try {
      const f = filtersRef.current
      const params = {
        page:      overrides.page      ?? f.page,
        limit:     15,
        status:    overrides.status    ?? f.status,
        search:    overrides.search    ?? f.search,
        from_date: overrides.fromDate  ?? f.fromDate,
        to_date:   overrides.toDate    ?? f.toDate,
      }
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k] })
      const { data } = await ordersAPI.getAll(params)
      setOrders(data.orders || [])
      setTotal(data.total   || 0)
      setPages(data.pages   || 1)
    } catch(e) {
      showToast('Failed to load orders', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [page, status, fromDate, toDate, tick, load])

  function forceReload() { setTick(t => t + 1) }
  function applySearch() { setPage(1); load({ page:1, search }) }
  function changeFilter(key, val) {
    setPage(1)
    if (key === 'status')   setStatus(val)
    if (key === 'fromDate') setFromDate(val)
    if (key === 'toDate')   setToDate(val)
  }
  function clearFilters() {
    setStatus(''); setSearch(''); setFromDate(''); setToDate(''); setPage(1)
    forceReload()
  }

  async function changeStatus(id, newStatus) {
    try {
      await ordersAPI.updateStatus(id, newStatus)
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o))
      showToast('Status updated')
    } catch(e) {
      showToast(e.response?.data?.error || 'Update failed', 'error')
    }
  }

  async function handleRejectConfirm(orderId, newStatus, remarks, rejectedItems) {
    try {
      await ordersAPI.updateStatus(orderId, newStatus, { rejection_notes: remarks, rejected_items: rejectedItems })
      const orig   = orders.find(o => o.id === orderId)
      const allIt  = Array.isArray(orig?.items) ? orig.items : []
      const fee    = Number(orig?.delivery_fee || 0)
      const sub    = allIt.reduce((s,it) => s + Number(it.price||0)*Number(it.quantity||1), 0)
      const origTotal = sub > 0 ? sub + fee : Number(orig?.total || 0)
      const rejAmt = rejectedItems.reduce((s,r) => s + Number(r.price||0)*Number(r.quantity||1), 0)
      const all    = rejectedItems.length >= allIt.length
      const adj    = all ? 0 : Math.max(fee, origTotal - rejAmt)
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus, total: adj, notes: JSON.stringify({ remarks, rejected_items: rejectedItems, original_total: origTotal, rejected_amount: rejAmt, adjusted_total: adj }) } : o))
      setRejectOrder(null)
      showToast(newStatus === 'rejected' ? 'Order fully rejected' : 'Partial rejection saved')
    } catch(e) {
      showToast(e.response?.data?.error || 'Rejection failed', 'error')
    }
  }

  async function downloadCSV() {
    setDownloading(true)
    try {
      const params = { page:1, limit:1000, status, search, from_date:fromDate, to_date:toDate }
      Object.keys(params).forEach(k => !params[k] && delete params[k])
      const { data } = await ordersAPI.getAll(params)
      const rows = data.orders || []
      const headers = ['Order ID','Customer','Phone','Address','Items','Payment','Status','Total','Date']
      const lines = rows.map(o => {
        const a = parseAddr(o)
        const items = (Array.isArray(o.items)?o.items:[]).map(i=>`${i.name}×${i.quantity}`).join(' | ')
        const d = new Date(o.created_at)
        const pad = n => String(n).padStart(2,'0')
        return [
          `${pad(d.getDate())}${pad(d.getMonth()+1)}${d.getFullYear()}${pad(d.getHours())}${pad(d.getMinutes())}`,
          a.name||o.customer_name||'Guest',
          a.phone||o.customer_phone||'',
          (a.address||'').replace(/,/g,';'),
          items,
          o.payment_method||'',
          STATUS_META[o.status]?.label||o.status,
          o.total,
          d.toLocaleDateString('en-IN'),
        ].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')
      })
      const blob = new Blob([[headers.join(','),...lines].join('\n')], { type:'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href=url; a.download=`orders-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
    } catch { alert('Download failed') }
    finally { setDownloading(false) }
  }

  // Group orders by IST date
  const grouped = []
  const seen = {}
  for (const o of orders) {
    const label = dateGroupLabel(o.created_at)
    if (!seen[label]) { seen[label] = true; grouped.push({ label, orders:[] }) }
    grouped[grouped.length-1].orders.push(o)
  }

  const activeFilters = [status, search, fromDate, toDate].filter(Boolean).length

  return (
    <AdminLayout title="Orders">
      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-white text-sm font-semibold animate-in slide-in-from-top-2
          ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-500'}`}>
          {toast.type === 'success' ? <CheckCircle size={15}/> : <AlertTriangle size={15}/>}
          {toast.msg}
        </div>
      )}

      {rejectOrder && (
        <RejectModal
          order={rejectOrder}
          onClose={() => setRejectOrder(null)}
          onConfirm={(s,r,items) => handleRejectConfirm(rejectOrder.id, s, r, items)}
        />
      )}

      {/* ── Header row ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">Orders</h1>
          <p className="text-xs text-gray-400 mt-0.5">{total.toLocaleString()} total · Page {page} of {pages}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={forceReload} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors" title="Refresh">
            <RefreshCw size={15} className={loading ? 'animate-spin text-gray-400' : 'text-gray-500'}/>
          </button>
          <button onClick={downloadCSV} disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-sm font-medium text-gray-600 disabled:opacity-50 transition-colors">
            <Download size={14}/>{downloading ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5 space-y-3">
        {/* Row 1: search + dates */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 flex-1 min-w-52">
            <Search size={14} className="text-gray-400 flex-shrink-0"/>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applySearch()}
              placeholder="Search by name, phone, email or order ID…"
              className="outline-none text-sm flex-1 min-w-0 bg-transparent"
            />
            {search && <button onClick={() => { setSearch(''); load({ search:'' }) }}><X size={12} className="text-gray-400 hover:text-gray-600"/></button>}
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-500">
              <Calendar size={13} className="text-gray-400"/>
              <input type="date" value={fromDate} onChange={e => changeFilter('fromDate', e.target.value)}
                className="outline-none text-sm text-gray-700 bg-transparent w-28"/>
            </div>
            <span className="text-gray-300 text-sm">—</span>
            <div className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-3 py-2 text-sm">
              <Calendar size={13} className="text-gray-400"/>
              <input type="date" value={toDate} onChange={e => changeFilter('toDate', e.target.value)}
                className="outline-none text-sm text-gray-700 bg-transparent w-28"/>
            </div>
          </div>

          {activeFilters > 0 && (
            <button onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-semibold hover:bg-red-100 transition-colors">
              <X size={12}/> Clear {activeFilters > 1 ? `(${activeFilters})` : ''}
            </button>
          )}
        </div>

        {/* Row 2: status filter pills */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => changeFilter('status', '')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${!status ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
            All {!status && total > 0 ? `(${total})` : ''}
          </button>
          {STATUSES.map(s => (
            <button key={s} onClick={() => changeFilter('status', s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                status === s
                  ? `${STATUS_META[s].pill} border-transparent`
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${status === s ? STATUS_META[s].dot : 'bg-gray-300'}`}/>
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Orders list ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-8 h-8 border-3 border-[#1B4332] border-t-transparent rounded-full animate-spin"/>
          <p className="text-sm text-gray-400">Loading orders…</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
          <Package size={40} className="opacity-30"/>
          <p className="text-sm font-medium">No orders found</p>
          {activeFilters > 0 && <button onClick={clearFilters} className="text-xs text-[#1B4332] font-semibold underline">Clear filters</button>}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ label, orders: dayOrders }) => (
            <div key={label}>
              {/* Date group header */}
              <div className="flex items-center gap-3 mb-2.5">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-lg ${
                    label === 'Today' ? 'bg-emerald-100 text-emerald-700' :
                    label === 'Yesterday' ? 'bg-blue-50 text-blue-600' :
                    'bg-gray-100 text-gray-500'
                  }`}>{label}</span>
                  <span className="text-xs text-gray-400 font-medium">{dayOrders.length} order{dayOrders.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex-1 h-px bg-gray-100"/>
              </div>

              {/* Orders for this day */}
              <div className="space-y-2">
                {dayOrders.map(o => (
                  <OrderRow
                    key={o.id}
                    o={o}
                    expanded={expanded}
                    onToggle={() => setExpanded(expanded === o.id ? null : o.id)}
                    onChangeStatus={changeStatus}
                    onReject={setRejectOrder}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && orders.length > 0 && (
        <div className="flex items-center justify-between mt-6 py-3 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            Showing {((page-1)*15)+1}–{Math.min(page*15, total)} of <span className="font-semibold text-gray-600">{total}</span> orders
            {activeFilters > 0 && <span className="ml-1 text-[#1B4332] font-semibold">(filtered)</span>}
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50 transition-colors"
            >← Prev</button>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page - 2 + i
                if (p < 1 || p > pages) return null
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-8 h-8 text-xs font-bold rounded-lg transition-colors ${p === page ? 'bg-[#1B4332] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {p}
                  </button>
                )
              })}
            </div>
            <button
              disabled={page >= pages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50 transition-colors"
            >Next →</button>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
