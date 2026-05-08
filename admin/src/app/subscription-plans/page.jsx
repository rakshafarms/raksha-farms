'use client'
import { useEffect, useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { subscriptionsAPI } from '../../lib/api'
import {
  RefreshCw, ChevronRight, CheckCircle, SkipForward,
  Pause, Play, TrendingUp, Users, Calendar, Repeat,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtFrequency(freq) {
  if (!freq) return '—'
  if (freq === 'daily')      return 'Daily'
  if (freq === 'custom')     return 'Custom Schedule'
  if (freq === 'once')       return 'One-time'
  if (freq === 'weekly')     return 'Every 7 days'
  if (freq === 'bi-weekly')  return 'Every 14 days'
  if (freq === 'monthly')    return 'Every 30 days'
  const m = freq.match(/^interval_(\d+)$/)
  if (m) return `Every ${m[1]} days`
  return freq
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
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

function freqSortKey(freq) {
  if (freq === 'daily')      return 0
  if (freq === 'custom')     return 1
  if (freq === 'weekly')     return 17
  if (freq === 'bi-weekly')  return 24
  if (freq === 'monthly')    return 40
  if (freq?.startsWith('interval_')) {
    const n = parseInt(freq.split('_')[1]) || 99
    return 10 + n
  }
  if (freq === 'once') return 100
  return 200
}

// ── Frequency badge ───────────────────────────────────────────────────────────
const INTERVAL_FREQS = ['weekly', 'bi-weekly', 'monthly']
function isIntervalFreq(freq) {
  return freq?.startsWith('interval_') || INTERVAL_FREQS.includes(freq)
}

function FreqBadge({ freq }) {
  const cls = freq === 'daily'  ? 'bg-blue-50 text-blue-700 border border-blue-100' :
              freq === 'custom' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
              freq === 'once'   ? 'bg-gray-100 text-gray-500' :
              isIntervalFreq(freq) ? 'bg-orange-50 text-orange-700 border border-orange-100' :
              'bg-gray-100 text-gray-500'
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{fmtFrequency(freq)}</span>
}

// ── Frequency icon ────────────────────────────────────────────────────────────
function freqIcon(freq) {
  if (freq === 'daily')    return { icon: '🔁', bg: 'bg-blue-100',   text: 'text-blue-700' }
  if (freq === 'custom')   return { icon: '📅', bg: 'bg-purple-100', text: 'text-purple-700' }
  if (freq === 'once')     return { icon: '🛒', bg: 'bg-gray-100',   text: 'text-gray-600' }
  if (isIntervalFreq(freq)) return { icon: '⏱', bg: 'bg-orange-100', text: 'text-orange-700' }
  return { icon: '📦', bg: 'bg-gray-100', text: 'text-gray-600' }
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, iconBg, valueColor }) {
  return (
    <div className="bg-white rounded-2xl px-5 py-4 border border-gray-100 shadow-sm flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className={`text-2xl font-extrabold leading-none ${valueColor || 'text-gray-900'}`}>{value}</p>
        <p className="text-xs text-gray-400 font-medium mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FrequencyOverviewPage() {
  const [subs, setSubs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(null) // freq key currently expanded

  async function fetchSubs() {
    setLoading(true)
    try {
      const r = await subscriptionsAPI.getAll()
      setSubs(Array.isArray(r.data) ? r.data : [])
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchSubs() }, [])

  // Group subscriptions by frequency
  const groups = {}
  subs.forEach(s => {
    const key = s.frequency || 'unknown'
    if (!groups[key]) groups[key] = []
    groups[key].push(s)
  })

  const sortedKeys = Object.keys(groups).sort((a, b) => freqSortKey(a) - freqSortKey(b))

  const totalActive  = subs.filter(s => s.is_active).length
  const totalPaused  = subs.filter(s => !s.is_active).length
  const totalRevenue = subs.filter(s => s.is_active).reduce((acc, s) => acc + parseFloat(s.price_per_cycle || 0), 0)
  const uniqueFreqs  = sortedKeys.length

  return (
    <AdminLayout title="Subscription Overview">

      {/* ── Top Stats ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Active Subscriptions" value={totalActive}
          iconBg="bg-emerald-100" valueColor="text-emerald-700"
          icon={<TrendingUp size={20} className="text-emerald-700"/>}/>
        <StatCard label="Paused" value={totalPaused}
          iconBg="bg-gray-100" valueColor="text-gray-500"
          icon={<Pause size={20} className="text-gray-500"/>}/>
        <StatCard label="Frequency Types" value={uniqueFreqs}
          iconBg="bg-blue-100" valueColor="text-blue-700"
          icon={<Repeat size={20} className="text-blue-600"/>}/>
        <StatCard label="Active Revenue / Cycle" value={`₹${Math.round(totalRevenue).toLocaleString('en-IN')}`}
          iconBg="bg-violet-100" valueColor="text-violet-700"
          icon={<TrendingUp size={20} className="text-violet-600"/>}/>
      </div>

      {/* ── Refresh ─────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">
          Subscriptions grouped by delivery frequency
        </p>
        <button onClick={fetchSubs}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition">
          <RefreshCw size={14}/> Refresh
        </button>
      </div>

      {loading && <div className="py-16 text-center text-gray-400">Loading…</div>}

      {/* ── Frequency Groups ─────────────────────────────────── */}
      {!loading && sortedKeys.length === 0 && (
        <div className="py-20 text-center bg-white rounded-2xl border border-gray-100 text-gray-400">
          <Repeat size={36} className="mx-auto mb-3 opacity-20"/>
          <p className="text-sm">No subscriptions yet</p>
          <p className="text-xs mt-1">Customers can subscribe from the product or checkout page</p>
        </div>
      )}

      <div className="space-y-4">
        {sortedKeys.map(freq => {
          const group   = groups[freq]
          const active  = group.filter(s => s.is_active)
          const paused  = group.filter(s => !s.is_active)
          const revenue = active.reduce((acc, s) => acc + parseFloat(s.price_per_cycle || 0), 0)
          const fi      = freqIcon(freq)
          const isOpen  = expanded === freq

          return (
            <div key={freq} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

              {/* Group header — click to expand */}
              <button
                onClick={() => setExpanded(isOpen ? null : freq)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition text-left"
              >
                {/* Icon */}
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${fi.bg}`}>
                  {fi.icon}
                </div>

                {/* Freq name + badge */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900">{fmtFrequency(freq)}</p>
                    <FreqBadge freq={freq}/>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {active.length} active · {paused.length} paused
                  </p>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-gray-800">₹{Math.round(revenue).toLocaleString('en-IN')}</p>
                    <p className="text-[10px] text-gray-400">revenue/cycle</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-extrabold text-gray-900">{group.length}</p>
                    <p className="text-[10px] text-gray-400">subscribers</p>
                  </div>
                  <ChevronRight size={18} className={`text-gray-300 transition-transform ${isOpen ? 'rotate-90' : ''}`}/>
                </div>
              </button>

              {/* Expanded subscriber list */}
              {isOpen && (
                <div className="border-t border-gray-50 divide-y divide-gray-50">
                  {group.map(s => {
                    const items       = safeItems(s.items)
                    const customSch   = parseCustomSchedule(s.notes)

                    return (
                      <div key={s.id} className={`flex items-center gap-4 px-5 py-3.5 ${!s.is_active ? 'opacity-60' : ''}`}>
                        {/* Avatar */}
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarColor(s.customer_name)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                          {s.customer_name?.[0]?.toUpperCase() || '?'}
                        </div>

                        {/* Customer */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-gray-900 text-sm">{s.customer_name || '—'}</p>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.is_active ? 'bg-green-500' : 'bg-gray-300'}`}/>
                          </div>
                          <p className="text-xs text-gray-400">{s.customer_phone || s.customer_email || '—'}</p>
                          {/* Custom schedule day summary */}
                          {freq === 'custom' && customSch && (
                            <p className="text-[10px] text-purple-500 font-medium mt-0.5">
                              {DAYS_SHORT.filter(d => customSch[d] > 0).map(d => `${d}×${customSch[d]}`).join('  ')}
                            </p>
                          )}
                        </div>

                        {/* Items */}
                        <div className="flex-1 min-w-0 hidden md:block">
                          <p className="text-xs text-gray-600 truncate">
                            {items.map(i => `${i.emoji || ''} ${i.name} ×${i.quantity}`).join(', ')}
                          </p>
                        </div>

                        {/* Next delivery */}
                        <div className="text-right flex-shrink-0 hidden sm:block">
                          <p className="text-xs font-semibold text-gray-700">{fmtDate(s.next_delivery)}</p>
                          <p className="text-[10px] text-gray-400">next delivery</p>
                        </div>

                        {/* Amount */}
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-gray-800">₹{parseFloat(s.price_per_cycle || 0).toFixed(0)}</p>
                          <p className="text-[10px] text-gray-400">per cycle</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

    </AdminLayout>
  )
}
