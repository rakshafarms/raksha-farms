'use client'
import { useEffect, useState, useCallback } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { subscriptionsAPI } from '../../lib/api'
import {
  RefreshCw, CheckCircle, SkipForward, Pause, Play,
  Zap, Calendar, List, AlertTriangle, Package,
  ChevronRight, X, Edit2, Save, Phone, Mail,
  TrendingUp, Clock, AlertCircle, BarChart2,
  Search, Repeat, MapPin, Users,
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
  const today = localDateStr()
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
  if (freq === 'daily')      return 'Daily'
  if (freq === 'custom')     return 'Custom'
  if (freq === 'once')       return 'One-time'
  if (freq === 'weekly')     return 'Every 7 days'
  if (freq === 'bi-weekly')  return 'Every 14 days'
  if (freq === 'monthly')    return 'Every 30 days'
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
  paid:     { label: 'Paid',     cls: 'bg-green-100 text-green-700' },
  pending:  { label: 'Pending',  cls: 'bg-gray-100 text-gray-500' },
  failed:   { label: 'Failed',   cls: 'bg-red-100 text-red-600' },
  refunded: { label: 'Refunded', cls: 'bg-purple-100 text-purple-700' },
}

// ── Badges ─────────────────────────────────────────────────────────────────────

function PayBadge({ status }) {
  const p = PAYMENT_LABELS[status] || PAYMENT_LABELS.pending
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.cls}`}>{p.label}</span>
}

const INTERVAL_FREQS = ['weekly', 'bi-weekly', 'monthly']
function isIntervalFreq(freq) {
  return freq?.startsWith('interval_') || INTERVAL_FREQS.includes(freq)
}

function FreqBadge({ freq }) {
  const text = fmtFrequency(freq)
  const cls = freq === 'daily'   ? 'bg-blue-50 text-blue-700 border border-blue-100' :
              freq === 'custom'  ? 'bg-purple-50 text-purple-700 border border-purple-100' :
              freq === 'once'    ? 'bg-gray-100 text-gray-500' :
              isIntervalFreq(freq) ? 'bg-orange-50 text-orange-700 border border-orange-100' :
              'bg-gray-100 text-gray-500'
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{text}</span>
}

function DeliveryBadge({ dateStr }) {
  const days = daysUntil(dateStr)
  if (days === null) return <span className="text-gray-400 text-xs">—</span>
  if (days < 0)   return <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Overdue {Math.abs(days)}d</span>
  if (days === 0) return <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Today</span>
  if (days === 1) return <span className="text-xs font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">Tomorrow</span>
  if (days <= 3)  return <span className="text-xs font-bold text-orange-400 bg-orange-50 px-2 py-0.5 rounded-full">In {days}d</span>
  return <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">In {days}d</span>
}

// ── Stat card (matches customers page) ────────────────────────────────────────
function StatCard({ label, value, icon, iconBg, valueColor, onClick }) {
  return (
    <button onClick={onClick}
      className={`bg-white rounded-2xl px-5 py-4 border border-gray-100 shadow-sm flex items-center gap-4 w-full text-left ${onClick ? 'hover:shadow-md cursor-pointer' : 'cursor-default'} transition`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className={`text-2xl font-extrabold leading-none ${valueColor || 'text-gray-900'}`}>{value ?? '—'}</p>
        <p className="text-xs text-gray-400 font-medium mt-0.5">{label}</p>
      </div>
    </button>
  )
}

// ── Custom schedule grid ───────────────────────────────────────────────────────
function CustomScheduleGrid({ schedule }) {
  if (!schedule) return null
  const active = DAYS_SHORT.filter(d => schedule[d] > 0)
  if (!active.length) return null
  return (
    <div className="mt-2">
      <div className="flex gap-1 flex-wrap">
        {DAYS_SHORT.map(day => (
          <div key={day} className={`flex flex-col items-center rounded-lg px-2 py-1 text-xs font-semibold min-w-[36px] text-center ${
            schedule[day] > 0
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'bg-gray-50 text-gray-300 border border-gray-100'
          }`}>
            <span>{day}</span>
            {schedule[day] > 0 && <span className="font-bold">×{schedule[day]}</span>}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-1">{active.join(', ')} · {active.length} day{active.length > 1 ? 's' : ''}/week</p>
    </div>
  )
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────
function DetailDrawer({ subId, onClose, onRefresh }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)

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

  const items = detail ? safeItems(detail.items) : []
  const customSchedule = detail ? parseCustomSchedule(detail.notes || detail.sub_notes) : null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarColor(detail?.customer_name)} flex items-center justify-center text-white font-bold text-sm`}>
              {detail?.customer_name?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">{detail?.customer_name || 'Subscription'}</h2>
              <FreqBadge freq={detail?.frequency}/>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18}/></button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">Loading…</div>
        ) : !detail ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">Not found</div>
        ) : (
          <div className="flex-1 px-6 py-5 space-y-5">

            {/* Customer info */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Customer</p>
              {detail.customer_phone && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Phone size={13} className="text-gray-400"/> {detail.customer_phone}
                </div>
              )}
              {detail.customer_email && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Mail size={13} className="text-gray-400"/> {detail.customer_email}
                </div>
              )}
              {detail.customer_address && (
                <div className="flex items-start gap-2 text-sm text-gray-500">
                  <MapPin size={13} className="text-gray-400 mt-0.5 flex-shrink-0"/>
                  <span>{typeof detail.customer_address === 'string' ? detail.customer_address : JSON.stringify(detail.customer_address)}</span>
                </div>
              )}
            </div>

            {/* Frequency + price */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                <p className="text-xs text-blue-400 font-medium mb-1">Frequency</p>
                <p className="font-bold text-blue-900 text-sm">{fmtFrequency(detail.frequency)}</p>
                {detail.frequency === 'custom' && customSchedule && (
                  <CustomScheduleGrid schedule={customSchedule}/>
                )}
                {detail.frequency?.startsWith('interval_') && (
                  <p className="text-xs text-blue-500 mt-1">Repeating delivery</p>
                )}
              </div>
              <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                <p className="text-xs text-green-400 font-medium mb-1">Per Cycle</p>
                <p className="font-bold text-green-900 text-sm">₹{parseFloat(detail.price_per_cycle || 0).toFixed(0)}</p>
                <PayBadge status={detail.payment_status}/>
              </div>
            </div>

            {/* Items */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Items</p>
              <div className="space-y-1.5">
                {items.length === 0 && <p className="text-sm text-gray-400">No items</p>}
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg">
                    <span>{item.emoji} {item.name} × {item.quantity} {item.unit}</span>
                    <span className="font-semibold">₹{(item.price || 0) * item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Next delivery / edit */}
            {editing ? (
              <div className="border border-blue-200 rounded-2xl p-4 space-y-3 bg-blue-50/30">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Edit Subscription</p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Next Delivery Date</label>
                  <input type="date" value={form.next_delivery}
                    onChange={e => setForm(f => ({ ...f, next_delivery: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Payment Status</label>
                  <select value={form.payment_status}
                    onChange={e => setForm(f => ({ ...f, payment_status: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="cod_due">COD Due</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <textarea rows={2} value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"/>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)}
                    className="flex-1 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
                  <button onClick={saveEdit} disabled={busy}
                    className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1">
                    <Save size={13}/> {busy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="border border-gray-100 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Next Delivery</p>
                  <button onClick={() => setEditing(true)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition">
                    <Edit2 size={12}/> Edit
                  </button>
                </div>
                <p className="font-bold text-gray-900">{fmtDate(detail.next_delivery)}</p>
                <DeliveryBadge dateStr={detail.next_delivery}/>
                {detail.sub_notes && !detail.sub_notes.startsWith('{') && (
                  <p className="text-xs text-gray-500 italic mt-1">{detail.sub_notes}</p>
                )}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Delivered', value: detail.delivery_count || 0, color: 'text-green-600' },
                { label: 'Skipped',   value: detail.skipped_count  || 0, color: 'text-orange-500' },
                { label: 'Earned',    value: `₹${((detail.delivery_count || 0) * parseFloat(detail.price_per_cycle || 0)).toFixed(0)}`, color: 'text-gray-800' },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-xl py-3">
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button disabled={busy || !detail.is_active}
                onClick={() => action(() => subscriptionsAPI.markDelivered(subId), 'Mark as delivered')}
                className="flex flex-col items-center gap-1 py-3 rounded-xl bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100 disabled:opacity-40 transition">
                <CheckCircle size={18}/> Delivered
              </button>
              <button disabled={busy || !detail.is_active}
                onClick={() => action(() => subscriptionsAPI.skipDelivery(subId), 'Skip this delivery')}
                className="flex flex-col items-center gap-1 py-3 rounded-xl bg-orange-50 text-orange-600 text-xs font-semibold hover:bg-orange-100 disabled:opacity-40 transition">
                <SkipForward size={18}/> Skip
              </button>
              <button disabled={busy}
                onClick={() => action(
                  () => subscriptionsAPI.update(subId, { is_active: !detail.is_active }),
                  detail.is_active ? 'Pause subscription' : 'Resume subscription'
                )}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-semibold transition disabled:opacity-40 ${
                  detail.is_active ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'
                }`}>
                {detail.is_active ? <Pause size={18}/> : <Play size={18}/>}
                {detail.is_active ? 'Pause' : 'Resume'}
              </button>
            </div>

            {/* Delivery history */}
            {detail.history?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Delivery History</p>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {detail.history.map((h, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-gray-50 px-3 py-2 rounded-lg">
                      <div>
                        <span className="font-medium text-gray-700">{fmtDate(h.delivery_date)}</span>
                        {h.reference_id && <span className="text-gray-400 ml-2">#{h.reference_id}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${
                          h.status === 'delivered' ? 'bg-green-100 text-green-700' :
                          h.status === 'skipped'   ? 'bg-orange-100 text-orange-600' :
                          h.status === 'failed'    ? 'bg-red-100 text-red-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>{h.status}</span>
                        <PayBadge status={h.payment_status}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SubscriptionsPage() {
  const [tab, setTab]               = useState('dashboard')
  const [dashboard, setDashboard]   = useState(null)
  const [calendar, setCalendar]     = useState({})
  const [calFrom, setCalFrom]       = useState(todayStr())
  const [calTo, setCalTo]           = useState(addDays(13))
  const [subs, setSubs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genDate, setGenDate]       = useState(todayStr())
  const [drawerSub, setDrawerSub]   = useState(null)
  const [busy, setBusy]             = useState(null)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all | active | paused

  const fetchDashboard = useCallback(async () => {
    try { const r = await subscriptionsAPI.getDashboard(); setDashboard(r.data) } catch(e) { console.error(e) }
  }, [])

  const fetchCalendar = useCallback(async () => {
    try {
      const r = await subscriptionsAPI.getCalendar(calFrom, calTo)
      setCalendar(r.data.calendar || {})
    } catch(e) { console.error(e) }
  }, [calFrom, calTo])

  const fetchList = useCallback(async () => {
    try { const r = await subscriptionsAPI.getAll(); setSubs(Array.isArray(r.data) ? r.data : []) }
    catch(e) { console.error(e) }
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
    } catch(e) { alert(e.response?.data?.error || 'Failed to generate orders') }
    finally { setGenerating(false) }
  }

  async function quickAction(id, fn, label) {
    if (!confirm(`${label}?`)) return
    setBusy(id)
    try { await fn(); await fetchAll() }
    catch { alert(`Failed: ${label}`) }
    finally { setBusy(null) }
  }

  const st       = dashboard?.stats    || {}
  const warnings = dashboard?.stockWarnings || []
  const todayList = dashboard?.todayList    || []

  // Filtered subs for list tab
  const filteredSubs = subs.filter(s => {
    const matchSearch = !search.trim() ||
      (s.customer_name  || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.customer_phone || '').includes(search) ||
      (s.customer_email || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && s.is_active) ||
      (statusFilter === 'paused' && !s.is_active)
    return matchSearch && matchStatus
  })

  return (
    <AdminLayout title="Subscriptions">

      {/* ── Generate Orders Bar ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-6 bg-[#1B4332]/5 border border-[#1B4332]/20 rounded-2xl px-5 py-3">
        <Zap size={18} className="text-[#1B4332]"/>
        <span className="text-sm font-semibold text-[#1B4332]">Generate Subscription Orders</span>
        <input type="date" value={genDate} onChange={e => setGenDate(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332] bg-white"/>
        <button onClick={handleGenerate} disabled={generating}
          className="flex items-center gap-2 bg-[#1B4332] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#163826] disabled:opacity-50 transition">
          <Zap size={14}/> {generating ? 'Generating…' : 'Generate Orders'}
        </button>
        <span className="text-xs text-gray-400 ml-auto hidden sm:block">Creates orders for all active subscriptions due on selected date</span>
      </div>

      {/* ── Stock Warnings ──────────────────────────────────── */}
      {warnings.length > 0 && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-red-600"/>
            <p className="text-sm font-bold text-red-700">Stock Warning — Today + Tomorrow's Subscriptions</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 border border-red-100">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{w.name}</p>
                  <p className="text-xs text-gray-400">Needed: {w.needed} · Available: {w.available}</p>
                </div>
                <span className="text-sm font-bold text-red-600 bg-red-100 px-2.5 py-1 rounded-lg">Short {w.short}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Stat Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        <StatCard label="Due Today"      value={st.due_today}      iconBg="bg-green-100"  icon={<CheckCircle size={20} className="text-green-600"/>}   valueColor="text-green-700"  onClick={() => setTab('dashboard')}/>
        <StatCard label="Due Tomorrow"   value={st.due_tomorrow}   iconBg="bg-blue-100"   icon={<Clock size={20} className="text-blue-600"/>}           valueColor="text-blue-700"   onClick={() => setTab('calendar')}/>
        <StatCard label="Overdue"        value={st.overdue}        iconBg="bg-red-100"    icon={<AlertCircle size={20} className="text-red-600"/>}      valueColor="text-red-600"/>
        <StatCard label="Active"         value={st.active}         iconBg="bg-emerald-100" icon={<TrendingUp size={20} className="text-emerald-700"/>}  valueColor="text-emerald-700"/>
        <StatCard label="Paused"         value={st.paused}         iconBg="bg-gray-100"   icon={<Pause size={20} className="text-gray-500"/>}           valueColor="text-gray-500"/>
        <StatCard label="Failed Payment" value={st.failed_payment} iconBg="bg-orange-100" icon={<AlertTriangle size={20} className="text-orange-500"/>} valueColor="text-orange-600"/>
        <StatCard label="Total"          value={st.total}          iconBg="bg-violet-100" icon={<Users size={20} className="text-violet-600"/>}         valueColor="text-violet-700"/>
      </div>

      {/* ── Tabs ──────────────────────────────────────────── */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { key: 'dashboard', label: 'Dashboard', icon: BarChart2 },
          { key: 'calendar',  label: 'Calendar',  icon: Calendar  },
          { key: 'list',      label: 'All Subs',  icon: List      },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon size={14}/> {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="py-16 text-center text-gray-400">Loading…</div>}

      {/* ══ DASHBOARD TAB ══════════════════════════════════ */}
      {!loading && tab === 'dashboard' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
            <h3 className="font-bold text-gray-800">Due Today <span className="text-gray-400 font-normal text-sm">({todayList.length})</span></h3>
            <button onClick={fetchAll} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition"><RefreshCw size={15}/></button>
          </div>
          {todayList.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <CheckCircle size={32} className="mx-auto mb-2 opacity-20"/>
              <p className="text-sm">No subscriptions due today</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {todayList.map(s => {
                const items = safeItems(s.items)
                return (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition">
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarColor(s.customer_name)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                      {s.customer_name?.[0]?.toUpperCase() || '?'}
                    </div>
                    {/* Customer */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{s.customer_name || '—'}</p>
                      <p className="text-xs text-gray-400">{s.customer_phone || s.customer_email || '—'}</p>
                    </div>
                    {/* Items */}
                    <div className="flex-1 min-w-0 hidden md:block">
                      <p className="text-xs text-gray-600 truncate">{items.map(i => `${i.name} ×${i.quantity}`).join(', ') || '—'}</p>
                      <FreqBadge freq={s.frequency}/>
                    </div>
                    {/* Amount + payment */}
                    <div className="text-right flex-shrink-0">
                      <p className="font-semibold text-gray-800 text-sm">₹{parseFloat(s.price_per_cycle || 0).toFixed(0)}</p>
                      <PayBadge status={s.payment_status}/>
                    </div>
                    <button onClick={() => setDrawerSub(s.id)}
                      className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500 transition flex-shrink-0">
                      <ChevronRight size={16}/>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ CALENDAR TAB ═══════════════════════════════════ */}
      {!loading && tab === 'calendar' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">From</label>
              <input type="date" value={calFrom} onChange={e => setCalFrom(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">To</label>
              <input type="date" value={calTo} onChange={e => setCalTo(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
            </div>
            <button onClick={fetchCalendar}
              className="flex items-center gap-2 bg-[#1B4332] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#163826] transition">
              <RefreshCw size={14}/> Refresh
            </button>
          </div>

          {Object.keys(calendar).length === 0 ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-gray-100 text-gray-400">
              <Calendar size={32} className="mx-auto mb-2 opacity-30"/>
              <p>No subscriptions due in this date range</p>
            </div>
          ) : (
            Object.entries(calendar).sort(([a],[b]) => a.localeCompare(b)).map(([date, items]) => {
              const isToday    = date === todayStr()
              const isTomorrow = date === addDays(1)
              const label = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : fmtDate(date)
              return (
                <div key={date} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className={`flex items-center justify-between px-5 py-3 border-b ${isToday ? 'bg-green-50 border-green-100' : 'border-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${isToday ? 'text-green-700' : 'text-gray-800'}`}>{label}</span>
                      <span className="text-xs text-gray-400">{date}</span>
                    </div>
                    <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                      {items.length} delivery{items.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {items.map(s => {
                      const subItems = safeItems(s.items)
                      return (
                        <div key={s.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition">
                          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${avatarColor(s.customer_name)} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                            {s.customer_name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm">{s.customer_name || '—'}</p>
                            <p className="text-xs text-gray-400">{s.customer_phone || '—'}</p>
                          </div>
                          <div className="flex-1 min-w-0 hidden sm:block">
                            <p className="text-xs text-gray-600 truncate">{subItems.map(i => `${i.name} ×${i.quantity}`).join(', ')}</p>
                            <FreqBadge freq={s.frequency}/>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-semibold text-gray-800 text-sm">₹{parseFloat(s.price_per_cycle || 0).toFixed(0)}</p>
                            <PayBadge status={s.payment_status}/>
                          </div>
                          <button onClick={() => setDrawerSub(s.id)}
                            className="p-2 hover:bg-blue-50 rounded-lg text-blue-500 transition flex-shrink-0">
                            <ChevronRight size={16}/>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ══ ALL SUBSCRIPTIONS TAB ══════════════════════════ */}
      {!loading && tab === 'list' && (
        <div className="space-y-4">
          {/* Search + filter bar */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, phone, email…"
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B4332] bg-white"/>
            </div>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {[['all','All'],['active','Active'],['paused','Paused']].map(([key,lbl]) => (
                <button key={key} onClick={() => setStatusFilter(key)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                    statusFilter === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>{lbl}</button>
              ))}
            </div>
            <span className="text-xs text-gray-400">{filteredSubs.length} subscription{filteredSubs.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Cards */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {filteredSubs.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <Package size={32} className="mx-auto mb-2 opacity-30"/>
                <p className="text-sm">No subscriptions{search ? ' matching your search' : ' yet'}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredSubs.map(s => {
                  const items  = safeItems(s.items)
                  const isBusy = busy === s.id
                  const customSch = parseCustomSchedule(s.notes)
                  return (
                    <div key={s.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition ${!s.is_active ? 'opacity-60' : ''}`}>
                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarColor(s.customer_name)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                        {s.customer_name?.[0]?.toUpperCase() || '?'}
                      </div>

                      {/* Customer + frequency */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 text-sm">{s.customer_name || '—'}</p>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.is_active ? 'bg-green-500' : 'bg-gray-300'}`}/>
                        </div>
                        <p className="text-xs text-gray-400">{s.customer_phone || s.customer_email || '—'}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <FreqBadge freq={s.frequency}/>
                          {s.frequency === 'custom' && customSch && (
                            <span className="text-[10px] text-purple-500 font-medium">
                              {Object.entries(customSch).filter(([,v]) => v > 0).map(([d]) => d).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Items */}
                      <div className="flex-1 min-w-0 hidden lg:block">
                        <p className="text-xs text-gray-600 truncate">{items.map(i => `${i.emoji || ''} ${i.name} ×${i.quantity}`).join(', ')}</p>
                        <p className="font-semibold text-gray-800 text-sm mt-0.5">₹{parseFloat(s.price_per_cycle || 0).toFixed(0)}/cycle</p>
                      </div>

                      {/* Next delivery */}
                      <div className="text-center hidden md:block flex-shrink-0">
                        <DeliveryBadge dateStr={s.next_delivery}/>
                        <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(s.next_delivery)}</p>
                      </div>

                      {/* Payment */}
                      <div className="flex-shrink-0 hidden sm:block">
                        <PayBadge status={s.payment_status}/>
                        <p className="text-[10px] text-gray-400 text-center mt-0.5">{s.delivery_count || 0} delivered</p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button disabled={isBusy || !s.is_active}
                          onClick={() => quickAction(s.id, () => subscriptionsAPI.markDelivered(s.id), 'Mark as Delivered')}
                          className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 disabled:opacity-30 transition" title="Mark Delivered">
                          <CheckCircle size={16}/>
                        </button>
                        <button disabled={isBusy || !s.is_active}
                          onClick={() => quickAction(s.id, () => subscriptionsAPI.skipDelivery(s.id), 'Skip this delivery')}
                          className="p-1.5 rounded-lg hover:bg-orange-50 text-orange-500 disabled:opacity-30 transition" title="Skip">
                          <SkipForward size={16}/>
                        </button>
                        <button disabled={isBusy}
                          onClick={() => quickAction(s.id,
                            () => subscriptionsAPI.update(s.id, { is_active: !s.is_active }),
                            s.is_active ? 'Pause subscription' : 'Resume subscription'
                          )}
                          className={`p-1.5 rounded-lg transition disabled:opacity-30 ${s.is_active ? 'hover:bg-red-50 text-red-500' : 'hover:bg-green-50 text-green-600'}`}
                          title={s.is_active ? 'Pause' : 'Resume'}>
                          {s.is_active ? <Pause size={16}/> : <Play size={16}/>}
                        </button>
                        <button onClick={() => setDrawerSub(s.id)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition" title="View Detail">
                          <ChevronRight size={16}/>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Detail Drawer ─────────────────────────────────── */}
      {drawerSub && (
        <DetailDrawer subId={drawerSub} onClose={() => setDrawerSub(null)} onRefresh={fetchAll}/>
      )}

    </AdminLayout>
  )
}
