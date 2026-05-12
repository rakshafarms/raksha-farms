'use client'
import { useEffect, useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { analyticsAPI } from '../../lib/api'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

const COLORS = ['#1B4332','#D97706','#3f9a67','#6db38d','#eab842','#a0ccb3','#f5dea1','#ef4444']
const STATUS_COLORS = {
  delivered: '#1B4332', placed: '#3b82f6', accepted: '#8b5cf6',
  preparing: '#f59e0b', out_for_delivery: '#06b6d4',
  cancelled: '#ef4444', rejected: '#6b7280',
}

function StatCard({ label, value, sub, color = '#1B4332' }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function AnalyticsPage() {
  const [sales, setSales] = useState([])
  const [categories, setCategories] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [period, setPeriod] = useState('30')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [s, c, d] = await Promise.all([
        analyticsAPI.getSales(period),
        analyticsAPI.getCategories(),
        analyticsAPI.getDashboard(),
      ])
      setSales(Array.isArray(s.data) ? s.data : [])
      setCategories(Array.isArray(c.data) ? c.data : [])
      setDashboard(d.data)
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [period])

  const totalRevenue  = sales.reduce((a,b) => a + Number(b.revenue), 0)
  const totalOrders   = sales.reduce((a,b) => a + Number(b.orders), 0)
  const avgOrderVal   = totalOrders > 0 ? totalRevenue / totalOrders : 0
  const peakDay       = sales.length > 0 ? sales.reduce((a,b) => Number(b.revenue) > Number(a.revenue) ? b : a, sales[0]) : null
  const statusRows    = dashboard?.statusBreakdown || []
  const paymentRows   = dashboard?.paymentMethods  || []

  const deliveredCount  = statusRows.find(r => r.status === 'delivered')?.count || 0
  const cancelledCount  = statusRows.find(r => r.status === 'cancelled')?.count || 0
  const rejectedCount   = statusRows.find(r => r.status === 'rejected')?.count || 0
  const totalAll        = statusRows.reduce((a,b) => a + Number(b.count), 0)
  const completionRate  = totalAll > 0 ? ((Number(deliveredCount) / totalAll) * 100).toFixed(1) : '0.0'
  const cancellationRate = totalAll > 0 ? (((Number(cancelledCount) + Number(rejectedCount)) / totalAll) * 100).toFixed(1) : '0.0'

  const pieStatusData = statusRows.map(r => ({ name: r.status, value: Number(r.count) }))
  const paymentPieData = paymentRows.map(r => ({ name: r.payment_method, value: Number(r.count), revenue: Number(r.revenue) }))

  return (
    <AdminLayout title="Analytics">
      {/* Period selector */}
      <div className="flex gap-2 mb-6">
        {[['7','7 Days'],['30','30 Days'],['90','90 Days']].map(([v,l]) => (
          <button key={v} onClick={() => setPeriod(v)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition
              ${period===v ? 'bg-[#1B4332] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Revenue"    value={`₹${totalRevenue.toLocaleString()}`} />
        <StatCard label="Total Orders"     value={totalOrders.toLocaleString()} color="#D97706"/>
        <StatCard label="Avg Order Value"  value={`₹${Math.round(avgOrderVal).toLocaleString()}`} color="#3f9a67"/>
        <StatCard label="Completion Rate"  value={`${completionRate}%`} color="#6db38d"
          sub={`Cancellation: ${cancellationRate}%`}/>
      </div>
      {peakDay && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 mb-6 text-sm text-amber-800">
          📈 <strong>Peak day:</strong> {peakDay.label} — ₹{Number(peakDay.revenue).toLocaleString()} revenue, {peakDay.orders} orders
        </div>
      )}

      {/* Revenue chart */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">Revenue Over Time</h2>
        {loading ? <div className="h-64 flex items-center justify-center text-gray-400">Loading…</div> : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={sales} margin={{top:20,right:60,left:10,bottom:10}}>
              <defs>
                <linearGradient id="rv2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1B4332" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#1B4332" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="label" tick={{fontSize:11}} interval="preserveStartEnd" padding={{left:20,right:20}}/>
              <YAxis tick={{fontSize:11}} tickFormatter={v=>`₹${v}`} width={72}/>
              <Tooltip formatter={v=>[`₹${Number(v).toLocaleString()}`, 'Revenue']}/>
              <Area type="monotone" dataKey="revenue" stroke="#1B4332" strokeWidth={2} fill="url(#rv2)" dot={false} isAnimationActive={false}/>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        {/* Orders bar chart */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Daily Orders</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sales} margin={{top:20,right:30,left:0,bottom:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="label" tick={{fontSize:11}} interval="preserveStartEnd" padding={{left:10,right:10}}/>
              <YAxis tick={{fontSize:11}} width={40} allowDecimals={false}/>
              <Tooltip/>
              <Bar dataKey="orders" fill="#D97706" radius={[4,4,0,0]} maxBarSize={40}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Avg order value — bar chart avoids line-clipping at edges */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Avg Order Value</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sales} margin={{top:20,right:30,left:10,bottom:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="label" tick={{fontSize:11}} interval="preserveStartEnd" padding={{left:10,right:10}}/>
              <YAxis tick={{fontSize:11}} tickFormatter={v=>`₹${v}`} width={65} allowDecimals={false}/>
              <Tooltip formatter={v=>[`₹${Number(v).toFixed(0)}`,'Avg Value']}/>
              <Bar dataKey="avg_order_value" fill="#3f9a67" radius={[4,4,0,0]} maxBarSize={40} isAnimationActive={false}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Category breakdown — pure HTML, no SVG clipping */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm xl:col-span-1">
          <h2 className="font-semibold text-gray-800 mb-4">Revenue by Category</h2>
          {categories.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-gray-400">No data yet</div>
          ) : (
            <div className="space-y-3 mt-1">
              {categories.map((c, i) => {
                const total = categories.reduce((a,b) => a + Number(b.revenue), 0)
                const pct = total > 0 ? (Number(c.revenue) / total * 100).toFixed(1) : '0.0'
                return (
                  <div key={c.category}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700 capitalize flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{backgroundColor: COLORS[i % COLORS.length]}}/>
                        {c.category}
                      </span>
                      <span className="text-gray-500 text-xs">₹{Number(c.revenue).toLocaleString()} · {pct}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full transition-all" style={{width:`${pct}%`, backgroundColor: COLORS[i % COLORS.length]}}/>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Order status — pure HTML bar list */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm xl:col-span-1">
          <h2 className="font-semibold text-gray-800 mb-4">Order Status</h2>
          {pieStatusData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-gray-400">No data yet</div>
          ) : (
            <div className="space-y-3 mt-1">
              {pieStatusData.map((r, i) => {
                const pct = totalAll > 0 ? (r.value / totalAll * 100).toFixed(1) : '0.0'
                const color = STATUS_COLORS[r.name] || COLORS[i % COLORS.length]
                return (
                  <div key={r.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium capitalize flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{backgroundColor: color}}/>
                        {r.name.replace(/_/g,' ')}
                      </span>
                      <span className="text-gray-500 text-xs">{r.value} · {pct}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full transition-all" style={{width:`${pct}%`, backgroundColor: color}}/>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Payment method breakdown */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm xl:col-span-1">
          <h2 className="font-semibold text-gray-800 mb-3">Payment Methods</h2>
          {paymentPieData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-gray-400">No data yet</div>
          ) : (
            <div className="space-y-3 mt-2">
              {paymentPieData.map((p, i) => (
                <div key={p.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700 uppercase">{p.name}</span>
                    <span className="text-gray-500">{p.value} orders · ₹{p.revenue.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full" style={{
                      width: `${(p.value / paymentPieData.reduce((a,b)=>a+b.value,0)*100).toFixed(1)}%`,
                      backgroundColor: COLORS[i % COLORS.length]
                    }}/>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status count table */}
      {statusRows.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Order Status Breakdown</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-gray-500 font-medium">Status</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Count</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {statusRows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize"
                        style={{ backgroundColor: `${STATUS_COLORS[r.status] || '#6b7280'}22`, color: STATUS_COLORS[r.status] || '#6b7280' }}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-semibold">{Number(r.count).toLocaleString()}</td>
                    <td className="py-2.5 text-right text-gray-500">
                      {totalAll > 0 ? `${(Number(r.count)/totalAll*100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
