'use client'
import { useEffect, useRef, useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { productsAPI, categoriesAPI } from '../../lib/api'
import { Plus, Pencil, Archive, Search, X, RotateCcw, Package } from 'lucide-react'

const FALLBACK_CATEGORIES = [
  { slug:'vegetables', name:'Vegetables' },{ slug:'fruits', name:'Fruits' },
  { slug:'oils', name:'Wood-Pressed Oils' },{ slug:'microgreens', name:'Microgreens' },
  { slug:'mushrooms', name:'Mushrooms' },{ slug:'grains', name:'Whole Grains' },
  { slug:'millets', name:'Millets' },{ slug:'eggs', name:'Eggs & Meat' },
  { slug:'flours', name:'Stone-Ground Flours' },
]
const EMPTY = { name:'', category:'', description:'', price:'', offer_price:'', stock:'', unit:'kg', is_featured:false, is_active:true }

const STATUS_TABS = [
  { key: '',            label: 'All' },
  { key: 'active',      label: 'Active' },
  { key: 'inactive',    label: 'Inactive' },
  { key: 'low_stock',   label: 'Low Stock' },
  { key: 'out_of_stock',label: 'Out of Stock' },
]

export default function ProductsPage() {
  const [products, setProducts]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)
  const [editing, setEditing]       = useState(null)
  const [form, setForm]             = useState(EMPTY)
  const [image, setImage]           = useState(null)
  const [saving, setSaving]         = useState(false)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES)
  const prevSearch = useRef('')

  // Single effect: debounce 300ms for search typing, immediate for filter changes
  useEffect(() => {
    const delay = search !== prevSearch.current ? 300 : 0
    prevSearch.current = search
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const params = { limit: 200 }
        if (search)         params.search   = search
        if (statusFilter)   params.status   = statusFilter
        if (categoryFilter) params.category = categoryFilter
        const { data } = await productsAPI.getAllAdmin(params)
        setProducts(data.products || [])
      } catch(e) { console.error(e) }
      finally { setLoading(false) }
    }, delay)
    return () => clearTimeout(t)
  }, [search, statusFilter, categoryFilter])

  // Load categories once
  useEffect(() => {
    categoriesAPI.getAll()
      .then(({ data }) => {
        if (data?.length > 0) setCategories(data.map(c => ({ slug: c.slug, name: c.name })))
      })
      .catch(() => {})
  }, [])

  function openAdd() {
    setEditing(null)
    setForm({ ...EMPTY, category: categories[0]?.slug || '' })
    setImage(null); setShowModal(true)
  }
  function openEdit(p) {
    setEditing(p.id)
    setForm({
      name: p.name, category: p.category, description: p.description||'',
      price: p.price, offer_price: p.offer_price||'', stock: p.stock,
      unit: p.unit||'kg', is_featured: p.is_featured||false,
      is_active: p.is_active !== false
    })
    setImage(null); setShowModal(true)
  }

  async function handleSave(e) {
    e.preventDefault(); setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k,v]) => fd.append(k, v))
      if (image) fd.append('image', image)
      if (editing) await productsAPI.update(editing, fd)
      else await productsAPI.create(fd)
      setShowModal(false); load()
    } catch(e) { alert(e.response?.data?.error || 'Save failed') }
    finally { setSaving(false) }
  }

  async function handleArchive(p) {
    if (!confirm(`Archive "${p.name}"? It will be hidden from the website but preserved in order history.`)) return
    try { await productsAPI.archive(p.id); load() }
    catch(e) { alert('Archive failed') }
  }

  async function handleRestore(p) {
    // Restore = update is_active to true
    const fd = new FormData()
    const fields = { name: p.name, category: p.category, description: p.description||'',
      price: p.price, offer_price: p.offer_price||'', stock: p.stock,
      unit: p.unit||'kg', is_featured: p.is_featured||false, is_active: true }
    Object.entries(fields).forEach(([k,v]) => fd.append(k, v))
    try { await productsAPI.update(p.id, fd); load() }
    catch(e) { alert('Restore failed') }
  }

  async function handleHardDelete(p) {
    if (!confirm(`PERMANENTLY delete "${p.name}"? This cannot be undone and may break order history.`)) return
    try { await productsAPI.hardDelete(p.id); load() }
    catch(e) { alert('Delete failed') }
  }

  const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').replace('/api','')

  function stockColor(s) {
    if (s <= 0)  return 'text-red-600 font-bold'
    if (s <= 5)  return 'text-red-500 font-semibold'
    if (s <= 15) return 'text-orange-500 font-semibold'
    return 'text-green-600 font-semibold'
  }

  return (
    <AdminLayout title="Products">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Search */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-48">
          <Search size={16} className="text-gray-400"/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search products…" className="outline-none text-sm flex-1"/>
          {search && <button onClick={()=>{ setSearch(''); setTimeout(load,0) }}><X size={14} className="text-gray-400"/></button>}
        </div>

        {/* Category filter */}
        <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none">
          <option value="">All Categories</option>
          {categories.map(c=><option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>

        <button onClick={openAdd}
          className="flex items-center gap-2 bg-[#1B4332] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-[#163826] transition">
          <Plus size={16}/> Add Product
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
        {STATUS_TABS.map(tab => (
          <button key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              statusFilter === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Product</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Category</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">Price</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">Stock</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="py-12 text-center text-gray-400">Loading…</td></tr>
            )}
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <Package size={32} className="opacity-30"/>
                    <p className="font-medium">No products found</p>
                  </div>
                </td>
              </tr>
            )}
            {products.map(p => (
              <tr key={p.id} className={`border-b border-gray-50 hover:bg-gray-50 transition ${!p.is_active ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {p.image_url
                      ? <img src={`${baseUrl}${p.image_url}`} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100"/>
                      : <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-lg">🌿</div>
                    }
                    <div>
                      <p className="font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.unit}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 capitalize text-gray-600">{p.category}</td>
                <td className="px-4 py-3 text-right">
                  {p.offer_price && Number(p.offer_price) > 0 ? (
                    <div>
                      <span className="font-semibold text-gray-900">₹{p.offer_price}</span>
                      <span className="text-xs text-gray-400 line-through ml-1">₹{p.price}</span>
                    </div>
                  ) : (
                    <span className="font-semibold">₹{p.price}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={stockColor(p.stock)}>{p.stock}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    !p.is_active        ? 'bg-gray-100 text-gray-500' :
                    p.stock <= 0        ? 'bg-red-100 text-red-600' :
                    p.stock <= 10       ? 'bg-orange-100 text-orange-600' :
                                          'bg-green-100 text-green-700'
                  }`}>
                    {!p.is_active ? 'Archived' : p.stock <= 0 ? 'Out of Stock' : p.stock <= 10 ? 'Low Stock' : 'Active'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={()=>openEdit(p)}
                      title="Edit"
                      className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition">
                      <Pencil size={15}/>
                    </button>
                    {p.is_active ? (
                      <button onClick={()=>handleArchive(p)}
                        title="Archive (hide from website)"
                        className="p-1.5 hover:bg-orange-50 rounded-lg text-orange-500 transition">
                        <Archive size={15}/>
                      </button>
                    ) : (
                      <button onClick={()=>handleRestore(p)}
                        title="Restore (make active again)"
                        className="p-1.5 hover:bg-green-50 rounded-lg text-green-600 transition">
                        <RotateCcw size={15}/>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-3 border-t border-gray-50 text-xs text-gray-400">
          {products.length} product{products.length !== 1 ? 's' : ''} shown
          {statusFilter === '' && ' · Archive hides from website · Permanent delete is in the Edit modal'}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={()=>setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold">{editing ? 'Edit Product' : 'Add Product'}</h2>
              <button onClick={()=>setShowModal(false)}><X size={20} className="text-gray-400"/></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
                  <input required value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                  <select required value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]">
                    {categories.map(c=><option key={c.slug} value={c.slug}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <input value={form.unit} onChange={e=>setForm(p=>({...p,unit:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
                    placeholder="kg, 500g…"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">MRP / Original Price (₹) *</label>
                  <input required type="number" min="0" step="0.01" value={form.price}
                    onChange={e=>setForm(p=>({...p,price:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Offer Price (₹) <span className="text-gray-400 font-normal text-xs">optional</span>
                  </label>
                  <input type="number" min="0" step="0.01" value={form.offer_price}
                    onChange={e=>setForm(p=>({...p,offer_price:e.target.value}))}
                    placeholder="Leave empty for no offer"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
                  {form.offer_price && form.price && Number(form.offer_price) < Number(form.price) && (
                    <p className="text-green-600 text-xs mt-1 font-medium">
                      {Math.round((1 - form.offer_price/form.price)*100)}% off
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stock *</label>
                  <input required type="number" min="0" value={form.stock}
                    onChange={e=>setForm(p=>({...p,stock:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea rows={3} value={form.description}
                    onChange={e=>setForm(p=>({...p,description:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332] resize-none"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Image</label>
                  <input type="file" accept="image/*" onChange={e=>setImage(e.target.files[0])}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"/>
                </div>
                <div className="col-span-2 flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_active}
                      onChange={e=>setForm(p=>({...p,is_active:e.target.checked}))} className="w-4 h-4"/>
                    <span className="text-sm text-gray-700">Active (visible on website)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_featured}
                      onChange={e=>setForm(p=>({...p,is_featured:e.target.checked}))} className="w-4 h-4"/>
                    <span className="text-sm text-gray-700">Featured</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={()=>setShowModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-[#1B4332] text-white rounded-xl text-sm font-medium hover:bg-[#163826] disabled:opacity-50">
                  {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
            {editing && (
              <div className="mx-5 mb-5 border border-red-200 rounded-xl p-4 bg-red-50">
                <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-1">⚠️ Danger Zone</p>
                <p className="text-xs text-red-600 mb-3">
                  Permanently deletes this product and all its data. Past orders referencing this product may lose item details.
                  Archive instead if you just want to hide it from the website.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const prod = products.find(p => p.id === editing) || { id: editing, name: 'this product' }
                    setShowModal(false)
                    handleHardDelete(prod)
                  }}
                  className="w-full py-2 text-sm font-semibold text-red-600 border border-red-300 rounded-lg hover:bg-red-100 transition"
                >
                  Permanently Delete This Product
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
