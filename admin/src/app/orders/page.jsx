'use client'
import React, { useEffect, useState, useCallback, useRef } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { ordersAPI } from '../../lib/api'
import {
  Search, RefreshCw, Download, X, AlertTriangle,
  CheckCircle, ChevronDown, ChevronUp, Phone, MapPin,
  Package, Clock, CreditCard, Smartphone, Banknote,
  Calendar, Printer, FileSpreadsheet, Bell, Store, Globe, Receipt, Trash2
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

// ── Print individual order bill ───────────────────────────────────────────────
function printOrderBill(o) {
  const addr    = parseAddr(o)
  const name    = addr.name  || o.customer_name  || 'Guest'
  const phone   = addr.phone || o.customer_phone || ''
  const items   = Array.isArray(o.items) ? o.items : []
  const walkIn  = isWalkIn(o)
  const refId   = o.reference_id || fmtOrderId(o.created_at)
  const dateStr = new Date(o.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })
  const subtotal = items.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0)
  const fee      = Number(o.delivery_fee || 0)
  const discount = subtotal + fee - Number(o.total || 0)

  const itemRows = items.map(i => `
    <div style="margin:6px 0">
      <div style="font-weight:600;font-size:13px">${i.emoji || ''} ${i.name}</div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:2px">
        <span>${i.quantity} × ${i.unit || 'unit'} @ ₹${Number(i.price || 0).toLocaleString('en-IN')}</span>
        <span style="font-weight:700">₹${(Number(i.price||0)*Number(i.quantity||1)).toLocaleString('en-IN')}</span>
      </div>
    </div>`).join('')

  const win = window.open('', '_blank', 'width=420,height=680')
  if (!win) return
  const logoUrl = `${window.location.origin}/images/raksha-farms-logo.png`
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Bill — ${refId}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Courier New',monospace;font-size:13px;padding:22px;width:340px;color:#111}
    .center{text-align:center} .right{text-align:right} .bold{font-weight:700}
    .logo{font-size:20px;font-weight:800;letter-spacing:1px}
    .divider{border:none;border-top:1px dashed #aaa;margin:10px 0}
    .row{display:flex;justify-content:space-between;margin:3px 0;font-size:12px}
    .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;margin-bottom:4px;
      background:${walkIn ? '#fef3c7' : '#dbeafe'};color:${walkIn ? '#92400e' : '#1e40af'}}
    .total-row{display:flex;justify-content:space-between;font-size:17px;font-weight:900;margin-top:8px;padding-top:8px;border-top:2px solid #111}
    .footer{margin-top:16px;text-align:center;font-size:11px;color:#666;line-height:1.7}
    .status{font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;
      background:${o.status==='delivered'?'#d1fae5':'#fef9c3'};color:${o.status==='delivered'?'#065f46':'#92400e'}}
    @media print{body{padding:12px}}
  </style></head><body>
  <div class="center" style="margin-bottom:6px">
    <img src="${logoUrl}" alt="Raksha Farms" style="width:150px;height:auto;display:block;margin:0 auto"
      onerror="this.style.display='none';document.getElementById('logo-fallback').style.display='block'"/>
    <p id="logo-fallback" class="logo" style="display:none">🌿 Raksha Farms</p>
  </div>
  <p class="center" style="font-size:11px;color:#555;margin-top:2px">Fresh · Pure · Organic</p>
  <p class="center" style="margin-top:4px"><span class="badge">${walkIn ? '🏪 Walk-in / Offline' : '🌐 Online Order'}</span></p>
  <hr class="divider"/>
  <div class="row"><span>Bill No</span><span class="bold">${refId}</span></div>
  <div class="row"><span>Date</span><span>${dateStr}</span></div>
  <div class="row"><span>Customer</span><span class="bold">${name}</span></div>
  ${phone ? `<div class="row"><span>Phone</span><span>${phone}</span></div>` : ''}
  ${addr.address ? `<div class="row" style="align-items:flex-start"><span>Address</span><span style="text-align:right;max-width:180px;font-size:11px;line-height:1.4">${addr.address}${addr.city?', '+addr.city:''}${addr.pincode?' — '+addr.pincode:''}</span></div>` : ''}
  <div class="row"><span>Payment</span><span class="bold">${(o.payment_method || 'COD').toUpperCase()}</span></div>
  <div class="row"><span>Status</span><span class="status">${STATUS_META[o.status]?.label || o.status}</span></div>
  <hr class="divider"/>
  <div class="bold" style="font-size:11px;margin-bottom:6px">ITEMS</div>
  ${itemRows}
  <hr class="divider"/>
  <div class="row"><span>Subtotal</span><span>₹${subtotal.toLocaleString('en-IN')}</span></div>
  ${fee > 0 ? `<div class="row"><span>Delivery Fee</span><span>₹${fee.toLocaleString('en-IN')}</span></div>` : ''}
  ${discount > 0.5 ? `<div class="row"><span>Discount</span><span>− ₹${discount.toLocaleString('en-IN')}</span></div>` : ''}
  <div class="total-row"><span>TOTAL</span><span>₹${Number(o.total||0).toLocaleString('en-IN')}</span></div>
  <div class="footer">Thank you for shopping with us! 🙏<br/>Visit us again · www.rakshafarms.com</div>
  </body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 400)
}

// ── Order-type helpers ────────────────────────────────────────────────────────
function isWalkIn(o) { return typeof o.reference_id === 'string' && o.reference_id.startsWith('WI-') }

const OrderTypeBadge = ({ order }) => {
  if (isWalkIn(order))
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-200 flex-shrink-0">
        <Store size={9}/> Walk-in
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 ring-1 ring-sky-200 flex-shrink-0">
      <Globe size={9}/> Online
    </span>
  )
}

// ── Reject Modal ──────────────────────────────────────────────────────────────
function RejectModal({ order, onClose, onConfirm }) {
  const items = Array.isArray(order.items) ? order.items : []
  const [checkedIds, setCheckedIds] = useState(new Set())
  const [remarks, setRemarks]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [selErr, setSelErr]         = useState('')

  const toggle = (idx) => setCheckedIds(prev => {
    const next = new Set(prev); next.has(idx) ? next.delete(idx) : next.add(idx); return next
  })
  const allSelected  = checkedIds.size === items.length && items.length > 0
  const noneSelected = checkedIds.size === 0
  const isPartial    = checkedIds.size > 0 && checkedIds.size < items.length
  const rejTotal     = items.filter((_,i) => checkedIds.has(i)).reduce((s,it) => s + it.price * it.quantity, 0)

  async function submit() {
    if (noneSelected) { setSelErr('Select at least one item to reject'); return }
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

        {selErr && (
          <p className="px-6 pb-2 text-xs font-semibold text-red-600">{selErr}</p>
        )}
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

// ── Delete Modal ──────────────────────────────────────────────────────────────
function DeleteModal({ order, onClose, onConfirm }) {
  const [remarks, setRemarks]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr]               = useState('')

  async function submit() {
    if (!remarks.trim()) { setErr('Please enter a reason for deleting this order'); return }
    setSubmitting(true)
    await onConfirm(remarks.trim())
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Delete Order</h2>
            <p className="text-xs text-gray-400 mt-0.5 font-mono font-bold">#{order.reference_id || (order.created_at ? fmtOrderId(order.created_at) : order.id?.slice(0,8))}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><X size={16}/></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5"/>
            <span>This removes the order from sales totals and the dashboard. It stays here, marked as deleted, for your records.</span>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Reason <span className="text-red-500">*</span></label>
            <textarea value={remarks} onChange={e => { setRemarks(e.target.value); setErr('') }}
              placeholder="e.g. Test entry, duplicate bill, entered by mistake…" rows={3} autoFocus
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"/>
          </div>
        </div>

        {err && <p className="px-6 pb-2 text-xs font-semibold text-red-600">{err}</p>}
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 text-sm transition-colors">Cancel</button>
          <button onClick={submit} disabled={submitting || !remarks.trim()}
            className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-colors">
            {submitting ? 'Deleting…' : 'Delete Order'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Order Row (expanded card) ──────────────────────────────────────────────────
function OrderRow({ o, expanded, onToggle, onChangeStatus, onReject, onDelete, selected, onSelect }) {
  const isOpen   = expanded === o.id
  const addr     = parseAddr(o)
  const notes    = parseNotes(o)
  const partial  = notes && o.status === 'accepted'
  // Once an order reaches any of these statuses the status dropdown is hidden — no further changes allowed
  const isFinal  = ['out_for_delivery','delivered','cancelled','rejected'].includes(o.status)
  const walkIn   = isWalkIn(o)
  const phone    = addr.phone || o.customer_phone || ''
  const name     = addr.name  || o.customer_name  || 'Guest'
  const isDeleted = !!o.deleted_at

  return (
    <div className={`rounded-2xl overflow-hidden transition-shadow hover:shadow-md border-l-4 ${
      isDeleted ? 'border-l-red-300 border border-red-100 bg-red-50/30'
      : walkIn ? 'border-l-amber-400 border border-amber-100 bg-amber-50/30' : 'border-l-sky-400 border border-gray-100 bg-white'
    } ${isOpen ? 'shadow-md' : 'shadow-sm'} ${isDeleted ? 'opacity-70' : ''}`}>
      {/* ── Summary row ── */}
      <div
        className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none ${walkIn ? 'bg-amber-50/40' : 'bg-white'}`}
        onClick={onToggle}
      >
        <input
          type="checkbox"
          checked={selected}
          onClick={e => e.stopPropagation()}
          onChange={e => onSelect(o.id, e.target.checked)}
          className="w-4 h-4 accent-[#1B4332] flex-shrink-0"
          aria-label={`Select order ${fmtOrderId(o.created_at)}`}
        />

        {/* Avatar */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
          walkIn ? 'bg-gradient-to-br from-amber-500 to-orange-400' : 'bg-gradient-to-br from-[#1B4332] to-emerald-500'
        }`}>
          {walkIn ? <Store size={15}/> : name[0]?.toUpperCase()}
        </div>

        {/* Name + time + type badge */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{name}</p>
            <OrderTypeBadge order={o}/>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            <span className="font-mono font-bold text-gray-600">#{o.reference_id || fmtOrderId(o.created_at)}</span>
            <span className="mx-1">·</span>{fmtTime(o.created_at)}
          </p>
        </div>

        {/* Items preview */}
        <div className="hidden sm:block flex-1 min-w-0 text-xs text-gray-500 truncate px-2">
          {(Array.isArray(o.items) ? o.items : []).slice(0,2).map(it => it.name).join(', ')}
          {Array.isArray(o.items) && o.items.length > 2 ? ` +${o.items.length - 2} more` : ''}
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
          <p className={`font-bold text-sm ${isDeleted ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{fmt(o.total)}</p>
        </div>

        {/* Status */}
        <div className="flex-shrink-0 ml-2">
          {isDeleted
            ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-600 ring-1 ring-red-200"><Trash2 size={11}/> Deleted</span>
            : <StatusPill status={o.status} isPartial={partial}/>}
        </div>

        {/* Actions (stop propagation) */}
        <div className="flex-shrink-0 flex items-center gap-1.5 ml-2" onClick={e => e.stopPropagation()}>
          {!isDeleted && (
            <select
              value={o.status}
              onChange={e => onChangeStatus(o.id, e.target.value)}
              disabled={isFinal}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B4332] bg-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>)}
            </select>
          )}
          {/* Print Bill */}
          <button
            onClick={() => printOrderBill(o)}
            title="Print Bill"
            className="p-1.5 text-[#1B4332] hover:bg-emerald-50 rounded-lg transition-colors"
          >
            <Printer size={14}/>
          </button>
          {!isDeleted && !isFinal && (
            <button
              onClick={() => onReject({ ...o, items: Array.isArray(o.items) ? o.items : [] })}
              title="Reject items"
              className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
            >
              <AlertTriangle size={14}/>
            </button>
          )}
          {!isDeleted && (
            <button
              onClick={() => onDelete(o)}
              title="Delete order"
              className="p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
            >
              <Trash2 size={14}/>
            </button>
          )}
        </div>

        {/* Expand icon */}
        <div className="flex-shrink-0 text-gray-300">
          {isOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
        </div>
      </div>

      {/* ── Deleted banner ── */}
      {isDeleted && (
        <div className="flex items-start gap-2 px-4 py-2 bg-red-50 border-t border-red-100 text-xs text-red-700">
          <Trash2 size={12} className="mt-0.5 flex-shrink-0"/>
          <span>
            <span className="font-bold">Deleted</span>
            {o.delete_remarks ? <span className="italic text-red-600"> — {o.delete_remarks}</span> : ''}
            <span className="text-red-400"> · excluded from totals</span>
          </span>
        </div>
      )}

      {/* ── Expanded detail ── */}
      {isOpen && (
        <div className={`border-t px-5 py-4 ${walkIn ? 'border-amber-100 bg-amber-50/40' : 'border-gray-100 bg-gray-50/60'}`}>
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

            {/* Right info panel — 2 cols */}
            <div className="md:col-span-2 space-y-3">
              {walkIn ? (
                /* ── Walk-in info ── */
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Store size={12} className="text-amber-600"/>
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Walk-in / Offline Sale</p>
                  </div>
                  <div className="bg-white border border-amber-200 rounded-xl p-3 space-y-2.5 text-sm">
                    <div className="flex items-start gap-2">
                      <Package size={13} className="text-gray-400 mt-0.5 flex-shrink-0"/>
                      <div>
                        <p className="font-semibold text-gray-800">{o.customer_name || addr.name || '—'}</p>
                        <p className="text-xs text-amber-600 font-medium mt-0.5">Walk-in Customer</p>
                      </div>
                    </div>
                    {phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={13} className="text-gray-400 flex-shrink-0"/>
                        <a href={`tel:+91${phone.replace(/\D/g,'').slice(-10)}`} className="text-gray-700 hover:text-[#1B4332] font-medium text-sm">{phone}</a>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <CreditCard size={13} className="text-gray-400 flex-shrink-0"/>
                      <span className="text-xs text-gray-600 capitalize font-medium">{o.payment_method || 'cash'} payment</span>
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t border-amber-100">
                      <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">No Delivery</span>
                      <span className="text-[10px] text-gray-400">Collected in-store</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Online order info ── */
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Globe size={12} className="text-sky-600"/>
                    <p className="text-xs font-bold text-sky-700 uppercase tracking-wider">Online Delivery Details</p>
                  </div>
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
              )}

              {/* Quick call button */}
              {phone && (
                <a href={`tel:+91${phone.replace(/\D/g,'').slice(-10)}`}
                  className={`flex items-center justify-center gap-2 w-full py-2.5 text-white text-xs font-bold rounded-xl transition-colors ${
                    walkIn ? 'bg-amber-500 hover:bg-amber-600' : 'bg-[#1B4332] hover:bg-[#15362a]'
                  }`}>
                  <Phone size={13}/> Call Customer
                </a>
              )}

              {/* Print Bill button */}
              <button
                onClick={() => printOrderBill(o)}
                className="flex items-center justify-center gap-2 w-full py-2.5 border-2 border-[#1B4332] text-[#1B4332] text-xs font-bold rounded-xl hover:bg-emerald-50 transition-colors"
              >
                <Printer size={13}/> Print Bill
              </button>
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
  const [source, setSource]         = useState('') // '' | 'online' | 'walkin'
  const [search, setSearch]         = useState('')
  const [fromDate, setFromDate]     = useState('')
  const [toDate, setToDate]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [expanded, setExpanded]     = useState(null)
  const [rejectOrder, setRejectOrder] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [downloading, setDownloading] = useState(false)
  const [toast, setToast]           = useState(null)
  const [tick, setTick]             = useState(0)
  const [newOrderBanner, setNewOrderBanner] = useState(false)
  const filtersRef = useRef({ page, status, search, fromDate, toDate })

  useEffect(() => { filtersRef.current = { page, status, source, search, fromDate, toDate } }, [page, status, source, search, fromDate, toDate])

  // ── Auto-poll: check for new orders every 30 s ─────────────────────────────
  const latestOrderTimeRef = useRef(null)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // Fetch just the most recent order (limit=1) to check if something new arrived
        const { data } = await ordersAPI.getAll({ page: 1, limit: 1 })
        const newest = data.orders?.[0]
        if (!newest) return
        if (latestOrderTimeRef.current === null) {
          // First poll — just record the baseline
          latestOrderTimeRef.current = newest.created_at
          return
        }
        if (newest.created_at !== latestOrderTimeRef.current) {
          latestOrderTimeRef.current = newest.created_at
          setNewOrderBanner(true)
        }
      } catch { /* ignore network errors */ }
    }, 30_000) // every 30 seconds
    return () => clearInterval(interval)
  }, []) // eslint-disable-line

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
      setSelectedIds(new Set())
      setTotal(data.total   || 0)
      setPages(data.pages   || 1)
    } catch(e) {
      showToast('Failed to load orders', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [page, status, fromDate, toDate, tick, load])

  function forceReload() {
    setNewOrderBanner(false)
    // Reset baseline so the next poll doesn't re-trigger for the same order
    latestOrderTimeRef.current = null
    setTick(t => t + 1)
  }
  function applySearch() { setPage(1); load({ page:1, search }) }
  function changeFilter(key, val) {
    setPage(1)
    if (key === 'status')   setStatus(val)
    if (key === 'source')   setSource(val)
    if (key === 'fromDate') setFromDate(val)
    if (key === 'toDate')   setToDate(val)
  }
  function clearFilters() {
    setStatus(''); setSource(''); setSearch(''); setFromDate(''); setToDate(''); setPage(1)
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

  function toggleOrderSelection(id, checked) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      checked ? next.add(id) : next.delete(id)
      return next
    })
  }

  async function bulkUpdateStatus(newStatus) {
    const ids = [...selectedIds]
    if (!ids.length) return
    try {
      await Promise.all(ids.map(id => ordersAPI.updateStatus(id, newStatus)))
      setOrders(prev => prev.map(o => selectedIds.has(o.id) ? { ...o, status: newStatus } : o))
      setSelectedIds(new Set())
      showToast(`Marked ${ids.length} order${ids.length !== 1 ? 's' : ''} as ${STATUS_META[newStatus]?.label || newStatus}`)
    } catch(e) {
      showToast(e.response?.data?.error || 'Bulk update failed', 'error')
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

  async function handleDeleteConfirm(remarks) {
    const id = deleteTarget?.id
    if (!id) return
    try {
      await ordersAPI.softDelete(id, remarks)
      setOrders(prev => prev.map(o => o.id === id ? { ...o, deleted_at: new Date().toISOString(), delete_remarks: remarks } : o))
      setDeleteTarget(null)
      showToast('Order deleted — removed from totals')
    } catch(e) {
      showToast(e.response?.data?.error || 'Delete failed', 'error')
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
    } catch { showToast('Download failed', 'error') }
    finally { setDownloading(false) }
  }

  async function downloadExcel() {
    setDownloading(true)
    try {
      const params = { page:1, limit:1000, status, search, from_date:fromDate, to_date:toDate }
      Object.keys(params).forEach(k => !params[k] && delete params[k])
      const { data } = await ordersAPI.getAll(params)
      const rows = data.orders || []
      const headers = ['Order ID','Customer','Phone','Address','Items','Payment','Status','Total','Date']
      const body = rows.map(o => {
        const a = parseAddr(o)
        const items = (Array.isArray(o.items)?o.items:[]).map(i=>`${i.name} x ${i.quantity}`).join(' | ')
        const d = new Date(o.created_at)
        return [
          fmtOrderId(o.created_at),
          a.name||o.customer_name||'Guest',
          a.phone||o.customer_phone||'',
          a.address||'',
          items,
          o.payment_method||'',
          STATUS_META[o.status]?.label||o.status,
          o.total,
          d.toLocaleDateString('en-IN'),
        ].map(v => `<td>${String(v).replace(/[<>&]/g, ch => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;' }[ch]))}</td>`).join('')
      }).map(cells => `<tr>${cells}</tr>`).join('')
      const html = `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`
      const blob = new Blob([html], { type:'application/vnd.ms-excel;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href=url; a.download=`orders-${new Date().toISOString().slice(0,10)}.xls`; a.click(); URL.revokeObjectURL(url)
    } catch { showToast('Excel export failed', 'error') }
    finally { setDownloading(false) }
  }

  function printPackingSlips() {
    const selectedOrders = orders.filter(o => selectedIds.has(o.id))
    if (!selectedOrders.length) return
    const html = selectedOrders.map(o => {
      const a = parseAddr(o)
      const items = (Array.isArray(o.items) ? o.items : []).map(item =>
        `<li><strong>${item.name}</strong> x ${item.quantity} ${item.unit || ''}</li>`
      ).join('')
      return `
        <section class="slip">
          <h2>Raksha Farms Packing Slip</h2>
          <p><strong>Order:</strong> #${fmtOrderId(o.created_at)}</p>
          <p><strong>Customer:</strong> ${a.name || o.customer_name || 'Guest'} ${a.phone || o.customer_phone ? `(${a.phone || o.customer_phone})` : ''}</p>
          <p><strong>Address:</strong> ${a.address || ''}${a.city ? `, ${a.city}` : ''}${a.pincode ? ` - ${a.pincode}` : ''}</p>
          <ul>${items}</ul>
        </section>
      `
    }).join('')
    const win = window.open('', '_blank')
    if (!win) return showToast('Allow popups to print packing slips', 'error')
    win.document.write(`<html><head><title>Packing Slips</title><style>body{font-family:Arial,sans-serif}.slip{page-break-after:always;border:1px solid #ddd;padding:24px;margin:16px}h2{margin-top:0}li{margin:8px 0}</style></head><body>${html}</body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  const activeFilters = [status, source, search, fromDate, toDate].filter(Boolean).length

  // Client-side source filter (online vs walk-in) — must be declared before grouped loop
  const visibleOrders = source === 'walkin'
    ? orders.filter(o => isWalkIn(o))
    : source === 'online'
    ? orders.filter(o => !isWalkIn(o))
    : orders

  const selectedOrders = visibleOrders.filter(o => selectedIds.has(o.id))
  const allVisibleSelected = visibleOrders.length > 0 && selectedOrders.length === visibleOrders.length

  // Group orders by IST date
  const grouped = []
  const seen = {}
  for (const o of visibleOrders) {
    const label = dateGroupLabel(o.created_at)
    if (!seen[label]) { seen[label] = true; grouped.push({ label, orders:[] }) }
    grouped[grouped.length-1].orders.push(o)
  }

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

      {/* ── New order notification banner ── */}
      {newOrderBanner && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-3 bg-[#1B4332] text-white rounded-2xl shadow-2xl animate-in slide-in-from-top-2">
          <Bell size={16} className="animate-bounce flex-shrink-0"/>
          <span className="text-sm font-semibold">New order received!</span>
          <button
            onClick={forceReload}
            className="ml-1 px-3 py-1.5 bg-white text-[#1B4332] text-xs font-bold rounded-xl hover:bg-green-50 transition-colors"
          >
            View now
          </button>
          <button onClick={() => setNewOrderBanner(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
            <X size={14}/>
          </button>
        </div>
      )}

      {rejectOrder && (
        <RejectModal
          order={rejectOrder}
          onClose={() => setRejectOrder(null)}
          onConfirm={(s,r,items) => handleRejectConfirm(rejectOrder.id, s, r, items)}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          order={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
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
          <button onClick={downloadExcel} disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-sm font-medium text-gray-600 disabled:opacity-50 transition-colors">
            <FileSpreadsheet size={14}/>Excel
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
            {search && <button onClick={() => { setSearch(''); load({ search:'', page: 1 }) }}><X size={12} className="text-gray-400 hover:text-gray-600"/></button>}
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

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => {
              const d = new Date()
              const iso = d.toISOString().slice(0,10)
              setFromDate(iso); setToDate(iso); setPage(1)
            }} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-500 hover:border-gray-300">
              Today
            </button>
            <button onClick={() => {
              const end = new Date()
              const start = new Date(); start.setDate(end.getDate() - 6)
              setFromDate(start.toISOString().slice(0,10)); setToDate(end.toISOString().slice(0,10)); setPage(1)
            }} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-500 hover:border-gray-300">
              Last 7 Days
            </button>
            <button onClick={() => {
              const end = new Date()
              const start = new Date(); start.setDate(end.getDate() - 29)
              setFromDate(start.toISOString().slice(0,10)); setToDate(end.toISOString().slice(0,10)); setPage(1)
            }} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-500 hover:border-gray-300">
              Last 30 Days
            </button>
          </div>

          {activeFilters > 0 && (
            <button onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-semibold hover:bg-red-100 transition-colors">
              <X size={12}/> Clear {activeFilters > 1 ? `(${activeFilters})` : ''}
            </button>
          )}
        </div>

        {/* Row 2: order source tabs */}
        <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mr-1">Source</span>
          <button
            onClick={() => changeFilter('source', '')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              !source ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}>
            All Orders
          </button>
          <button
            onClick={() => changeFilter('source', 'online')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              source === 'online' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}>
            <Globe size={11}/> Online
          </button>
          <button
            onClick={() => changeFilter('source', 'walkin')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              source === 'walkin' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}>
            <Store size={11}/> Walk-in / Offline
          </button>
        </div>

        {/* Row 3: status filter pills */}
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

      {visibleOrders.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 mb-5 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={e => setSelectedIds(e.target.checked ? new Set(visibleOrders.map(o => o.id)) : new Set())}
              className="w-4 h-4 accent-[#1B4332]"
            />
            {selectedOrders.length ? `${selectedOrders.length} selected` : 'Select visible orders'}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => bulkUpdateStatus('out_for_delivery')} disabled={!selectedOrders.length}
              className="px-3 py-2 bg-violet-600 text-white rounded-xl text-xs font-bold disabled:opacity-40">
              Mark {selectedOrders.length || ''} Out for Delivery
            </button>
            <button onClick={() => bulkUpdateStatus('delivered')} disabled={!selectedOrders.length}
              className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold disabled:opacity-40">
              Mark Delivered
            </button>
            <button onClick={printPackingSlips} disabled={!selectedOrders.length}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 disabled:opacity-40">
              <Printer size={13}/> Print Packing Slips
            </button>
          </div>
        </div>
      )}

      {/* ── Orders list ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-8 h-8 border-3 border-[#1B4332] border-t-transparent rounded-full animate-spin"/>
          <p className="text-sm text-gray-400">Loading orders…</p>
        </div>
      ) : visibleOrders.length === 0 ? (
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
                    onDelete={setDeleteTarget}
                    selected={selectedIds.has(o.id)}
                    onSelect={toggleOrderSelection}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && visibleOrders.length > 0 && (
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
