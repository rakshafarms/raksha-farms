'use client'
import React, { useEffect, useRef, useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import BulkImportModal from '../../components/BulkImportModal'
import { productsAPI, categoriesAPI } from '../../lib/api'
import { Plus, Pencil, Archive, Search, X, RotateCcw, Package, Trash2, ImagePlus, FileSpreadsheet } from 'lucide-react'

function useAdminToast() {
  const [toast, setToast] = React.useState(null)
  const show = (msg, type = 'error') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }
  const el = toast ? (
    <div className={`fixed top-4 right-4 z-[999] px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-600'}`}>
      {toast.msg}
    </div>
  ) : null
  return { show, el }
}

const FALLBACK_CATEGORIES = [
  { slug:'vegetables', name:'Vegetables' },{ slug:'fruits', name:'Fruits' },
  { slug:'oils', name:'Wood-Pressed Oils' },{ slug:'microgreens', name:'Microgreens' },
  { slug:'mushrooms', name:'Mushrooms' },{ slug:'grains', name:'Whole Grains' },
  { slug:'millets', name:'Millets' },{ slug:'eggs', name:'Eggs & Meat' },
  { slug:'flours', name:'Stone-Ground Flours' },
]
const EMPTY = { name:'', category:'', description:'', price:'', offer_price:'', stock:'', unit:'kg', is_featured:false, is_active:true, variants:[], existingImages:[], coverImageUrl:null }

const STATUS_TABS = [
  { key: '',            label: 'All' },
  { key: 'active',      label: 'Active' },
  { key: 'inactive',    label: 'Inactive' },
  { key: 'low_stock',   label: 'Low Stock' },
  { key: 'out_of_stock',label: 'Out of Stock' },
]

export default function ProductsPage() {
  const { show: showToast, el: toastEl } = useAdminToast()
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
  const [refreshKey, setRefreshKey] = useState(0)
  const [pendingArchive, setPendingArchive]       = useState(null)
  const [pendingHardDelete, setPendingHardDelete] = useState(null)
  const [newGalleryImages, setNewGalleryImages]   = useState([]) // File[]
  const [bulkOpen, setBulkOpen]                   = useState(false)
  const prevSearch = useRef('')

  // Increment refreshKey to force a reload after mutations (save/archive/delete)
  function load() { setRefreshKey(k => k + 1) }

  // Single effect: debounce 300ms for search typing, immediate for filter/refresh changes
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
  }, [search, statusFilter, categoryFilter, refreshKey])

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
    setImage(null); setNewGalleryImages([]); setShowModal(true)
  }
  function openEdit(p) {
    setEditing(p.id)
    const existingImages = Array.isArray(p.images) ? p.images : (p.images ? (() => { try { return JSON.parse(p.images) } catch { return [] } })() : [])
    setForm({
      name: p.name, category: p.category, description: p.description||'',
      price: p.price, offer_price: p.offer_price||'', stock: p.stock,
      unit: p.unit||'kg', is_featured: p.is_featured||false,
      is_active: p.is_active !== false,
      variants: Array.isArray(p.variants) ? p.variants : [],
      existingImages,
      coverImageUrl: p.image_url || null,
    })
    setImage(null); setNewGalleryImages([]); setShowModal(true)
  }

  async function handleSave(e) {
    e.preventDefault(); setSaving(true)
    try {
      const fd = new FormData()
      // Basic fields
      const skip = new Set(['variants','existingImages','coverImageUrl'])
      Object.entries(form).forEach(([k,v]) => { if (!skip.has(k)) fd.append(k, v) })
      // Variants as JSON
      fd.append('variants', JSON.stringify(form.variants || []))
      // Cover image
      if (image) fd.append('image', image)
      else if (editing && form.coverImageUrl === null) fd.append('remove_image', 'true')
      // Existing gallery images (so backend knows which to keep)
      fd.append('existing_images', JSON.stringify(form.existingImages || []))
      // New gallery images
      newGalleryImages.forEach(f => fd.append('images', f))
      if (editing) await productsAPI.update(editing, fd)
      else await productsAPI.create(fd)
      setShowModal(false); load()
    } catch(e) { showToast(e.response?.data?.error || 'Save failed') }
    finally { setSaving(false) }
  }

  async function confirmArchive() {
    if (!pendingArchive) return
    const p = pendingArchive; setPendingArchive(null)
    try { await productsAPI.archive(p.id); load() }
    catch(e) { showToast('Archive failed') }
  }

  async function handleRestore(p) {
    const fd = new FormData()
    const fields = { name: p.name, category: p.category, description: p.description||'',
      price: p.price, offer_price: p.offer_price||'', stock: p.stock,
      unit: p.unit||'kg', is_featured: p.is_featured||false, is_active: true }
    Object.entries(fields).forEach(([k,v]) => fd.append(k, v))
    try { await productsAPI.update(p.id, fd); load() }
    catch(e) { showToast('Restore failed') }
  }

  async function confirmHardDelete() {
    if (!pendingHardDelete) return
    const p = pendingHardDelete; setPendingHardDelete(null)
    try { await productsAPI.hardDelete(p.id); load() }
    catch(e) { showToast('Delete failed') }
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
      {toastEl}

      {/* Archive confirm */}
      {pendingArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
            <p className="font-semibold text-gray-800 mb-1">Archive &ldquo;{pendingArchive.name}&rdquo;?</p>
            <p className="text-sm text-gray-400 mb-4">It will be hidden from the website but preserved in order history.</p>
            <div className="flex gap-3">
              <button onClick={confirmArchive} className="flex-1 py-2 bg-orange-500 text-white rounded-xl font-medium text-sm hover:bg-orange-600">Yes, archive</button>
              <button onClick={() => setPendingArchive(null)} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Hard-delete confirm */}
      {pendingHardDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
            <p className="font-semibold text-gray-800 mb-1">Permanently delete &ldquo;{pendingHardDelete.name}&rdquo;?</p>
            <p className="text-sm text-red-400 mb-4">This cannot be undone and may break order history.</p>
            <div className="flex gap-3">
              <button onClick={confirmHardDelete} className="flex-1 py-2 bg-red-500 text-white rounded-xl font-medium text-sm hover:bg-red-600">Yes, delete</button>
              <button onClick={() => setPendingHardDelete(null)} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Search */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-48">
          <Search size={16} className="text-gray-400"/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search products…" className="outline-none text-sm flex-1"/>
          {search && <button onClick={()=>setSearch('')}><X size={14} className="text-gray-400"/></button>}
        </div>

        {/* Category filter */}
        <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none">
          <option value="">All Categories</option>
          {categories.map(c=><option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>

        <button
          onClick={() => setBulkOpen(true)}
          className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-xl text-sm font-medium transition"
          title="Download → edit in Excel → upload back to bulk update products"
        >
          <FileSpreadsheet size={16}/> Bulk Update
        </button>

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
                      ? <img src={p.image_url?.startsWith('http') ? p.image_url : `${baseUrl}${p.image_url}`} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100"/>
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
                      <button onClick={()=>setPendingArchive(p)}
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
                {/* ── Size Variants ── */}
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Size / Quantity Variants
                      <span className="ml-1 text-xs text-gray-400 font-normal">(e.g. 250ml, 500ml, 1L)</span>
                    </label>
                    <button type="button"
                      onClick={() => setForm(p => ({ ...p, variants: [...(p.variants||[]), { label:'', price:'', stock:'' }] }))}
                      className="flex items-center gap-1 text-xs font-semibold text-forest-600 hover:text-forest-800 bg-forest-50 hover:bg-forest-100 px-2.5 py-1.5 rounded-lg transition">
                      <Plus size={12}/> Add Size
                    </button>
                  </div>
                  {(form.variants||[]).length === 0 ? (
                    <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2.5">
                      No variants — product sold in a single size. Add sizes above to let customers choose.
                    </p>
                  ) : (
                    <div className="w-full border border-gray-200 rounded-xl overflow-hidden">
                      {/* Header row */}
                      <div className="grid grid-cols-[2fr_1.5fr_1.5fr_36px] bg-gray-50 border-b border-gray-200">
                        <div className="px-3 py-2 text-xs font-semibold text-gray-500">Label (size)</div>
                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-l border-gray-200">Price (₹)</div>
                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-l border-gray-200">Stock (qty)</div>
                        <div className="w-9" />
                      </div>
                      {/* Input rows */}
                      {(form.variants||[]).map((v, i) => (
                        <div key={i} className={`grid grid-cols-[2fr_1.5fr_1.5fr_36px] items-center ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                          <input
                            value={v.label} placeholder="e.g. 500ml"
                            onChange={e => setForm(p => { const vs=[...p.variants]; vs[i]={...vs[i],label:e.target.value}; return {...p,variants:vs} })}
                            className="w-full px-3 py-2.5 text-sm bg-transparent focus:outline-none focus:bg-blue-50 placeholder-gray-300"/>
                          <input
                            type="number" min="0" step="0.01" value={v.price} placeholder="0.00"
                            onChange={e => setForm(p => { const vs=[...p.variants]; vs[i]={...vs[i],price:e.target.value}; return {...p,variants:vs} })}
                            className="w-full px-3 py-2.5 text-sm bg-transparent border-l border-gray-100 focus:outline-none focus:bg-blue-50 placeholder-gray-300"/>
                          <input
                            type="number" min="0" value={v.stock} placeholder="0"
                            onChange={e => setForm(p => { const vs=[...p.variants]; vs[i]={...vs[i],stock:e.target.value}; return {...p,variants:vs} })}
                            className="w-full px-3 py-2.5 text-sm bg-transparent border-l border-gray-100 focus:outline-none focus:bg-blue-50 placeholder-gray-300"/>
                          <button type="button"
                            onClick={() => setForm(p => ({ ...p, variants: p.variants.filter((_,j)=>j!==i) }))}
                            className="flex items-center justify-center w-9 h-full text-red-400 hover:text-red-600 hover:bg-red-50 transition">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {(form.variants||[]).length > 0 && (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-2">
                      When variants are set, the base Price & Stock above are used as fallback only.
                    </p>
                  )}
                </div>

                {/* ── Images ── */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Product Photos</label>

                  {/* Existing cover image */}
                  {form.coverImageUrl && (
                    <div className="mb-2">
                      <p className="text-xs text-gray-400 mb-1">Cover photo</p>
                      <div className="relative inline-block">
                        <img src={form.coverImageUrl.startsWith('http') ? form.coverImageUrl : `${baseUrl}${form.coverImageUrl}`} alt="cover"
                          className="w-20 h-20 rounded-xl object-cover border border-gray-200"/>
                        <button type="button"
                          onClick={() => setForm(p => ({ ...p, coverImageUrl: null }))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition">
                          <X size={10}/>
                        </button>
                      </div>
                    </div>
                  )}
                  {!form.coverImageUrl && (
                    <div className="mb-2">
                      <label className="block text-xs text-gray-500 mb-1">Cover photo {editing ? '(upload to replace)' : ''}</label>
                      <input type="file" accept="image/*"
                        onChange={e => { const f = e.target.files[0]; if (f) setImage(f) }}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"/>
                      {image && (
                        <div className="relative inline-block mt-2">
                          <img src={URL.createObjectURL(image)} alt="new cover preview"
                            className="w-20 h-20 rounded-xl object-cover border-2 border-forest-400"/>
                          <button type="button" onClick={() => setImage(null)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition">
                            <X size={10}/>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Existing gallery images */}
                  {(form.existingImages||[]).length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs text-gray-400 mb-1">Gallery photos (click ✕ to remove)</p>
                      <div className="flex gap-2 flex-wrap">
                        {(form.existingImages||[]).map((url, i) => (
                          <div key={i} className="relative">
                            <img src={url.startsWith('http') ? url : `${baseUrl}${url}`} alt=""
                              className="w-16 h-16 rounded-xl object-cover border border-gray-200"/>
                            <button type="button"
                              onClick={() => setForm(p => ({ ...p, existingImages: p.existingImages.filter((_,j)=>j!==i) }))}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition">
                              <X size={10}/>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Upload new gallery images */}
                  <label className="flex items-center gap-2 border-2 border-dashed border-gray-200 rounded-xl px-3 py-3 cursor-pointer hover:border-forest-400 hover:bg-forest-50/30 transition">
                    <ImagePlus size={16} className="text-gray-400"/>
                    <span className="text-sm text-gray-500">Add more photos (up to 10)</span>
                    <input type="file" accept="image/*" multiple className="hidden"
                      onChange={e => setNewGalleryImages(prev => [...prev, ...Array.from(e.target.files)])}/>
                  </label>
                  {newGalleryImages.length > 0 && (
                    <div className="flex gap-2 flex-wrap mt-2">
                      {newGalleryImages.map((f,i) => (
                        <div key={i} className="relative">
                          <img src={URL.createObjectURL(f)} alt="" className="w-16 h-16 rounded-xl object-cover border border-gray-200"/>
                          <button type="button"
                            onClick={() => setNewGalleryImages(prev => prev.filter((_,j)=>j!==i))}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition">
                            <X size={10}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
                    setPendingHardDelete(prod)
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

      {/* Bulk import / update via Excel */}
      <BulkImportModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        products={products}
        onImported={load}
      />
    </AdminLayout>
  )
}
