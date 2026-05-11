'use client'
import { useEffect, useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { categoriesAPI } from '../../lib/api'
import { Plus, Pencil, Trash2, X } from 'lucide-react'

const EMPTY = { slug:'', name:'', color:'#16a34a', tagline:'', sort_order:0, is_active:true }

const PRESET_COLORS = [
  '#16a34a','#ef4444','#d97706','#65a30d','#78716c',
  '#ca8a04','#0d9488','#f43f5e','#f97316','#8b5cf6','#0ea5e9','#ec4899',
]

function Initials({ name, color }) {
  const letters = name ? name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : '?'
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
      style={{ backgroundColor: color || '#16a34a' }}>
      {letters}
    </div>
  )
}

export default function CategoriesPage() {
  const [cats, setCats]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)

  async function load() {
    setLoading(true)
    try { const { data } = await categoriesAPI.getAll(); setCats(Array.isArray(data) ? data : (data?.categories || [])) }
    catch(e) { console.error(e) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function openAdd()   { setEditing(null); setForm(EMPTY); setShowModal(true) }
  function openEdit(c) { setEditing(c.id); setForm({ slug:c.slug, name:c.name, color:c.color, tagline:c.tagline||'', sort_order:c.sort_order||0, is_active:c.is_active }); setShowModal(true) }

  async function handleSave(e) {
    e.preventDefault(); setSaving(true)
    try {
      if (editing) await categoriesAPI.update(editing, form)
      else await categoriesAPI.create(form)
      setShowModal(false); load()
    } catch(e) { alert(e.response?.data?.error || 'Save failed') }
    finally { setSaving(false) }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete "${name}"? Products won't be deleted.`)) return
    try { await categoriesAPI.delete(id); load() }
    catch(e) { alert('Delete failed') }
  }

  async function toggleActive(c) {
    try { await categoriesAPI.update(c.id, { ...c, is_active: !c.is_active }); load() }
    catch(e) { alert('Update failed') }
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <AdminLayout title="Categories">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-gray-500">{cats.length} categories — changes reflect on website instantly</p>
        <button onClick={openAdd} className="flex items-center gap-2 bg-[#1B4332] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-[#163826] transition">
          <Plus size={16}/> Add Category
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Category</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Slug</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Tagline</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">Products</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">Status</th>
              <th className="px-4 py-3"/>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="py-12 text-center text-gray-400">Loading…</td></tr>}
            {cats.map(c => (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Initials name={c.name} color={c.color} />
                    <span className="font-medium text-gray-900">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-400">{c.slug}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{c.tagline || '—'}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-700">{c.product_count ?? 0}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleActive(c)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${c.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {c.is_active ? 'Active' : 'Hidden'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600"><Pencil size={15}/></button>
                    <button onClick={() => handleDelete(c.id, c.name)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"><Trash2 size={15}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold">{editing ? 'Edit Category' : 'Add Category'}</h2>
              <button onClick={() => setShowModal(false)}><X size={20} className="text-gray-400"/></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">

              {/* Live preview */}
              <div className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 bg-gray-50">
                <Initials name={form.name} color={form.color} />
                <div>
                  <p className="font-bold text-gray-800 text-sm">{form.name || 'Category Name'}</p>
                  <p className="text-xs text-gray-400">{form.tagline || 'Tagline preview'}</p>
                </div>
                <div className="ml-auto w-3 h-8 rounded-full" style={{ backgroundColor: form.color }} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input required value={form.name} onChange={e => f('name', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]" placeholder="e.g. Dairy Products"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slug * <span className="text-gray-400 font-normal text-xs">(URL key)</span></label>
                  <input required value={form.slug} onChange={e => f('slug', e.target.value.toLowerCase().replace(/\s+/g,'-'))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1B4332]" placeholder="dairy"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                  <input type="number" value={form.sort_order} onChange={e => f('sort_order', parseInt(e.target.value)||0)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
                  <input value={form.tagline} onChange={e => f('tagline', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]" placeholder="e.g. Fresh from the farm"/>
                </div>

                {/* Color picker only */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Accent Color</label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {PRESET_COLORS.map(col => (
                      <button key={col} type="button" onClick={() => f('color', col)}
                        className={`w-8 h-8 rounded-full border-4 transition ${form.color === col ? 'border-gray-700 scale-110' : 'border-white shadow-sm hover:scale-110'}`}
                        style={{ backgroundColor: col }}/>
                    ))}
                    <input type="color" value={form.color} onChange={e => f('color', e.target.value)}
                      className="w-8 h-8 rounded-full cursor-pointer border border-gray-200" title="Custom color"/>
                  </div>
                </div>

                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => f('is_active', e.target.checked)} className="w-4 h-4"/>
                  <label htmlFor="is_active" className="text-sm text-gray-700">Visible on website</label>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-[#1B4332] text-white rounded-xl text-sm font-medium hover:bg-[#163826] disabled:opacity-50">
                  {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
