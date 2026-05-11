'use client'
import { useEffect, useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { productsAPI, categoriesAPI } from '../../lib/api'
import { AlertTriangle, Package, Search } from 'lucide-react'

const FALLBACK_CATEGORIES = [
  { slug:'vegetables', name:'Vegetables' },{ slug:'fruits', name:'Fruits' },
  { slug:'oils', name:'Wood-Pressed Oils' },{ slug:'microgreens', name:'Microgreens' },
  { slug:'mushrooms', name:'Mushrooms' },{ slug:'grains', name:'Whole Grains' },
  { slug:'millets', name:'Millets' },{ slug:'eggs', name:'Eggs & Meat' },
  { slug:'flours', name:'Stone-Ground Flours' },
]

export default function InventoryPage() {
  const [products, setProducts] = useState([])
  const [lowStock, setLowStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [newStock, setNewStock] = useState('')
  const [reason, setReason] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES)

  useEffect(() => {
    Promise.all([
      productsAPI.getAll({ limit: 200 }),
      productsAPI.getLowStock(10),
      categoriesAPI.getAll().catch(() => ({ data: [] })),
    ]).then(([all, low, cats]) => {
      setProducts(all.data?.products || [])
      setLowStock(Array.isArray(low.data) ? low.data : [])
      if (cats.data && cats.data.length > 0) setCategories(cats.data.map(c => ({ slug: c.slug, name: c.name })))
    }).catch(() => alert('Failed to load inventory')).finally(() => setLoading(false))
  }, [])

  async function saveStock(id) {
    const qty = parseInt(newStock, 10)
    if (isNaN(qty) || qty < 0) { alert('Please enter a valid stock quantity'); return }
    try {
      await productsAPI.updateStock(id, qty, reason)
      setProducts(prev => prev.map(p => p.id === id ? { ...p, stock: qty } : p))
      setLowStock(prev => prev.filter(p => !(p.id === id && qty > 10)))
      setEditing(null); setNewStock(''); setReason('')
    } catch(e) { alert('Failed to update stock') }
  }

  const filtered = products.filter(p => {
    const matchCat = selectedCategory === 'all' || p.category === selectedCategory
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  // Stats
  const outOfStock  = products.filter(p => p.stock === 0).length
  const critical    = products.filter(p => p.stock > 0 && p.stock <= 5).length
  const lowStockCnt = products.filter(p => p.stock > 5 && p.stock <= 15).length
  const good        = products.filter(p => p.stock > 15).length

  return (
    <AdminLayout title="Inventory">

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label:'Out of Stock', value: outOfStock, color:'bg-red-50 text-red-700 border-red-100' },
          { label:'Critical (≤5)', value: critical,  color:'bg-orange-50 text-orange-700 border-orange-100' },
          { label:'Low (≤15)',    value: lowStockCnt,color:'bg-yellow-50 text-yellow-700 border-yellow-100' },
          { label:'Good',         value: good,        color:'bg-green-50 text-green-700 border-green-100' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.color}`}>
            <p className="text-2xl font-black">{s.value}</p>
            <p className="text-xs font-medium mt-0.5 opacity-80">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-amber-600"/>
            <p className="font-semibold text-amber-800">{lowStock.length} product{lowStock.length>1?'s':''} low on stock</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(p => (
              <span key={p.id} className="bg-amber-100 text-amber-800 text-xs px-3 py-1 rounded-full font-medium">
                {p.name} — {p.stock} left
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* Search */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 w-full sm:w-64">
          <Search size={15} className="text-gray-400 flex-shrink-0"/>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products…"
            className="outline-none text-sm flex-1 min-w-0"
          />
        </div>

        {/* Category filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {[{ slug:'all', name:'All Categories' }, ...categories].map(cat => (
            <button
              key={cat.slug}
              onClick={() => setSelectedCategory(cat.slug)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedCategory === cat.slug
                  ? 'bg-[#1B4332] text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-[#1B4332] hover:text-[#1B4332]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-gray-600"/>
            <h2 className="font-semibold text-gray-800">Stock Levels</h2>
          </div>
          <span className="text-xs text-gray-400">{filtered.length} product{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-gray-500 font-medium">Product</th>
              <th className="text-left px-5 py-3 text-gray-500 font-medium">Category</th>
              <th className="text-right px-5 py-3 text-gray-500 font-medium">Current Stock</th>
              <th className="text-left px-5 py-3 text-gray-500 font-medium">Level</th>
              <th className="px-5 py-3"/>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="py-12 text-center text-gray-400">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="py-12 text-center text-gray-400">No products found</td></tr>
            )}
            {filtered.map(p => {
              const level  = p.stock === 0 ? 'out' : p.stock <= 5 ? 'critical' : p.stock <= 15 ? 'low' : 'good'
              const colors = {
                out:      'bg-red-100 text-red-700',
                critical: 'bg-orange-100 text-orange-700',
                low:      'bg-yellow-100 text-yellow-700',
                good:     'bg-green-100 text-green-700',
              }
              const labels = { out:'Out of Stock', critical:'Critical', low:'Low', good:'Good' }
              return (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-5 py-3 capitalize text-gray-500">{p.category}</td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900">{p.stock}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${colors[level]}`}>
                      {labels[level]}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {editing === p.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="0" value={newStock}
                          onChange={e => setNewStock(e.target.value)}
                          className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#1B4332]"
                          placeholder="Qty"
                        />
                        <input
                          value={reason} onChange={e => setReason(e.target.value)}
                          className="w-32 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none"
                          placeholder="Reason"
                        />
                        <button onClick={() => saveStock(p.id)} className="bg-[#1B4332] text-white px-2 py-1 rounded-lg text-xs hover:bg-[#163826]">Save</button>
                        <button onClick={() => setEditing(null)} className="text-gray-400 text-xs hover:text-gray-600">Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditing(p.id); setNewStock(String(p.stock)); setReason('') }}
                        className="text-xs text-[#1B4332] font-medium hover:underline"
                      >
                        Update
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  )
}
