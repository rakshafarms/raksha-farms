'use client'
import { useState, useEffect, useRef } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { productsAPI, ordersAPI, customersAPI, API_BASE_URL } from '../../lib/api'
import {
  Search, Plus, Minus, Trash2, Printer, ShoppingBag,
  User, Phone, IndianRupee, Tag, CheckCircle2, X,
  StickyNote, Zap, UserCheck, MapPin
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

// Parse variants from a product (JSONB may come as string or array)
function parseVariants(p) {
  try {
    const v = Array.isArray(p.variants) ? p.variants
      : typeof p.variants === 'string' ? JSON.parse(p.variants || '[]') : []
    return v.filter(x => x && x.label && Number(x.price) > 0)
  } catch { return [] }
}

export default function BillingPage() {
  const [products,   setProducts]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [cat,        setCat]        = useState('All')
  const [categories, setCategories] = useState(['All'])

  // Variant picker: { product, variants[] } or null
  const [variantPicker, setVariantPicker] = useState(null)

  const [cart,          setCart]          = useState([])
  const [customerName,  setCustomerName]  = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [payMethod,     setPayMethod]     = useState('cash')
  const [discount,      setDiscount]      = useState('')
  const [notes,         setNotes]         = useState('')
  const [deliveryAddr,  setDeliveryAddr]  = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [error,         setError]         = useState('')
  const [receipt,       setReceipt]       = useState(null)

  // ── Customer lookup (autocomplete) ─────────────────────────────────────────
  // As admin types in the phone OR name field, hit /customers/search and show
  // a dropdown of matching customers (both registered users and guests).
  // Clicking a result autofills name + phone — no more retyping for repeat
  // customers.
  const [lookupResults, setLookupResults] = useState([])
  const [lookupOpen,    setLookupOpen]    = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  // Which input has focus — controls which field's value drives the search
  const [lookupField,   setLookupField]   = useState(null) // 'name' | 'phone' | null
  // Tracks whether the user just picked a result, to suppress the next search
  // (otherwise filling the field would re-trigger a search for the picked text).
  const justPickedRef = useRef(false)

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
  // cartKey = "productId|variantLabel" (or just "productId" for no-variant items)
  function addToCartDirect(p, variant = null) {
    if (Number(p.stock) <= 0) return
    const price = variant
      ? Number(variant.price)
      : (p.offer_price && Number(p.offer_price) > 0 ? Number(p.offer_price) : Number(p.price))
    const unit  = variant ? variant.label : (p.unit || '')
    const cartKey = variant ? `${p.id}|${variant.label}` : p.id
    setCart(prev => {
      const ex = prev.find(i => i.cartKey === cartKey)
      if (ex) {
        if (ex.qty >= Number(p.stock)) return prev
        return prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, { cartKey, id: p.id, name: p.name, unit, price, qty: 1, stock: Number(p.stock), image: imgSrc(p.image_url) }]
    })
  }

  function handleProductClick(p) {
    if (Number(p.stock) <= 0) return
    // Always open the picker — shows pre-configured variants + custom amount row
    setVariantPicker({ product: p, variants: parseVariants(p) })
  }

  const changeQty    = (key, d) => setCart(prev =>
    prev.map(i => i.cartKey === key ? { ...i, qty: Math.max(1, Math.min(i.qty + d, i.stock)) } : i)
  )
  const setItemQty   = (key, v) => setCart(prev =>
    prev.map(i => i.cartKey === key ? { ...i, qty: Math.max(1, Math.min(parseInt(v) || 1, i.stock)) } : i)
  )
  const setItemPrice = (key, v) => setCart(prev =>
    prev.map(i => i.cartKey === key ? { ...i, price: Math.max(0, parseFloat(v) || 0) } : i)
  )
  const removeItem = (key) => setCart(prev => prev.filter(i => i.cartKey !== key))

  function resetBill() {
    setCart([]); setCustomerName(''); setCustomerPhone('')
    setDiscount(''); setNotes(''); setDeliveryAddr(''); setPayMethod('cash'); setError('')
    setLookupResults([]); setLookupOpen(false); setLookupField(null)
    setVariantPicker(null)
  }

  // Debounced customer search — fires 250ms after the admin stops typing in
  // either the name or phone field. Uses whichever field is focused as the
  // query so the dropdown shows the most relevant results.
  useEffect(() => {
    if (justPickedRef.current) { justPickedRef.current = false; return }
    const q = (lookupField === 'phone' ? customerPhone : customerName).trim()
    if (q.length < 2) { setLookupResults([]); setLookupOpen(false); return }
    setLookupLoading(true)
    const t = setTimeout(async () => {
      try {
        const { data } = await customersAPI.search(q, 8)
        setLookupResults(Array.isArray(data) ? data : [])
        setLookupOpen(true)
      } catch { /* silent — search failure shouldn't block billing */ }
      finally { setLookupLoading(false) }
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerName, customerPhone, lookupField])

  function pickCustomer(c) {
    justPickedRef.current = true
    setCustomerName(c.name || '')
    setCustomerPhone(c.phone || '')
    setLookupResults([])
    setLookupOpen(false)
    setLookupField(null)
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
        address: deliveryAddr.trim() ? { address: deliveryAddr.trim() } : undefined,
      })
      setReceipt({ ...data, customerName: customerName.trim(), customerPhone, payMethod, discAmt, deliveryAddr: deliveryAddr.trim(), snap: [...cart] })
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
    // Use absolute URL so the logo loads correctly in the print popup window
    const logoUrl = `${window.location.origin}/images/raksha-farms-logo.png`
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
    <div class="center" style="margin-bottom:6px">
      <img src="${logoUrl}" alt="Raksha Farms" style="width:150px;height:auto;display:block;margin:0 auto"
        onerror="this.style.display='none';document.getElementById('logo-fallback').style.display='block'"/>
      <p id="logo-fallback" class="logo" style="display:none">🌿 Raksha Farms</p>
    </div>
    <p class="center" style="font-size:11px;color:#555;margin-top:2px">Fresh · Pure · Organic</p>
    <hr class="divider"/>
    <div class="row"><span>Bill No</span><span class="bold">${r.reference_id}</span></div>
    <div class="row"><span>Date &amp; Time</span><span>${new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:true})}</span></div>
    <div class="row"><span>Customer</span><span class="bold">${r.customerName}</span></div>
    ${r.customerPhone ? `<div class="row"><span>Phone</span><span>${r.customerPhone}</span></div>` : ''}
    ${r.deliveryAddr ? `<div style="display:flex;justify-content:space-between;margin:3px 0;align-items:flex-start"><span>Address</span><span style="text-align:right;max-width:180px;font-size:11px;line-height:1.4">${r.deliveryAddr}</span></div>` : ''}
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
      www.rakshafarms.com
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
                receipt.deliveryAddr && ['Address', receipt.deliveryAddr],
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

      {variantPicker && (
        <VariantPicker
          product={variantPicker.product}
          variants={variantPicker.variants}
          cart={cart}
          onClose={() => setVariantPicker(null)}
          onAdd={(label, price) => {
            addToCartDirect(variantPicker.product, { label, price })
            setVariantPicker(null)
          }}
        />
      )}

      <div className="flex gap-4 h-[calc(100vh-130px)] overflow-hidden">

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
              <div className="grid grid-cols-3 gap-2 pr-1">
                {filtered.map(p => {
                  const price      = p.offer_price && Number(p.offer_price) > 0 ? Number(p.offer_price) : Number(p.price)
                  const hasOffer   = p.offer_price && Number(p.offer_price) > 0 && Number(p.offer_price) < Number(p.price)
                  const stock      = Number(p.stock)
                  const outOfStock = stock <= 0
                  const inCart     = cart.filter(i => i.id === p.id)
                  const inCartQty  = inCart.reduce((s, i) => s + i.qty, 0)
                  return (
                    <div key={p.id}
                      onClick={() => !outOfStock && handleProductClick(p)}
                      className={`relative bg-white rounded-xl border-2 overflow-hidden transition-all duration-150 select-none
                        ${outOfStock ? 'opacity-50 cursor-not-allowed border-gray-100' :
                          inCartQty > 0 ? 'border-[#1B4332] shadow-md cursor-pointer ring-1 ring-[#1B4332]/20' :
                          'border-gray-100 hover:border-[#1B4332] hover:shadow-sm cursor-pointer'}`}
                    >
                      {/* Cart badge */}
                      {inCartQty > 0 && (
                        <div className="absolute top-1.5 right-1.5 z-10 w-5 h-5 bg-[#1B4332] rounded-full text-white text-[10px] font-black flex items-center justify-center shadow">
                          {inCartQty}
                        </div>
                      )}

                      {/* Image */}
                      <div className="h-28 bg-gray-50 overflow-hidden">
                        {imgSrc(p.image_url) ? (
                          <img src={imgSrc(p.image_url)} alt={p.name}
                            className="w-full h-full object-cover"
                            onError={e => { e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-2xl">🌿</div>' }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">🌿</div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-1.5">
                        <p className="text-[11px] font-bold text-gray-800 leading-tight line-clamp-1 mb-0.5">{p.name}</p>
                        <div className="flex items-center justify-between gap-1">
                          <div className="min-w-0">
                            <span className="text-xs font-black text-[#1B4332]">{fmtRs(price)}</span>
                            {hasOffer && <span className="text-[9px] text-gray-400 line-through ml-0.5">{fmtRs(p.price)}</span>}
                          </div>
                          <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full flex-shrink-0 ${
                            outOfStock ? 'bg-red-100 text-red-600' :
                            stock <= 5 ? 'bg-orange-100 text-orange-600' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {outOfStock ? 'Out' : stock}
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

        {/* ══ RIGHT: Bill Panel — vertically scrollable ═══════════════════════ */}
        <div className="w-[440px] flex-shrink-0 h-full overflow-y-auto flex flex-col gap-3 pb-3 pr-1"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#1B4332 transparent' }}>

          {/* ── Customer ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3 flex-shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                <User size={15} className="text-[#1B4332]"/> Customer Details
              </h3>
              <span className="text-[10px] text-gray-400 italic">Type to search existing</span>
            </div>

            {/* Name field — also triggers customer autocomplete */}
            <div className="relative">
              <input
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                onFocus={() => setLookupField('name')}
                // Delay closing so a click on a dropdown row registers first
                onBlur={() => setTimeout(() => setLookupOpen(false), 200)}
                placeholder="Customer name *"
                className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
              />
              {lookupField === 'name' && lookupOpen && (
                <CustomerDropdown results={lookupResults} loading={lookupLoading} onPick={pickCustomer} />
              )}
            </div>

            {/* Phone field — also triggers customer autocomplete */}
            <div className="relative">
              <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                onFocus={() => setLookupField('phone')}
                onBlur={() => setTimeout(() => setLookupOpen(false), 200)}
                placeholder="Phone number (optional)"
                type="tel"
                className="w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
              />
              {lookupField === 'phone' && lookupOpen && (
                <CustomerDropdown results={lookupResults} loading={lookupLoading} onPick={pickCustomer} />
              )}
            </div>

            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-3.5 text-gray-400"/>
              <textarea value={deliveryAddr} onChange={e => setDeliveryAddr(e.target.value)}
                placeholder="Delivery address (for bill — delivery boy reference)" rows={2}
                className="w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332] resize-none"/>
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
                  <div key={item.cartKey} className="bg-gray-50 border border-gray-100 rounded-2xl p-3 flex gap-3">
                    {/* Product image */}
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
                      {item.unit && (
                        <span className="inline-block text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full mb-1.5">{item.unit}</span>
                      )}

                      {/* Price row */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400 font-medium">₹</span>
                        <input type="number" value={item.price}
                          onChange={e => setItemPrice(item.cartKey, e.target.value)}
                          className="w-20 text-sm font-semibold border border-gray-200 bg-white rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
                          min={0} step={0.5}/>
                        <span className="text-xs text-gray-500 font-bold">= {fmtRs(item.price * item.qty)}</span>
                      </div>
                    </div>

                    {/* Qty controls + remove */}
                    <div className="flex flex-col items-end justify-between">
                      <button onClick={() => removeItem(item.cartKey)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors">
                        <X size={13}/>
                      </button>
                      <div className="flex items-center gap-1.5 mt-2">
                        <button onClick={() => changeQty(item.cartKey, -1)}
                          className="w-7 h-7 rounded-lg bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors">
                          <Minus size={11}/>
                        </button>
                        <input type="number" value={item.qty}
                          onChange={e => setItemQty(item.cartKey, e.target.value)}
                          className="w-9 text-center text-sm font-bold border border-gray-200 bg-white rounded-lg py-0.5 focus:outline-none focus:ring-1 focus:ring-[#1B4332]"
                          min={1} max={item.stock}/>
                        <button onClick={() => changeQty(item.cartKey, 1)}
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

// ─────────────────────────────────────────────────────────────────────────────
// CustomerDropdown
// Shown beneath the name / phone inputs while the admin is searching for an
// existing customer. Clicking a row autofills both fields via onPick.
// Uses onMouseDown (not onClick) so the click registers BEFORE the input's
// onBlur fires and closes the dropdown.
// ─────────────────────────────────────────────────────────────────────────────
// ── Variant / quantity picker sheet ──────────────────────────────────────────
// Opens for every product. Shows pre-configured variants (quick-tap) at the top
// plus a custom amount row (unit chips + free price entry) so admin can sell
// any weight/volume even if no variants are configured on the product.
const UNIT_CHIPS = ['100g','250g','500g','1kg','2kg','200mL','500mL','1L','pcs']

// Parse a unit string into a normalized measure so the chosen size can be
// scaled against the product's actual base unit. Weight → grams, volume → mL.
// Handles bare units ("kg", "litre") and quantified units ("250g", "1kg",
// "500mL", "2L"). Returns null for non-scalable units (pcs, dozen, bunch…).
function parseMeasure(str) {
  // Strip any parenthetical note e.g. "1kg (4-6 pcs)" → "1kg"
  const s = String(str || '').split('(')[0].trim().toLowerCase()
  if (!s) return null
  const m = s.match(/^(\d*\.?\d*)\s*(kg|kgs|kilogram|kilograms|g|gm|gms|gram|grams|ml|millilitre|millilitres|milliliter|milliliters|l|lt|ltr|litre|litres|liter|liters)$/i)
  if (!m) return null
  const qty = m[1] === '' ? 1 : parseFloat(m[1])
  if (isNaN(qty) || qty <= 0) return null
  const unit = m[2]
  const WEIGHT = { kg:1000, kgs:1000, kilogram:1000, kilograms:1000, g:1, gm:1, gms:1, gram:1, grams:1 }
  const VOLUME = { ml:1, millilitre:1, millilitres:1, milliliter:1, milliliters:1, l:1000, lt:1000, ltr:1000, litre:1000, litres:1000, liter:1000, liters:1000 }
  if (unit in WEIGHT) return { kind: 'weight', amount: qty * WEIGHT[unit] }
  if (unit in VOLUME) return { kind: 'volume', amount: qty * VOLUME[unit] }
  return null
}

// Price ratio of a chosen unit relative to the product's base unit — only
// when both are the same measurable kind. e.g. base "250g" + chosen "500g"
// → 2.0; base "kg" + chosen "250g" → 0.25. null = can't auto-scale.
function priceRatio(baseUnit, chosenUnit) {
  const base   = parseMeasure(baseUnit)
  const chosen = parseMeasure(chosenUnit)
  if (!base || !chosen || base.kind !== chosen.kind || base.amount <= 0) return null
  return chosen.amount / base.amount
}

function VariantPicker({ product, variants, cart, onClose, onAdd }) {
  const basePrice = product.offer_price && Number(product.offer_price) > 0
    ? Number(product.offer_price) : Number(product.price)

  const [customUnit,  setCustomUnit]  = useState(product.unit || '250g')
  const [customPrice, setCustomPrice] = useState(String(basePrice))

  // Recalculate price proportionally whenever the chosen unit changes,
  // scaled against the product's REAL base unit — so 500g of a ₹80/250g
  // item becomes ₹160, and 250g of a ₹40/kg item becomes ₹10. Admin can
  // still edit the price field manually afterwards (negotiated rates).
  useEffect(() => {
    const ratio = priceRatio(product.unit, customUnit)
    if (ratio === null) return
    setCustomPrice(String(Math.round(basePrice * ratio * 100) / 100))
  }, [customUnit, basePrice, product.unit])

  return (
    <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-bold text-gray-900">{product.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">Choose quantity to add to bill</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-xl"><X size={16}/></button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Pre-configured variants */}
          {variants.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Quick select</p>
              <div className="grid grid-cols-2 gap-2">
                {variants.map(v => {
                  const inCartQty = cart.find(i => i.cartKey === `${product.id}|${v.label}`)?.qty || 0
                  return (
                    <button key={v.label}
                      onClick={() => onAdd(v.label, Number(v.price))}
                      className="relative flex flex-col items-start p-3 rounded-xl border-2 border-gray-100 hover:border-[#1B4332] hover:bg-emerald-50 transition-all text-left">
                      {inCartQty > 0 && (
                        <span className="absolute top-2 right-2 w-5 h-5 bg-[#1B4332] text-white text-[10px] font-black rounded-full flex items-center justify-center">{inCartQty}</span>
                      )}
                      <span className="text-sm font-bold text-gray-800">{v.label}</span>
                      <span className="text-base font-black text-[#1B4332]">{fmtRs(v.price)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Custom amount */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
              {variants.length > 0 ? 'Or custom amount' : 'Select quantity'}
            </p>

            {/* Unit chips */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {UNIT_CHIPS.map(u => (
                <button key={u} onClick={() => setCustomUnit(u)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all
                    ${customUnit === u
                      ? 'bg-[#1B4332] text-white border-[#1B4332]'
                      : 'border-gray-200 text-gray-600 hover:border-[#1B4332]'}`}>
                  {u}
                </button>
              ))}
              {/* Free-type field for custom unit like "300g" or "750mL" */}
              <input
                value={UNIT_CHIPS.includes(customUnit) ? '' : customUnit}
                onChange={e => setCustomUnit(e.target.value)}
                placeholder="other…"
                className={`w-20 px-2 py-1.5 rounded-lg text-xs border-2 focus:outline-none transition-all
                  ${!UNIT_CHIPS.includes(customUnit)
                    ? 'border-[#1B4332] text-[#1B4332] font-bold'
                    : 'border-gray-200 text-gray-400'}`}
              />
            </div>

            {/* Price row */}
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
              <span className="text-sm text-gray-500 font-medium">Price ₹</span>
              <input
                type="number" value={customPrice}
                onChange={e => setCustomPrice(e.target.value)}
                className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
                min={0} step={0.5}
              />
              <span className="text-xs text-gray-400">per {customUnit || 'unit'}</span>
            </div>
          </div>
        </div>

        {/* Add button */}
        <div className="px-4 pb-5 pt-2">
          <button
            onClick={() => {
              const p = parseFloat(customPrice) || 0
              if (!customUnit.trim() || p <= 0) return
              onAdd(customUnit.trim(), p)
            }}
            disabled={!customUnit.trim() || !(parseFloat(customPrice) > 0)}
            className="w-full py-3.5 bg-[#1B4332] hover:bg-[#163826] disabled:opacity-40 text-white rounded-2xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
            <Plus size={16}/>
            Add {customUnit || 'unit'} — {fmtRs(parseFloat(customPrice) || 0)}
          </button>
        </div>
      </div>
    </div>
  )
}

function CustomerDropdown({ results, loading, onPick }) {
  return (
    <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
      {loading && results.length === 0 && (
        <div className="px-3 py-2.5 text-xs text-gray-400 flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin"/>
          Searching customers…
        </div>
      )}
      {!loading && results.length === 0 && (
        <div className="px-3 py-2.5 text-xs text-gray-400">
          No matching customer — fill in the details to bill as a new one.
        </div>
      )}
      {results.length > 0 && (
        <ul className="max-h-60 overflow-y-auto divide-y divide-gray-50">
          {results.map((c, i) => (
            <li key={`${c.source}-${c.id || c.phone || i}`}>
              <button
                type="button"
                onMouseDown={() => onPick(c)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-50 text-left transition-colors"
              >
                <div className="w-8 h-8 bg-[#1B4332] rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold">
                    {(c.name || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-gray-800 truncate">{c.name || 'Guest'}</p>
                    {c.source === 'guest' && (
                      <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase">Guest</span>
                    )}
                    {c.source === 'user' && (
                      <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase">Member</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {c.phone || c.email || 'no contact info'}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
