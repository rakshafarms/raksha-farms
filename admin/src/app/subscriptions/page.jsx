'use client'
import { useEffect, useState, useCallback } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { subscriptionsAPI } from '../../lib/api'
import {
  RefreshCw, CheckCircle, SkipForward, Pause, Play,
  Zap, Calendar, AlertTriangle, Package,
  ChevronRight, X, Edit2, Save, Phone, Mail,
  Clock, AlertCircle, Search, Repeat, MapPin,
  TrendingUp, Users, List, Info,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDateStr(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const today  = localDateStr()
  const target = String(dateStr).split('T')[0]
  return Math.round((new Date(target) - new Date(today)) / 86400000)
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function todayStr() { return localDateStr() }
function addDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n)
  return localDateStr(d)
}

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

function safeItems(raw) {
  try { return Array.isArray(raw) ? raw : JSON.parse(raw || '[]') } catch { return [] }
}

function parseCustomSchedule(notes) {
  try {
    const p = typeof notes === 'string' ? JSON.parse(notes) : notes
    return p?.custom_schedule || null
  } catch { return null }
}

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const AVATAR_COLORS = [
  'from-blue-500 to-blue-700', 'from-violet-500 to-violet-700',
  'from-emerald-500 to-emerald-700', 'from-rose-500 to-rose-700',
  'from-amber-500 to-amber-700', 'from-cyan-500 to-cyan-700',
]
const avatarColor = (name = '') => AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length]

const PAYMENT_LABELS = {
  cod_due:  { label: 'COD Due',  cls: 'bg-yellow-100 text-yellow-700' },
  paid:     { label: 'Paid',     cls: 'bg-green-100 text-green-700'   },
  pending:  { label: 'Pending',  cls: 'bg-gray-100 text-gray-500'     },
  failed:   { label: 'Failed',   cls: 'bg-red-100 text-red-600'       },
  refunded: { label: 'Refunded', cls: 'bg-purple-100 text-purple-700' },
}

// ── Small components ──────────────────────────────────────────────────────────

function PayBadge({ status }) {
  const p = PAYMENT_LABELS[status] || PAYMENT_LABELS.pending
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.cls}`}>{p.label}</span>
}

function FreqBadge({ freq }) {
  const isInterval = freq?.startsWith('interval_') || ['weekly','bi-weekly','monthly'].includes(freq)
  const cls = freq === 'daily'   ? 'bg-blue-50 text-blue-700 border border-blue-100' :
              freq === 'custom'  ? 'bg-purple-50 text-purple-700 border border-purple-100' :
              freq === 'once'    ? 'bg-gray-100 text-gray-500' :
              isInterval         ? 'bg-orange-50 text-orange-700 border border-orange-100' :
              'bg-gray-100 text-gray-500'
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{fmtFrequency(freq)}</span>
}

function DeliveryStatus({ dateStr }) {
  const days = daysUntil(dateStr)
  if (days === null) return <span className="text-xs text-gray-400">No date set</span>
  if (days < 0)  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
      <AlertCircle size={10}/> Overdue {Math.abs(days)}d
    </span>
  )
  if (days === 0) return <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Today</span>
  if (days === 1) return <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Tomorrow</span>
  if (days <= 3)  return <span className="text-xs font-semibold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">In {days} days</span>
  return <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">In {days} days</span>
}

function StatCard({ label, value, icon, iconBg, valueColor, sub, active, onClick }) {
  return (
    <button onClick={onClick} className={`bg-white rounded-2xl px-4 py-3.5 border shadow-sm flex items-center gap-3 w-full text-left transition ${
      active ? 'border-[#1B4332] ring-2 ring-[#1B4332]/20' : 'border-gray-100 hover:border-gray-200 hover:shadow'
    } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>{icon}</div>
      <div className="min-w-0">
        <p className={`text-xl font-extrabold leading-none ${valueColor || 'text-gray-900'}`}>{value ?? '—'}</p>
        <p className="text-xs text-gray-400 font-medium mt-0.5 truncate">{label}</p>
        {sub && <p className="text-[10px] text-gray-300 mt-0.5">{sub}</p>}
      </div>
    </button>
  )
}

function CustomScheduleGrid({ schedule }) {
  if (!schedule) return null
  const active = DAYS_SHORT.filter(d => schedule[d] > 0)
  if (!active.length) return null
  return (
    <div className="mt-2 flex gap-1 flex-wrap">
      {DAYS_SHORT.map(day => (
        <div key={day} className={`flex flex-col items-center rounded-lg px-2 py-1 text-[10px] font-semibold min-w-[34px] text-center ${
          schedule[day] > 0 ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-gray-50 text-gray-300 border border-gray-100'
        }`}>
          <span>{day}</span>
          {schedule[day] > 0 && <span className="font-bold">×{schedule[day]}</span>}
        </div>
      ))}
    </div>
  )
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────
function DetailDrawer({ subId, onClose, onRefresh }) {
  const [detail, setDetail]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState({})
  const [busy, setBusy]       = useState(false)

  useEffect(() => {
    if (!subId) return
    setLoading(true)
    subscriptionsAPI.getDetail(subId)
      .then(r => {
        setDetail(r.data)
        setForm({
          next_delivery:  r.data.next_delivery?.split('T')[0] || '',
          payment_status: r.data.payment_status || 'cod_due',
          notes:          r.data.sub_notes || '',
        })
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [subId])

  async function saveEdit() {
    setBusy(true)
    try {
      await subscriptionsAPI.update(subId, form)
      const r = await subscriptionsAPI.getDetail(subId)
      setDetail(r.data)
      setEditing(false)
      onRefresh()
    } catch { alert('Save failed') }
    finally { setBusy(false) }
  }

  async function action(fn, label) {
    if (!confirm(`${label}?`)) return
    setBusy(true)
    try {
      await fn()
      const r = await subscriptionsAPI.getDetail(subId)
      setDetail(r.data)
      onRefresh()
    } catch { alert(`Failed: ${label}`) }
    finally { setBusy(false) }
  }

  const items         = detail ? safeItems(detail.items) : []
  const customSch     = detail ? parseCustomSchedule(detail.notes || detail.sub_notes) : null
  const earned        = ((detail?.delivery_count || 0) * parseFloat(detail?.price_per_cycle || 0)).toFixed(0)
  const days          = daysUntil(detail?.next_delivery)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-[420px] bg-white h-full shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarColor(detail?.customer_name)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
              {detail?.customer_name?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">{detail?.customer_name || 'Subscription'}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <FreqBadge freq={detail?.frequency}/>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${detail?.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {detail?.is_active ? 'Active' : 'Paused'}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X size={18}/></button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
        ) : !detail ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Subscription not found</div>
        ) : (
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

            {/* ── Contact ── */}
            <section>
              <p className="section-label">Contact</p>
              <div className="bg-gray-50 rounded-xl p-3.5 space-y-2">
                {detail.customer_phone && (
                  <a href={`tel:${detail.customer_phone}`} className="flex items-center gap-2.5 text-sm text-gray-700 hover:text-blue-600 transition">
                    <Phone size={13} className="text-gray-400 flex-shrink-0"/> {detail.customer_phone}
                  </a>
                )}
                {detail.customer_email && (
                  <div className="flex items-center gap-2.5 text-sm text-gray-600">
                    <Mail size={13} className="text-gray-400 flex-shrink-0"/> {detail.customer_email}
                  </div>
                )}
                {(detail.sub_address || detail.customer_address) && (
                  <div className="flex items-start gap-2.5 text-sm text-gray-500">
                    <MapPin size={13} className="text-gray-400 flex-shrink-0 mt-0.5"/>
                    <span className="leading-snug">
                      {(() => {
                        const a = detail.sub_address || detail.customer_address
                        if (!a) return '—'
                        if (typeof a === 'string') return a
                        try { const p = JSON.parse(a); return p.address || p.full_address || JSON.stringify(p) } catch { return String(a) }
                      })()}
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* ── Delivery Schedule ── */}
            <section>
              <p className="section-label">Delivery Schedule</p>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-blue-900">{fmtFrequency(detail.frequency)}</p>
                  <FreqBadge freq={detail.frequency}/>
                </div>
                {detail.frequency === 'custom' && customSch && (
                  <>
                    <p className="text-xs text-blue-500 mb-1">Delivery days this week:</p>
                    <CustomScheduleGrid schedule={customSch}/>
                  </>
                )}
                {detail.frequency?.startsWith('interval_') && (
                  <p className="text-xs text-blue-500">Delivers every {detail.frequency.split('_')[1]} days</p>
                )}
                {detail.frequency === 'daily' && (
                  <p className="text-xs text-blue-500">Delivers every day</p>
                )}
              </div>
            </section>

            {/* ── Next Delivery ── */}
            <section>
              <div className="flex items-center justify-between mb-1.5">
                <p className="section-label mb-0">Next Delivery</p>
                {!editing && (
                  <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition">
                    <Edit2 size={11}/> Edit
                  </button>
                )}
              </div>

              {editing ? (
                <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/40 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Date</label>
                    <input type="date" value={form.next_delivery}
                      onChange={e => setForm(f => ({ ...f, next_delivery: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Payment Status</label>
                    <select value={form.payment_status}
                      onChange={e => setForm(f => ({ ...f, payment_status: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value="cod_due">COD Due — collect cash on delivery</option>
                      <option value="paid">Paid — payment received</option>
                      <option value="pending">Pending</option>
                      <option value="failed">Failed</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Admin Notes</label>
                    <textarea rows={2} value={form.notes}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Internal notes about this subscription…"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-white"/>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(false)}
                      className="flex-1 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition">Cancel</button>
                    <button onClick={saveEdit} disabled={busy}
                      className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1 transition">
                      <Save size={13}/> {busy ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border border-gray-100 rounded-xl p-3.5 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{fmtDate(detail.next_delivery)}</p>
                    {detail.sub_notes && !detail.sub_notes.startsWith('{') && (
                      <p className="text-xs text-gray-400 italic mt-0.5">{detail.sub_notes}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <DeliveryStatus dateStr={detail.next_delivery}/>
                    <PayBadge status={detail.payment_status}/>
                  </div>
                </div>
              )}
            </section>

            {/* ── Items in this subscription ── */}
            <section>
              <p className="section-label">Items per Delivery</p>
              <div className="space-y-1.5">
                {items.length === 0 && <p className="text-sm text-gray-400">No items</p>}
                {items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-gray-50 px-3 py-2.5 rounded-xl">
                    <span className="text-gray-700">{item.emoji} {item.name} <span className="text-gray-400">× {item.quantity} {item.unit}</span></span>
                    <span className="font-semibold text-gray-800">₹{(item.price || 0) * item.quantity}</span>
                  </div>
                ))}
                {items.length > 0 && (
                  <div className="flex justify-between px-3 pt-1 text-sm font-bold text-gray-900">
                    <span>Total per delivery</span>
                    <span>₹{parseFloat(detail.price_per_cycle || 0).toFixed(0)}</span>
                  </div>
                )}
              </div>
            </section>

            {/* ── Stats ── */}
            <section>
              <p className="section-label">Subscription Stats</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-emerald-50 rounded-xl py-3 border border-emerald-100">
                  <p className="text-xl font-bold text-emerald-700">{detail.delivery_count || 0}</p>
                  <p className="text-[10px] text-emerald-500 font-medium">Delivered</p>
                </div>
                <div className="bg-amber-50 rounded-xl py-3 border border-amber-100">
                  <p className="text-xl font-bold text-amber-700">{detail.skipped_count || 0}</p>
                  <p className="text-[10px] text-amber-500 font-medium">Skipped</p>
                </div>
                <div className="bg-blue-50 rounded-xl py-3 border border-blue-100">
                  <p className="text-xl font-bold text-blue-700">₹{earned}</p>
                  <p className="text-[10px] text-blue-500 font-medium">Total Earned</p>
                </div>
              </div>
            </section>

            {/* ── Actions ── */}
            <section>
              <p className="section-label">Actions</p>
              <div className="space-y-2">
                <button
                  disabled={busy || !detail.is_active}
                  onClick={() => action(() => subscriptionsAPI.markDelivered(subId), 'Mark today\'s delivery as completed')}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 transition">
                  <CheckCircle size={16}/> Mark as Delivered
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={busy || !detail.is_active}
                    onClick={() => action(() => subscriptionsAPI.skipDelivery(subId), 'Skip this delivery cycle')}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100 disabled:opacity-40 transition border border-amber-100">
                    <SkipForward size={15}/> Skip Delivery
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => action(
                      () => subscriptionsAPI.update(subId, { is_active: !detail.is_active }),
                      detail.is_active ? 'Pause this subscription' : 'Resume this subscription'
                    )}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition border disabled:opacity-40 ${
                      detail.is_active
                        ? 'bg-gray-50 text-gray-600 hover:bg-gray-100 border-gray-200'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100'
                    }`}>
                    {detail.is_active ? <><Pause size={15}/> Pause</> : <><Play size={15}/> Resume</>}
                  </button>
                </div>
              </div>
            </section>

            {/* ── Delivery History ── */}
            {detail.history?.length > 0 && (
              <section>
                <p className="section-label">Delivery History ({detail.history.length})</p>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                  {detail.history.map((h, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-gray-50 px-3 py-2 rounded-xl">
                      <span className="font-medium text-gray-700">{fmtDate(h.delivery_date)}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${
                          h.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                          h.status === 'skipped'   ? 'bg-amber-100 text-amber-600' :
                          h.status === 'failed'    ? 'bg-red-100 text-red-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>{h.status}</span>
                        <PayBadge status={h.payment_status}/>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

// ── Subscription row (reused in both tabs) ────────────────────────────────────
function SubRow({ s, onView, onQuickAction, busy }) {
  const items     = safeItems(s.items)
  const isBusy    = busy === s.id
  const customSch = parseCustomSchedule(s.notes)
  const days      = daysUntil(s.next_delivery)

  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/80 transition ${!s.is_active ? 'opacity-55' : ''}`}>
      {/* Avatar */}
      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarColor(s.customer_name)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
        {s.customer_name?.[0]?.toUpperCase() || '?'}
      </div>

      {/* Customer + frequency */}
      <div className="min-w-0 w-36 flex-shrink-0">
        <p className="font-semibold text-gray-900 text-sm truncate">{s.customer_name || '—'}</p>
        <p className="text-xs text-gray-400 truncate">{s.customer_phone || s.customer_email || '—'}</p>
        <div className="mt-0.5"><FreqBadge freq={s.frequency}/></div>
      </div>

      {/* Items */}
      <div className="flex-1 min-w-0 hidden md:block">
        <p className="text-xs text-gray-600 truncate">{items.map(i => `${i.emoji || ''} ${i.name} ×${i.quantity}`).join(' · ') || '—'}</p>
        <p className="text-xs font-semibold text-gray-700 mt-0.5">₹{parseFloat(s.price_per_cycle || 0).toFixed(0)} / cycle</p>
        {s.frequency === 'custom' && customSch && (
          <p className="text-[10px] text-purple-500 mt-0.5">
            {DAYS_SHORT.filter(d => customSch[d] > 0).map(d => `${d}×${customSch[d]}`).join('  ')}
          </p>
        )}
      </div>

      {/* Next delivery */}
      <div className="hidden lg:flex flex-col items-end gap-1 flex-shrink-0 w-28">
        <DeliveryStatus dateStr={s.next_delivery}/>
        <p className="text-[10px] text-gray-400">{fmtDate(s.next_delivery)}</p>
      </div>

      {/* Payment + deliveries done */}
      <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0">
        <PayBadge status={s.payment_status}/>
        <p className="text-[10px] text-gray-400">{s.delivery_count || 0} done</p>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button disabled={isBusy || !s.is_active}
          onClick={() => onQuickAction(s.id, () => subscriptionsAPI.markDelivered(s.id), 'Mark as Delivered')}
          className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 disabled:opacity-30 transition" title="Mark Delivered">
          <CheckCircle size={15}/>
        </button>
        <button disabled={isBusy || !s.is_active}
          onClick={() => onQuickAction(s.id, () => subscriptionsAPI.skipDelivery(s.id), 'Skip this delivery')}
          className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500 disabled:opacity-30 transition" title="Skip Delivery">
          <SkipForward size={15}/>
        </button>
        <button disabled={isBusy}
          onClick={() => onQuickAction(s.id,
            () => subscriptionsAPI.update(s.id, { is_active: !s.is_active }),
            s.is_active ? 'Pause subscription' : 'Resume subscription'
          )}
          className={`p-1.5 rounded-lg transition disabled:opacity-30 ${s.is_active ? 'hover:bg-red-50 text-gray-400 hover:text-red-500' : 'hover:bg-emerald-50 text-gray-400 hover:text-emerald-600'}`}
          title={s.is_active ? 'Pause' : 'Resume'}>
          {s.is_active ? <Pause size={15}/> : <Play size={15}/>}
        </button>
        <button onClick={() => onView(s.id)}
          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition" title="View Details">
          <ChevronRight size={15}/>
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SubscriptionsPage() {
  const [tab, setTab]               = useState('today')
  const [dashboard, setDashboard]   = useState(null)
  const [calendar, setCalendar]     = useState({})
  const [calFrom, setCalFrom]       = useState(todayStr())
  const [calTo, setCalTo]           = useState(addDays(6))
  const [subs, setSubs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genDate, setGenDate]       = useState(todayStr())
  const [showGenPanel, setShowGenPanel] = useState(false)
  const [drawerSub, setDrawerSub]   = useState(null)
  const [busy, setBusy]             = useState(null)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const fetchDashboard = useCallback(async () => {
    try { const r = await subscriptionsAPI.getDashboard(); setDashboard(r.data) } catch (e) { console.error(e) }
  }, [])

  const fetchCalendar = useCallback(async () => {
    try {
      const r = await subscriptionsAPI.getCalendar(calFrom, calTo)
      setCalendar(r.data.calendar || {})
    } catch (e) { console.error(e) }
  }, [calFrom, calTo])

  const fetchList = useCallback(async () => {
    try { const r = await subscriptionsAPI.getAll(); setSubs(Array.isArray(r.data) ? r.data : []) }
    catch (e) { console.error(e) }
  }, [])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchDashboard(), fetchCalendar(), fetchList()])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { if (tab === 'calendar') fetchCalendar() }, [calFrom, calTo, tab])

  async function handleGenerate() {
    if (!confirm(`Generate orders for all subscriptions due on ${genDate}?`)) return
    setGenerating(true)
    try {
      const r = await subscriptionsAPI.generateOrders(genDate)
      alert(`✅ Generated ${r.data.generated} order(s) for ${genDate}`)
      fetchAll()
    } catch (e) { alert(e.response?.data?.error || 'Failed to generate orders') }
    finally { setGenerating(false) }
  }

  async function quickAction(id, fn, label) {
    if (!confirm(`${label}?`)) return
    setBusy(id)
    try { await fn(); await fetchAll() }
    catch { alert(`Failed: ${label}`) }
    finally { setBusy(null) }
  }

  const st        = dashboard?.stats        || {}
  const warnings  = dashboard?.stockWarnings || []
  const todayList = dashboard?.todayList    || []

  // Overdue = active subs with next_delivery < today
  const overdueList = subs.filter(s => s.is_active && daysUntil(s.next_delivery) < 0)

  const filteredSubs = subs.filter(s => {
    const q = search.trim().toLowerCase()
    const matchSearch = !q ||
      (s.customer_name  || '').toLowerCase().includes(q) ||
      (s.customer_phone || '').includes(q) ||
      (s.customer_email || '').toLowerCase().includes(q)
    const matchStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && s.is_active) ||
      (statusFilter === 'paused' && !s.is_active)
    return matchSearch && matchStatus
  })

  const TABS = [
    { key: 'today',    label: "Today's Queue", icon: CheckCircle, count: todayList.length + overdueList.length },
    { key: 'all',      label: 'All Subscriptions', icon: List, count: subs.length },
    { key: 'calendar', label: 'Upcoming',  icon: Calendar,  count: null },
  ]

  return (
    <AdminLayout title="Subscriptions">

      {/* ── Top bar: stats + refresh ─────────────────────── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <p className="text-sm text-gray-400">Manage customer subscriptions and deliveries</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowGenPanel(p => !p)}
            className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 hover:border-gray-300 px-3 py-2 rounded-xl transition">
            <Zap size={14}/> Generate Orders
          </button>
          <button onClick={fetchAll} disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 px-3 py-2 rounded-xl hover:bg-gray-100 transition border border-gray-200">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Refresh
          </button>
        </div>
      </div>

      {/* ── Generate Orders panel (collapsible) ─────────── */}
      {showGenPanel && (
        <div className="mb-5 bg-[#1B4332]/5 border border-[#1B4332]/20 rounded-2xl p-4">
          <div className="flex items-start gap-3 mb-3">
            <Info size={16} className="text-[#1B4332] flex-shrink-0 mt-0.5"/>
            <div>
              <p className="text-sm font-semibold text-[#1B4332]">Generate Subscription Orders</p>
              <p className="text-xs text-[#1B4332]/60 mt-0.5">
                Creates regular orders in the Orders section for all active subscriptions due on a specific date.
                Run this each morning or use it to catch up on missed dates.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input type="date" value={genDate} onChange={e => setGenDate(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332] bg-white"/>
            <button onClick={handleGenerate} disabled={generating}
              className="flex items-center gap-2 bg-[#1B4332] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#163826] disabled:opacity-50 transition">
              <Zap size={14}/> {generating ? 'Generating…' : 'Run Now'}
            </button>
          </div>
        </div>
      )}

      {/* ── Stock Warnings ──────────────────────────────── */}
      {warnings.length > 0 && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-red-600"/>
            <p className="text-sm font-bold text-red-700">Low Stock — Upcoming Deliveries at Risk</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 border border-red-100">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{w.name}</p>
                  <p className="text-xs text-gray-400">Need {w.needed} · Have {w.available}</p>
                </div>
                <span className="text-sm font-bold text-red-600 bg-red-100 px-2.5 py-1 rounded-lg">Short {w.short}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Stat cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Active Subs" value={st.active}
          iconBg="bg-emerald-100" valueColor="text-emerald-700"
          icon={<TrendingUp size={18} className="text-emerald-600"/>}
          active={tab === 'all' && statusFilter === 'active'}
          onClick={() => { setTab('all'); setStatusFilter('active') }}/>
        <StatCard label="Due Today" value={st.due_today}
          iconBg="bg-blue-100" valueColor="text-blue-700"
          sub="Needs delivery today"
          icon={<CheckCircle size={18} className="text-blue-600"/>}
          active={tab === 'today'}
          onClick={() => setTab('today')}/>
        <StatCard label="Overdue" value={st.overdue}
          iconBg="bg-red-100" valueColor="text-red-600"
          sub={st.overdue > 0 ? 'Action required' : 'All caught up'}
          icon={<AlertCircle size={18} className="text-red-500"/>}
          active={tab === 'today'}
          onClick={() => setTab('today')}/>
        <StatCard label="Paused" value={st.paused}
          iconBg="bg-gray-100" valueColor="text-gray-500"
          icon={<Pause size={18} className="text-gray-400"/>}
          active={tab === 'all' && statusFilter === 'paused'}
          onClick={() => { setTab('all'); setStatusFilter('paused') }}/>
      </div>

      {/* ── Tabs ────────────────────────────────────────── */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon size={13}/>
            {t.label}
            {t.count !== null && t.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab === t.key ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-400'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <div className="py-16 text-center text-gray-400 text-sm">Loading subscriptions…</div>}

      {/* ══ TODAY'S QUEUE ═══════════════════════════════ */}
      {!loading && tab === 'today' && (
        <div className="space-y-4">

          {/* Overdue — needs immediate action */}
          {overdueList.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 bg-red-50 border-b border-red-100">
                <AlertCircle size={15} className="text-red-600"/>
                <p className="font-bold text-red-700 text-sm">Overdue — Missed Deliveries ({overdueList.length})</p>
                <p className="text-xs text-red-400 ml-auto">Mark delivered or skip to catch up</p>
              </div>
              <div className="divide-y divide-gray-50">
                {overdueList.map(s => (
                  <SubRow key={s.id} s={s} onView={setDrawerSub} onQuickAction={quickAction} busy={busy}/>
                ))}
              </div>
            </div>
          )}

          {/* Due today */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <CheckCircle size={15} className="text-emerald-600"/>
                <p className="font-bold text-gray-800 text-sm">Due Today</p>
                <span className="text-xs text-gray-400">{todayList.length} delivery{todayList.length !== 1 ? 's' : ''}</span>
              </div>
              <p className="text-xs text-gray-400 hidden sm:block">{new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' })}</p>
            </div>

            {todayList.length === 0 ? (
              <div className="py-14 text-center text-gray-400">
                <CheckCircle size={32} className="mx-auto mb-2 opacity-20"/>
                <p className="text-sm font-medium">No deliveries due today</p>
                <p className="text-xs mt-1 text-gray-300">Check the Upcoming tab for future deliveries</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {todayList.map(s => (
                  <SubRow key={s.id} s={s} onView={setDrawerSub} onQuickAction={quickAction} busy={busy}/>
                ))}
              </div>
            )}
          </div>

          {/* Quick legend */}
          <div className="flex items-center gap-4 text-xs text-gray-400 px-1 flex-wrap">
            <span className="flex items-center gap-1"><CheckCircle size={11} className="text-emerald-500"/> Mark Delivered</span>
            <span className="flex items-center gap-1"><SkipForward size={11} className="text-amber-500"/> Skip Delivery</span>
            <span className="flex items-center gap-1"><Pause size={11} className="text-gray-400"/> Pause Subscription</span>
            <span className="flex items-center gap-1"><ChevronRight size={11} className="text-blue-400"/> View Full Details</span>
          </div>
        </div>
      )}

      {/* ══ ALL SUBSCRIPTIONS ═══════════════════════════ */}
      {!loading && tab === 'all' && (
        <div className="space-y-4">
          {/* Search + filter */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, phone, or email…"
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B4332] bg-white"/>
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14}/>
                </button>
              )}
            </div>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {[['all','All'],['active','Active'],['paused','Paused']].map(([key,lbl]) => (
                <button key={key} onClick={() => setStatusFilter(key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    statusFilter === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>{lbl}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-400">{filteredSubs.length} shown</span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {filteredSubs.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <Package size={30} className="mx-auto mb-2 opacity-30"/>
                <p className="text-sm">{search ? 'No results for your search' : 'No subscriptions yet'}</p>
              </div>
            ) : (
              <>
                {/* Column headers */}
                <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-50 bg-gray-50/60">
                  <div className="w-9 flex-shrink-0"/>
                  <div className="w-36 flex-shrink-0 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Customer</div>
                  <div className="flex-1 min-w-0 hidden md:block text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Items · Amount</div>
                  <div className="hidden lg:block w-28 flex-shrink-0 text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-right">Next Delivery</div>
                  <div className="hidden sm:block flex-shrink-0 text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-right">Payment</div>
                  <div className="flex-shrink-0 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Actions</div>
                </div>
                <div className="divide-y divide-gray-50">
                  {filteredSubs.map(s => (
                    <SubRow key={s.id} s={s} onView={setDrawerSub} onQuickAction={quickAction} busy={busy}/>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ UPCOMING CALENDAR ═══════════════════════════ */}
      {!loading && tab === 'calendar' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap bg-white rounded-xl border border-gray-100 px-4 py-3">
            <Calendar size={14} className="text-gray-400"/>
            <span className="text-sm text-gray-600 font-medium">Show deliveries from</span>
            <input type="date" value={calFrom} onChange={e => setCalFrom(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
            <span className="text-sm text-gray-400">to</span>
            <input type="date" value={calTo} onChange={e => setCalTo(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
            <button onClick={fetchCalendar}
              className="flex items-center gap-1.5 bg-[#1B4332] text-white px-3 py-1.5 rounded-xl text-sm font-medium hover:bg-[#163826] transition">
              <RefreshCw size={13}/> Update
            </button>
          </div>

          {Object.keys(calendar).length === 0 ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-gray-100 text-gray-400">
              <Calendar size={30} className="mx-auto mb-2 opacity-30"/>
              <p className="text-sm">No deliveries in this date range</p>
            </div>
          ) : (
            Object.entries(calendar).sort(([a],[b]) => a.localeCompare(b)).map(([date, items]) => {
              const days   = daysUntil(date)
              const isToday = date === todayStr()
              const label  = isToday ? 'Today' : days === 1 ? 'Tomorrow' : fmtDate(date)
              const totalAmt = items.reduce((s, i) => s + parseFloat(i.price_per_cycle || 0), 0)
              return (
                <div key={date} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className={`flex items-center justify-between px-5 py-3 border-b ${isToday ? 'bg-emerald-50 border-emerald-100' : 'border-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <p className={`font-bold text-sm ${isToday ? 'text-emerald-700' : 'text-gray-800'}`}>{label}</p>
                      <span className="text-xs text-gray-400">{date}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">₹{totalAmt.toFixed(0)} expected</span>
                      <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {items.length} delivery{items.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {items.map(s => (
                      <SubRow key={s.id} s={s} onView={setDrawerSub} onQuickAction={quickAction} busy={busy}/>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Detail Drawer ─────────────────────────────── */}
      {drawerSub && (
        <DetailDrawer subId={drawerSub} onClose={() => setDrawerSub(null)} onRefresh={fetchAll}/>
      )}

      {/* Shared CSS class */}
      <style jsx global>{`
        .section-label {
          display: block;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #9ca3af;
          margin-bottom: 6px;
        }
      `}</style>

    </AdminLayout>
  )
}
