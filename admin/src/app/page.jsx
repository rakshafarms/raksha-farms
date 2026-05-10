'use client'
import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { analyticsAPI } from '../lib/api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts'
import {
  ShoppingCart, IndianRupee, Users, Clock,
  TrendingUp, TrendingDown, Minus, Package,
  ArrowRight, CheckCircle2, XCircle, Truck
} from 'lucide-react'

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString('en-IN')
const fmtRs = (n) => `₹${fmt(n)}`
const timeAgo = (ts) => {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60)  return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return `${Math.floor(diff/86400)}d ago`
}

// ─── status config ──────────────────────────────────────────────────────────
const STATUS = {
  placed:           { label: 'Placed',         color: '#6366f1', bg: 'bg-indigo-50',  text: 'text-indigo-700',  dot: 'bg-indigo-400' },
  accepted:         { label: 'Accepted',        color: '#3b82f6', bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-400' },
  preparing:        { label: 'Preparing',       color: '#f59e0b', bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  out_for_delivery: { label: 'Out for Delivery',color: '#8b5cf6', bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-400' },
  delivered:        { label: 'Delivered',       color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  cancelled:        { label: 'Cancelled by Customer', color: '#9ca3af', bg: 'bg-gray-100',   text: 'text-gray-600',    dot: 'bg-gray-400' },
  rejected:         { label: 'Rejected by Admin',   color: '#ef4444', bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-400' },
}

// ─── sub-components ─────────────────────────────────────────────────────────
// theme = { card, border, iconBg, iconText, value, labelBg, labelText }
function StatCard({ title, value, sub, icon, theme, change }) {
  const isNull = change === null || change === undefined
  const isUp   = change > 0
  const isFlat = change === 0

  return (
    <div className={`relative rounded-2xl p-6 shadow-sm overflow-hidden hover:shadow-lg transition-all duration-200 border-l-4 ${theme.card} ${theme.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">{title}</p>
          <p className={`text-4xl font-black leading-none truncate ${theme.value}`}>{value}</p>

          {/* delta badge */}
          <div className="mt-3">
            {isNull || isFlat ? (
              <span className="inline-flex items-center gap-1 text-xs text-gray-400 font-medium bg-gray-100 px-2 py-1 rounded-full">
                <Minus size={11}/> Same as yesterday
              </span>
            ) : isUp ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
                <TrendingUp size={11}/> +{change}% vs yesterday
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-full">
                <TrendingDown size={11}/> {change}% vs yesterday
              </span>
            )}
          </div>

          {sub && <p className="text-xs text-gray-400 mt-2">{sub}</p>}
        </div>

        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${theme.iconBg} ${theme.iconText} shadow-inner`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

// Card themes — each one clearly distinct
const THEMES = {
  blue: {
    card:     'bg-blue-50 border-gray-100',
    border:   'border-l-blue-500',
    iconBg:   'bg-blue-500',
    iconText: 'text-white',
    value:    'text-blue-700',
  },
  green: {
    card:     'bg-emerald-50 border-gray-100',
    border:   'border-l-emerald-600',
    iconBg:   'bg-emerald-600',
    iconText: 'text-white',
    value:    'text-emerald-700',
  },
  purple: {
    card:     'bg-purple-50 border-gray-100',
    border:   'border-l-purple-600',
    iconBg:   'bg-purple-600',
    iconText: 'text-white',
    value:    'text-purple-700',
  },
  orange: {
    card:     'bg-orange-50 border-gray-100',
    border:   'border-l-orange-500',
    iconBg:   'bg-orange-500',
    iconText: 'text-white',
    value:    'text-orange-600',
  },
}

function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`}/>
      {s.label}
    </span>
  )
}

const RevTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 shadow-xl rounded-xl px-4 py-3 text-sm">
      <p className="font-semibold text-gray-600 mb-1">{label}</p>
      <p className="text-[#1B4332] font-bold text-base">{fmtRs(payload[0]?.value)}</p>
    </div>
  )
}

const OrdTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 shadow-xl rounded-xl px-4 py-3 text-sm">
      <p className="font-semibold text-gray-600 mb-1">{label}</p>
      <p className="text-violet-600 font-bold text-base">{payload[0]?.value} orders</p>
    </div>
  )
}

// ─── main page ───────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const now = new Date()
  const todayLabel = now.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })

  useEffect(() => {
    analyticsAPI.getDashboard()
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <AdminLayout title="Dashboard">
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-10 h-10 border-4 border-[#1B4332] border-t-transparent rounded-full animate-spin"/>
        <p className="text-gray-400 text-sm">Loading dashboard…</p>
      </div>
    </AdminLayout>
  )

  const kpis   = data?.kpis || {}
  const allDaily = data?.dailySales || []
  const firstActive = allDaily.findIndex(d => Number(d.revenue) > 0 || Number(d.orders) > 0)
  const daily  = firstActive >= 0 ? allDaily.slice(firstActive) : allDaily
  const top    = data?.topProducts || []
  const recent = data?.recentOrders || []
  const statusBreakdown = (data?.statusBreakdown || []).map(s => ({
    name: STATUS[s.status]?.label || s.status,
    value: parseInt(s.count),
    color: STATUS[s.status]?.color || '#9ca3af',
  }))

  const maxRevenue = Math.max(...daily.map(d => Number(d.revenue) || 0), 1)
  const maxOrders  = Math.max(...daily.map(d => Number(d.orders)  || 0), 1)

  return (
    <AdminLayout title="Dashboard">

      {/* ── header bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Good {now.getHours() < 12 ? 'Morning' : now.getHours() < 17 ? 'Afternoon' : 'Evening'} 👋</h1>
          <p className="text-sm text-gray-400 mt-0.5">{todayLabel}</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>
          <span className="text-xs font-semibold text-emerald-700">Live Dashboard</span>
        </div>
      </div>

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Today's Orders"
          value={fmt(kpis.todayOrders)}
          sub="Non-cancelled orders today"
          icon={<ShoppingCart size={24}/>}
          theme={THEMES.blue}
          change={kpis.ordersChange}
        />
        <StatCard
          title="Today's Revenue"
          value={fmtRs(kpis.todayRevenue)}
          sub="All non-cancelled orders"
          icon={<IndianRupee size={24}/>}
          theme={THEMES.green}
          change={kpis.revenueChange}
        />
        <StatCard
          title="Active Customers"
          value={fmt(kpis.todayCustomers)}
          sub="Unique buyers today"
          icon={<Users size={24}/>}
          theme={THEMES.purple}
          change={kpis.customersChange}
        />
        <StatCard
          title="Pending Orders"
          value={fmt(kpis.pendingOrders)}
          sub="Needs attention now"
          icon={<Clock size={24}/>}
          theme={THEMES.orange}
          change={null}
        />
      </div>

      {/* ── charts row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">

        {/* Revenue 7d */}
        <div className="xl:col-span-2 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-gray-800 text-base">Revenue — Last 7 Days</h2>
              <p className="text-xs text-gray-400 mt-0.5">Excludes cancelled &amp; rejected orders</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">7-day total</p>
              <p className="text-lg font-extrabold text-[#1B4332]">
                {fmtRs(daily.reduce((a,b) => a + Number(b.revenue||0), 0))}
              </p>
            </div>
          </div>
          {daily.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-gray-400 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={daily} margin={{top:20, right:16, left:8, bottom:5}} barCategoryGap="40%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false}/>
                <XAxis dataKey="label" tick={{fontSize:11, fill:'#9ca3af'}} axisLine={false} tickLine={false}/>
                <YAxis
                  tick={{fontSize:11, fill:'#9ca3af'}}
                  tickFormatter={v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`}
                  width={48} axisLine={false} tickLine={false}
                  domain={[0, Math.ceil(maxRevenue * 1.3)]} tickCount={5}
                />
                <Tooltip content={<RevTooltip/>} cursor={{fill:'#f0fdf4', rx:6}}/>
                <Bar dataKey="revenue" radius={[8,8,0,0]} maxBarSize={44} isAnimationActive={false}>
                  {daily.map((d, i) => (
                    <Cell key={i} fill={Number(d.revenue) === maxRevenue ? '#1B4332' : '#6ee7b7'}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Order status donut */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col">
          <h2 className="font-bold text-gray-800 text-base mb-1">Order Status</h2>
          <p className="text-xs text-gray-400 mb-4">All-time breakdown</p>
          {statusBreakdown.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">No data</div>
          ) : (
            <div className="flex-1 flex flex-col justify-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={statusBreakdown} cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80}
                    paddingAngle={3} dataKey="value"
                    isAnimationActive={false}
                  >
                    {statusBreakdown.map((entry, i) => (
                      <Cell key={i} fill={entry.color}/>
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, n) => [v + ' orders', n]}
                    contentStyle={{ borderRadius:12, border:'1px solid #f0f0f0', fontSize:12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
                {statusBreakdown.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600 truncate">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background: s.color}}/>
                    <span className="truncate">{s.name}</span>
                    <span className="font-bold ml-auto">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── orders trend (7d) + recent orders ──────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">

        {/* Orders trend */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-gray-800 text-base">Orders Trend</h2>
              <p className="text-xs text-gray-400 mt-0.5">Last 7 days</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">total</p>
              <p className="text-lg font-extrabold text-violet-600">
                {daily.reduce((a,b) => a + Number(b.orders||0), 0)}
              </p>
            </div>
          </div>
          {daily.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={daily} margin={{top:16, right:8, left:0, bottom:5}} barCategoryGap="40%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false}/>
                <XAxis dataKey="label" tick={{fontSize:10, fill:'#9ca3af'}} axisLine={false} tickLine={false}/>
                <YAxis
                  tick={{fontSize:10, fill:'#9ca3af'}} width={28}
                  axisLine={false} tickLine={false} allowDecimals={false}
                  domain={[0, Math.ceil(maxOrders * 1.3)]} tickCount={4}
                />
                <Tooltip content={<OrdTooltip/>} cursor={{fill:'#f5f3ff', rx:6}}/>
                <Bar dataKey="orders" radius={[6,6,0,0]} maxBarSize={36} isAnimationActive={false}>
                  {daily.map((d, i) => (
                    <Cell key={i} fill={Number(d.orders) === maxOrders ? '#7c3aed' : '#c4b5fd'}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recent orders */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
            <div>
              <h2 className="font-bold text-gray-800 text-base">Recent Orders</h2>
              <p className="text-xs text-gray-400 mt-0.5">Latest 8 orders across all time</p>
            </div>
            <a href="/orders" className="flex items-center gap-1 text-xs font-semibold text-[#1B4332] hover:underline">
              View all <ArrowRight size={12}/>
            </a>
          </div>
          {recent.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">No orders yet</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recent.map((o) => (
                <div key={o.id} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors">
                  {/* avatar */}
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1B4332] to-emerald-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {(o.customer_name || 'U')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{o.customer_name || 'Unknown'}</p>
                    <p className="text-xs text-gray-400 truncate">{o.customer_email}</p>
                  </div>
                  <StatusBadge status={o.status}/>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gray-900 text-sm">{fmtRs(o.total)}</p>
                    <p className="text-xs text-gray-400">{timeAgo(o.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── top products ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800 text-base">Top Selling Products</h2>
            <p className="text-xs text-gray-400 mt-0.5">All-time, by units sold</p>
          </div>
          <Package size={18} className="text-gray-300"/>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/60">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">#</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Product</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Category</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Units Sold</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Orders</th>
              </tr>
            </thead>
            <tbody>
              {top.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400">No sales data yet</td>
                </tr>
              )}
              {top.map((p, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">{i+1}</span>
                  </td>
                  <td className="px-3 py-4 font-semibold text-gray-900">{p.name}</td>
                  <td className="px-3 py-4">
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 capitalize">{p.category}</span>
                  </td>
                  <td className="px-3 py-4 text-right">
                    <span className="font-bold text-[#1B4332] text-base">{fmt(p.units_sold)}</span>
                  </td>
                  <td className="px-6 py-4 text-right text-gray-500 font-medium">{fmt(p.order_count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </AdminLayout>
  )
}
