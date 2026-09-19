'use client'
import { useEffect, useMemo, useState } from 'react'
import { analyticsAPI } from '../lib/api'

const RANGES = [['7','7 Days'],['30','30 Days'],['90','90 Days'],['365','1 Year'],['all','All Time']]
const COLORS = ['#1B4332','#D97706','#3f9a67','#6db38d','#eab842','#a0ccb3','#f5dea1','#ef4444']
const money = n => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const num   = n => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })

// Every item sold, grouped under its category, for a chosen date range.
export default function ItemSalesTable() {
  const [range, setRange]         = useState('30')
  const [sortBy, setSortBy]       = useState('revenue')   // 'revenue' | 'units_sold'
  const [search, setSearch]       = useState('')
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [collapsed, setCollapsed] = useState({})

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    analyticsAPI.getProducts(range)
      .then(r => { if (alive) setRows(Array.isArray(r.data) ? r.data : []) })
      .catch(e => { console.error(e); if (alive) { setRows([]); setError('Could not load item sales') } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [range])

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const map = new Map()
    for (const r of rows) {
      if (q && !String(r.name).toLowerCase().includes(q)) continue
      const g = map.get(r.category) || { category: r.category, name: r.category_name, items: [], units: 0, revenue: 0 }
      g.items.push(r)
      g.units   += Number(r.units_sold)
      g.revenue += Number(r.revenue)
      map.set(r.category, g)
    }
    const list = [...map.values()]
    for (const g of list) g.items.sort((a, b) => Number(b[sortBy]) - Number(a[sortBy]))
    return list.sort((a, b) => b.revenue - a.revenue)
  }, [rows, search, sortBy])

  const total = groups.reduce((a, g) => ({
    items: a.items + g.items.length, units: a.units + g.units, revenue: a.revenue + g.revenue,
  }), { items: 0, units: 0, revenue: 0 })

  const toggle = cat => setCollapsed(c => ({ ...c, [cat]: !c[cat] }))
  const allCollapsed = groups.length > 0 && groups.every(g => collapsed[g.category])
  const setAll = v => setCollapsed(Object.fromEntries(groups.map(g => [g.category, v])))

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold text-gray-800">Sales by Item</h2>
          <p className="text-xs text-gray-400 mt-0.5">Quantity and revenue for every product, grouped by category. Cancelled and rejected orders are excluded.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGES.map(([v, l]) => (
            <button key={v} onClick={() => setRange(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition
                ${range === v ? 'bg-[#1B4332] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item…"
          className="flex-1 min-w-[180px] max-w-xs px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30"/>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span>Sort by</span>
          {[['revenue','Revenue'],['units_sold','Quantity']].map(([v, l]) => (
            <button key={v} onClick={() => setSortBy(v)}
              className={`px-2.5 py-1 rounded-md font-medium ${sortBy === v ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {l}
            </button>
          ))}
        </div>
        {groups.length > 1 && (
          <button onClick={() => setAll(!allCollapsed)} className="text-xs text-[#1B4332] font-medium hover:underline ml-auto">
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center text-gray-400">Loading…</div>
      ) : error ? (
        <div className="h-40 flex items-center justify-center text-red-500 text-sm">{error}</div>
      ) : groups.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-gray-400">{search ? 'No items match your search' : 'No sales in this period'}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500">
                <th className="text-left py-2 font-medium">Item</th>
                <th className="text-left py-2 font-medium">Unit</th>
                <th className="text-right py-2 font-medium">Qty Sold</th>
                <th className="text-right py-2 font-medium">Orders</th>
                <th className="text-right py-2 font-medium">Revenue</th>
                <th className="text-right py-2 font-medium whitespace-nowrap">Share of Category</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, gi) => {
                const color = COLORS[gi % COLORS.length]
                const isCollapsed = !!collapsed[g.category]
                const overallPct = total.revenue > 0 ? (g.revenue / total.revenue * 100).toFixed(1) : '0.0'
                return [
                  <tr key={`cat-${g.category}`} onClick={() => toggle(g.category)}
                    className="bg-gray-50 border-b border-gray-100 cursor-pointer select-none hover:bg-gray-100">
                    <td className="py-2.5 font-semibold text-gray-800" colSpan={2}>
                      <span className="inline-flex items-center gap-2">
                        <span className="text-gray-400 text-xs w-3">{isCollapsed ? '▶' : '▼'}</span>
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color }}/>
                        {g.name}
                        <span className="text-xs font-normal text-gray-400">{g.items.length} {g.items.length === 1 ? 'item' : 'items'}</span>
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-semibold">{num(g.units)}</td>
                    <td className="py-2.5 text-right text-gray-400">—</td>
                    <td className="py-2.5 text-right font-semibold">{money(g.revenue)}</td>
                    <td className="py-2.5 text-right text-gray-500 text-xs">{overallPct}% of total</td>
                  </tr>,
                  ...(isCollapsed ? [] : g.items.map(it => {
                    const pct = g.revenue > 0 ? (Number(it.revenue) / g.revenue * 100) : 0
                    return (
                      <tr key={it.key} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 pl-7">
                          <span className="text-gray-800">{it.name}</span>
                          {it.product_missing && (
                            <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">removed</span>
                          )}
                        </td>
                        <td className="py-2 text-gray-500">{it.unit || '—'}</td>
                        <td className="py-2 text-right font-medium">{num(it.units_sold)}</td>
                        <td className="py-2 text-right text-gray-600">{Number(it.orders).toLocaleString()}</td>
                        <td className="py-2 text-right font-medium">{money(it.revenue)}</td>
                        <td className="py-2 text-right">
                          <span className="inline-flex items-center gap-2 justify-end">
                            <span className="w-16 bg-gray-100 rounded-full h-1.5 hidden sm:inline-block">
                              <span className="block h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }}/>
                            </span>
                            <span className="text-gray-500 text-xs w-10 text-right">{pct.toFixed(1)}%</span>
                          </span>
                        </td>
                      </tr>
                    )
                  })),
                ]
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-semibold text-gray-800">
                <td className="py-2.5" colSpan={2}>
                  Total · {total.items} {total.items === 1 ? 'item' : 'items'} across {groups.length} {groups.length === 1 ? 'category' : 'categories'}
                </td>
                <td className="py-2.5 text-right">{num(total.units)}</td>
                <td className="py-2.5 text-right text-gray-400">—</td>
                <td className="py-2.5 text-right">{money(total.revenue)}</td>
                <td className="py-2.5 text-right text-gray-400 text-xs">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
