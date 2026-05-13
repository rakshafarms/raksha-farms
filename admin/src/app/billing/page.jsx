'use client'
import { useState, useEffect, useRef } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { productsAPI, ordersAPI, API_BASE_URL } from '../../lib/api'
import {
  Search, Plus, Minus, Trash2, Printer, ShoppingBag,
  User, Phone, IndianRupee, Tag, CheckCircle2, X,
  StickyNote, Zap
} from 'lucide-react'

const PAY = [
  { value: 'cash',   label: 'Cash',   emoji: '💵' },
  { value: 'upi',    label: 'UPI',    emoji: '📱' },
  { value: 'card',   label: 'Card',   emoji: '💳' },
  { value: 'credit', label: 'Credit', emoji: '📒' },
]

const fmt    = (n) => Number(n || 0).toLocaleString('en-IN')
const fmtRs  = (n) => `₹${fmt(n)}`
// Backend root for /uploads/ paths (strip trailing /api from API_BASE_URL)
const BACKEND_ROOT = API_BASE_URL.replace(/\/api\/?$/, '')
// image_url resolution:
//   /images/...  → admin's own public/images/ (copied from frontend, served locally)
//   /uploads/... → backend Render server (admin-uploaded files)
//   http(s)://   → absolute, use as-is
const imgSrc = (url) => {
  if (!url) return null
  if (url.startsWith('http')) return url
  if (url.startsWith('/uploads/')) return `${BACKEND_ROOT}${url}`
  return url   // /images/... resolved against admin's own domain
}

export default function BillingPage() {
  const [products,   setProducts]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [cat,        setCat]        = useState('All')
  const [categories, setCategories] = useState(['All'])

  const [cart,          setCart]          = useState([])
  const [customerName,  setCustomerName]  = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [payMethod,     setPayMethod]     = useState('cash')
  const [discount,      setDiscount]      = useState('')
  const [notes,         setNotes]         = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [error,         setError]         = useState('')
  const [receipt,       setReceipt]       = useState(null)

  // Load active products
  useEffect(() => {
    setLoading(true)
    // getAll returns only is_active=true products (same as customer site)
    productsAPI.getAll({ limit: 500 })
      .then(({ data }) => {
        const prods = Array.isArray(data) ? data : (data.products || [])
        setProducts(prods)
        const cats = ['All', ...new Set(prods.map(p => p.category).filter(Boolean).sort())]
        setCategories(cats)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Derived
  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    return (!q || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q))
      && (cat === 'All' || p.category === cat)
  })

  const cartCount = cart.reduce((s, i) => s + i.qty, 0)
  const subtotal  = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const discAmt   = Math.min(Math.max(0, Number(discount) || 0), subtotal)
  const total     = Math.max(0, subtotal - discAmt)

  // ── Cart helpers ──────────────────────────────────────────────────────────
  function addToCart(p) {
    if (Number(p.stock) <= 0) return
    setCart(prev => {
      const ex = prev.find(i => i.id === p.id)
      if (ex) {
        if (ex.qty >= Number(p.stock)) return prev   // respect stock
        return prev.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i)
      }
      const price = p.offer_price && Number(p.offer_price) > 0
        ? Number(p.offer_price) : Number(p.price)
      return [...prev, { id: p.id, name: p.name, unit: p.unit, price, qty: 1, stock: Number(p.stock), image: imgSrc(p.image_url) }]
    })
  }

  const changeQty  = (id, d) => setCart(prev =>
    prev.map(i => i.id === id ? { ...i, qty: Math.max(1, Math.min(i.qty + d, i.stock)) } : i)
  )
  const setItemQty = (id, v) => setCart(prev =>
    prev.map(i => i.id === id ? { ...i, qty: Math.max(1, Math.min(parseInt(v) || 1, i.stock)) } : i)
  )
  const setItemPrice = (id, v) => setCart(prev =>
    prev.map(i => i.id === id ? { ...i, price: Math.max(0, parseFloat(v) || 0) } : i)
  )
  const removeItem = (id) => setCart(prev => prev.filter(i => i.id !== id))

  function resetBill() {
    setCart([]); setCustomerName(''); setCustomerPhone('')
    setDiscount(''); setNotes(''); setPayMethod('cash'); setError('')
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleBill() {
    setError('')
    if (!customerName.trim()) { setError('Customer name is required'); return }
    if (!cart.length)         { setError('Add at least one product'); return }
    setSubmitting(true)
    try {
      const { data } = await ordersAPI.createWalkIn({
        customerName:  customerName.trim(),
        customerPhone: customerPhone.trim(),
        items: cart.map(i => ({ id: i.id, name: i.name, quantity: i.qty, price: i.price, unit: i.unit })),
        paymentMethod: payMethod,
        discount: discAmt,
        notes: notes.trim(),
      })
      setReceipt({ ...data, customerName: customerName.trim(), customerPhone, payMethod, discAmt, snap: [...cart] })
      resetBill()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to place order')
    } finally { setSubmitting(false) }
  }

  // ── Print ─────────────────────────────────────────────────────────────────
  function printReceipt() {
    const r    = receipt
    const snap = r.snap || []
    const sub  = snap.reduce((s, i) => s + i.price * i.qty, 0)
    const win  = window.open('', '_blank', 'width=400,height=680')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Receipt ${r.reference_id}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Courier New',monospace;font-size:13px;padding:20px;width:320px;color:#111}
      .center{text-align:center} .right{text-align:right} .bold{font-weight:700}
      .logo{font-size:18px;font-weight:700;letter-spacing:1px}
      .divider{border:none;border-top:1px dashed #999;margin:10px 0}
      .row{display:flex;justify-content:space-between;margin:3px 0}
      .item-name{font-weight:600} .item-unit{font-size:11px;color:#666}
      .total-row{display:flex;justify-content:space-between;font-size:16px;font-weight:700;margin-top:6px;padding-top:6px;border-top:2px solid #111}
      .footer{margin-top:14px;text-align:center;font-size:11px;color:#666;line-height:1.6}
    </style></head><body>
    <p class="center logo">🌿 Raksha Farms</p>
    <p class="center" style="font-size:11px;color:#555;margin-top:2px">Fresh · Pure · Organic</p>
    <hr class="divider"/>
    <div class="row"><span>Bill No</span><span class="bold">${r.reference_id}</span></div>
    <div class="row"><span>Date &amp; Time</span><span>${new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:true})}</span></div>
    <div class="row"><span>Customer</span><span class="bold">${r.customerName}</span></div>
    ${r.customerPhone ? `<div class="row"><span>Phone</span><span>${r.customerPhone}</span></div>` : ''}
    <div class="row"><span>Payment</span><span class="bold">${r.payMethod.toUpperCase()}</span></div>
    <hr class="divider"/>
    <div class="row bold"><span>Item</span><span>Qty × Rate</span><span class="right">Amt</span></div>
    <hr class="divider"/>
    ${snap.map(i => `
      <div style="margin:5px 0">
        <div class="item-name">${i.name}</div>
        ${i.unit ? `<div class="item-unit">${i.unit}</div>` : ''}
        <div class="row"><span></span><span>${i.qty} × ${fmtRs(i.price)}</span><span class="right bold">${fmtRs(i.price*i.qty)}</span></div>
      </div>`).join('')}
    <hr class="divider"/>
    <div class="row"><span>Subtotal</span><span>${fmtRs(sub)}</span></div>
    ${r.discAmt > 0 ? `<div class="row"><span>Discount</span><span>− ${fmtRs(r.discAmt)}</span></div>` : ''}
    <div class="total-row"><span>TOTAL</span><span>${fmtRs(r.total)}</span></div>
    <div class="footer">
      Thank you for shopping!<br/>
      Visit us again 🙏<br/>
      rakshafarms.in
    </div>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AdminLayout title="Billing / POS">

      {/* Receipt modal */}
      {receipt && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#1B4332] to-[#2d6a4f] px-6 py-5 text-white">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={22}/>
                  <span className="text-lg font-bold">Bill Created!</span>
                </div>
                <button onClick={() => setReceipt(null)} className="p-1 rounded-lg hover:bg-white/20">
                  <X size={18}/>
                </button>
              </div>
              <p className="text-green-200 text-sm font-mono">{receipt.reference_id}</p>
            </div>

            {/* Details */}
            <div className="p-6 space-y-2.5 text-sm">
              {[
                ['Customer', receipt.customerName],
                receipt.customerPhone && ['Phone', receipt.customerPhone],
                ['Payment', receipt.payMethod.toUpperCase()],
                ['Items', `${receipt.snap?.length} product${receipt.snap?.length !== 1 ? 's' : ''}`],
              ].filter(Boolean).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-semibold text-gray-800">{v}</span>
                </div>
              ))}
              {receipt.discAmt > 0 && (
                <div className="flex justify-between text-red-500">
                  <span>Discount</span><span>− {fmtRs(receipt.discAmt)}</span>
                </div>
              )}
              <div className="flex justify-between items-center border-t pt-3 mt-1">
                <span className="text-lg font-extrabold text-gray-800">Total</span>
                <span className="text-2xl font-black text-[#1B4332]">{fmtRs(receipt.total)}</span>
              </div>
            </div>

            {/* Itemised preview */}
            <div className="px-6 pb-2 max-h-40 overflow-y-auto">
              {receipt.snap?.map(i => (
                <div key={i.id} className="flex justify-between text-xs text-gray-500 py-1 border-b last:border-0">
                  <span>{i.name} × {i.qty}</span>
                  <span>{fmtRs(i.price * i.qty)}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="p-6 pt-4 flex gap-3">
              <button onClick={printReceipt}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#1B4332] text-white rounded-2xl font-bold hover:bg-[#163826] transition">
                <Printer size={17}/> Print Receipt
              </button>
              <button onClick={() => setReceipt(null)}
                className="flex-1 py-3 border-2 border-gray-200 text-gray-700 rounded-2xl font-bold hover:bg-gray-50 transition">
                New Bill
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-4 h-[calc(100vh-130px)]">

        {/* ══ LEFT: Product Catalog ════════════════════════════════════════════ */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-hidden">

          {/* Search bar */}
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search products by name or category…"
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={15}/>
              </button>
            )}
          </div>

          {/* Category tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map(c => (
              <button key={c} onClick={() => setCat(c)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border transition
                  ${cat === c ? 'bg-[#1B4332] text-white border-[#1B4332]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1B4332] hover:text-[#1B4332]'}`}>
                {c}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 border-4 border-[#1B4332] border-t-transparent rounded-full animate-spin"/>
                <p className="text-sm text-gray-400">Loading products…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <ShoppingBag size={40} className="mb-3 opacity-30"/>
                <p className="text-sm">No products found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 gap-3 pr-1">
                {filtered.map(p => {
                  const price     = p.offer_price && Number(p.offer_price) > 0 ? Number(p.offer_price) : Number(p.price)
                  const hasOffer  = p.offer_price && Number(p.offer_price) > 0 && Number(p.offer_price) < Number(p.price)
                  const stock     = Number(p.stock)
                  const outOfStock = stock <= 0
                  const inCart    = cart.find(i => i.id === p.id)
                  return (
                    <div key={p.id}
                      onClick={() => !outOfStock && addToCart(p)}
                      className={`relative bg-white rounded-2xl border-2 overflow-hidden transition-all duration-150 select-none
                        ${outOfStock ? 'opacity-50 cursor-not-allowed border-gray-100' :
                          inCart ? 'border-[#1B4332] shadow-lg cursor-pointer ring-1 ring-[#1B4332]/20' :
                          'border-gray-100 hover:border-[#1B4332] hover:shadow-md cursor-pointer'}`}
                    >
                      {/* Cart badge */}
                      {inCart && (
                        <div className="absolute top-2 right-2 z-10 w-6 h-6 bg-[#1B4332] rounded-full text-white text-xs font-black flex items-center justify-center shadow">
                          {inCart.qty}
                        </div>
                      )}

                      {/* Image */}
                      <div className="aspect-square bg-gray-50 overflow-hidden">
                        {imgSrc(p.image_url) ? (
                          <img src={imgSrc(p.image_url)} alt={p.name}
                            className="w-full h-full object-cover"
                            onError={e => { e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-3xl">🌿</div>' }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-3xl">🌿</div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-2.5">
                        <p className="text-xs font-bold text-gray-800 leading-tight line-clamp-2 mb-1">{p.name}</p>
                        {p.unit && <p className="text-[10px] text-gray-400 mb-1.5">{p.unit}</p>}
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-black text-[#1B4332]">{fmtRs(price)}</span>
                            {hasOffer && <span className="text-[10px] text-gray-400 line-through ml-1">{fmtRs(p.price)}</span>}
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                            outOfStock  ? 'bg-red-100 text-red-600' :
                            stock <= 5  ? 'bg-orange-100 text-orange-600' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {outOfStock ? 'Out' : `${stock}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ══ RIGHT: Bill Panel — scrollable column ═══════════════════════════ */}
        <div className="w-[440px] flex-shrink-0 overflow-y-auto flex flex-col gap-3 pb-3 pr-0.5">

          {/* ── Customer ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3 flex-shrink-0">
            <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
              <User size={15} className="text-[#1B4332]"/> Customer Details
            </h3>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)}
              placeholder="Customer name *"
              className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
            <div className="relative">
              <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                placeholder="Phone number (optional)" type="tel"
                className="w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"/>
            </div>
            <div className="relative">
              <StickyNote size={14} className="absolute left-3 top-3.5 text-gray-400"/>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Notes (optional)" rows={2}
                className="w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332] resize-none"/>
            </div>
          </div>

          {/* ── Cart ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                <ShoppingBag size={17} className="text-[#1B4332]"/>
                Cart
                {cartCount > 0 && (
                  <span className="ml-1 bg-[#1B4332] text-white text-xs font-black px-2.5 py-0.5 rounded-full">{cartCount}</span>
                )}
              </h3>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-600 font-semibold">Clear all</button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-300 gap-2">
                <ShoppingBag size={40}/>
                <p className="text-sm">Tap a product to add</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-3 flex gap-3">
                    {/* Product image — bigger thumbnail */}
                    <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                      {item.image
                        ? <img src={item.image} alt={item.name}
                            className="w-full h-full object-cover"
                            onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}
                          />
                        : null}
                      <div className={`w-full h-full items-center justify-center text-2xl ${item.image ? 'hidden' : 'flex'}`}>🌿</div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 leading-tight mb-0.5">{item.name}</p>
                      {item.unit && <p className="text-xs text-gray-400 mb-2">{item.unit}</p>}

                      {/* Price row */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400 font-medium">₹</span>
                        <input type="number" value={item.price}
                          onChange={e => setItemPrice(item.id, e.target.value)}
                          className="w-20 text-sm font-semibold border border-gray-200 bg-white rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
                          min={0} step={0.5}/>
                        <span className="text-xs text-gray-500 font-bold">= {fmtRs(item.price * item.qty)}</span>
                      </div>
                    </div>

                    {/* Qty controls + remove */}
                    <div className="flex flex-col items-end justify-between">
                      <button onClick={() => removeItem(item.id)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors">
                        <X size={13}/>
                      </button>
                      <div className="flex items-center gap-1.5 mt-2">
                        <button onClick={() => changeQty(item.id, -1)}
                          className="w-7 h-7 rounded-lg bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors">
                          <Minus size={11}/>
                        </button>
                        <input type="number" value={item.qty}
                          onChange={e => setItemQty(item.id, e.target.value)}
                          className="w-9 text-center text-sm font-bold border border-gray-200 bg-white rounded-lg py-0.5 focus:outline-none focus:ring-1 focus:ring-[#1B4332]"
                          min={1} max={item.stock}/>
                        <button onClick={() => changeQty(item.id, 1)}
                          className="w-7 h-7 rounded-lg bg-[#1B4332] hover:bg-[#163826] text-white flex items-center justify-center transition-colors">
                          <Plus size={11}/>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Payment + Totals + Bill button ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4 flex-shrink-0">

            {/* Payment method */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Payment Method</p>
              <div className="grid grid-cols-4 gap-2">
                {PAY.map(m => (
                  <button key={m.value} onClick={() => setPayMethod(m.value)}
                    className={`py-3 rounded-xl text-xs font-bold border-2 transition flex flex-col items-center gap-1
                      ${payMethod === m.value
                        ? 'bg-[#1B4332] text-white border-[#1B4332] shadow-md'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-[#1B4332] hover:text-[#1B4332]'}`}>
                    <span className="text-base">{m.emoji}</span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Discount */}
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <Tag size={15} className="text-amber-600 flex-shrink-0"/>
              <input type="number" value={discount} onChange={e => setDiscount(e.target.value)}
                placeholder="Discount (₹)" min={0}
                className="flex-1 bg-transparent text-sm focus:outline-none text-amber-800 placeholder-amber-400 font-semibold"/>
              {discAmt > 0 && <span className="text-sm font-bold text-amber-700">−{fmtRs(discAmt)}</span>}
            </div>

            {/* Totals */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>{cart.reduce((s,i)=>s+i.qty,0)} item{cart.reduce((s,i)=>s+i.qty,0)!==1?'s':''}</span>
                <span className="font-medium">{fmtRs(subtotal)}</span>
              </div>
              {discAmt > 0 && (
                <div className="flex justify-between text-red-500 font-semibold">
                  <span>Discount</span><span>− {fmtRs(discAmt)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-2xl text-[#1B4332] border-t-2 border-dashed pt-2 mt-1">
                <span>Total</span><span>{fmtRs(total)}</span>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2.5 rounded-xl">{error}</p>
            )}

            <button onClick={handleBill}
              disabled={submitting || !cart.length || !customerName.trim()}
              className="w-full py-4 bg-gradient-to-r from-[#1B4332] to-[#2d6a4f] text-white rounded-2xl font-black text-lg shadow-lg hover:shadow-xl hover:from-[#163826] hover:to-[#256041] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {submitting ? (
                <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/> Processing…</>
              ) : (
                <><Printer size={20}/> Bill &amp; Print {total > 0 ? fmtRs(total) : ''}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
