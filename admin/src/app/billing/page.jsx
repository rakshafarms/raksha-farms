'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { productsAPI, ordersAPI } from '../../lib/api'
import {
  Search, Plus, Minus, Trash2, Printer, ShoppingBag,
  User, Phone, IndianRupee, Tag, CheckCircle2, X, ChevronDown
} from 'lucide-react'

const PAY_METHODS = [
  { value: 'cash',  label: '💵 Cash' },
  { value: 'upi',   label: '📱 UPI' },
  { value: 'card',  label: '💳 Card' },
  { value: 'credit',label: '📒 Credit' },
]

const fmt = (n) => Number(n || 0).toLocaleString('en-IN')
const fmtRs = (n) => `₹${fmt(n)}`

export default function BillingPage() {
  // Products catalog
  const [products, setProducts] = useState([])
  const [search, setSearch]     = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [categories, setCategories] = useState(['All'])

  // Cart
  const [cart, setCart] = useState([])

  // Customer
  const [customerName,  setCustomerName]  = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [payMethod, setPayMethod]         = useState('cash')
  const [discount, setDiscount]           = useState('')
  const [notes, setNotes]                 = useState('')

  // UI
  const [loading,  setLoading]   = useState(false)
  const [error,    setError]     = useState('')
  const [receipt,  setReceipt]   = useState(null)  // completed order for receipt
  const receiptRef = useRef(null)

  // Load all active products once
  useEffect(() => {
    productsAPI.getAllAdmin({ limit: 500, page: 1 })
      .then(({ data }) => {
        const prods = (data.products || []).filter(p => p.status === 'active')
        setProducts(prods)
        const cats = ['All', ...new Set(prods.map(p => p.category).filter(Boolean))]
        setCategories(cats)
      })
      .catch(() => {})
  }, [])

  // Derived
  const filtered = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const matchCat    = catFilter === 'All' || p.category === catFilter
    return matchSearch && matchCat
  })

  const subtotal      = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const discountAmt   = Math.min(Math.max(0, Number(discount) || 0), subtotal)
  const total         = Math.max(0, subtotal - discountAmt)

  // ── Cart helpers ──────────────────────────────────────────────────────────
  function addToCart(product) {
    setCart(prev => {
      const ex = prev.find(i => i.id === product.id)
      if (ex) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      const price = product.offer_price && Number(product.offer_price) > 0
        ? Number(product.offer_price) : Number(product.price)
      return [...prev, { id: product.id, name: product.name, unit: product.unit, price, qty: 1, stock: product.stock }]
    })
  }

  function changeQty(id, delta) {
    setCart(prev => prev
      .map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
      .filter(i => i.qty > 0)
    )
  }

  function setQty(id, val) {
    const n = Math.max(1, parseInt(val) || 1)
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty: n } : i))
  }

  function setPrice(id, val) {
    const n = Math.max(0, parseFloat(val) || 0)
    setCart(prev => prev.map(i => i.id === id ? { ...i, price: n } : i))
  }

  function removeFromCart(id) {
    setCart(prev => prev.filter(i => i.id !== id))
  }

  function clearAll() {
    setCart([])
    setCustomerName('')
    setCustomerPhone('')
    setDiscount('')
    setNotes('')
    setPayMethod('cash')
    setError('')
  }

  // ── Place order ───────────────────────────────────────────────────────────
  async function handleBill() {
    setError('')
    if (!customerName.trim()) { setError('Enter customer name'); return }
    if (cart.length === 0)    { setError('Add at least one item'); return }

    setLoading(true)
    try {
      const { data } = await ordersAPI.createWalkIn({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        items: cart.map(i => ({ id: i.id, name: i.name, quantity: i.qty, price: i.price, unit: i.unit })),
        paymentMethod: payMethod,
        discount: discountAmt,
        notes: notes.trim(),
      })
      setReceipt({ ...data, customerName: customerName.trim(), customerPhone, payMethod, discountAmt, cartSnapshot: [...cart] })
      clearAll()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create order')
    } finally {
      setLoading(false)
    }
  }

  // ── Print receipt ─────────────────────────────────────────────────────────
  function printReceipt() {
    const win = window.open('', '_blank', 'width=380,height=600')
    if (!win) return
    const r = receipt
    const items = r.cartSnapshot || []
    const sub   = items.reduce((s, i) => s + i.price * i.qty, 0)
    win.document.write(`
      <html><head><title>Receipt</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 13px; margin: 0; padding: 16px; width: 320px; }
        h2   { text-align: center; margin: 0 0 4px; font-size: 16px; }
        .center { text-align: center; }
        .small  { font-size: 11px; color: #555; }
        hr   { border: none; border-top: 1px dashed #aaa; margin: 8px 0; }
        table{ width: 100%; border-collapse: collapse; }
        td   { padding: 2px 0; vertical-align: top; }
        .r   { text-align: right; }
        .total { font-weight: bold; font-size: 15px; }
        @media print { body { margin: 0; } }
      </style></head>
      <body>
        <h2>🌿 Raksha Farms</h2>
        <p class="center small">Fresh from farm to your table</p>
        <hr/>
        <p class="small"><b>Bill No:</b> ${r.reference_id}</p>
        <p class="small"><b>Date:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
        <p class="small"><b>Customer:</b> ${r.customerName}${r.customerPhone ? ` | ${r.customerPhone}` : ''}</p>
        <p class="small"><b>Payment:</b> ${r.payMethod?.toUpperCase()}</p>
        <hr/>
        <table>
          <tr><td><b>Item</b></td><td class="r"><b>Qty</b></td><td class="r"><b>Price</b></td><td class="r"><b>Amt</b></td></tr>
          <tr><td colspan="4"><hr/></td></tr>
          ${items.map(i => `
            <tr>
              <td>${i.name}${i.unit ? `<br/><span style="font-size:10px">${i.unit}</span>` : ''}</td>
              <td class="r">${i.qty}</td>
              <td class="r">${fmtRs(i.price)}</td>
              <td class="r">${fmtRs(i.price * i.qty)}</td>
            </tr>`).join('')}
          <tr><td colspan="4"><hr/></td></tr>
          <tr><td colspan="3">Subtotal</td><td class="r">${fmtRs(sub)}</td></tr>
          ${r.discountAmt > 0 ? `<tr><td colspan="3">Discount</td><td class="r">- ${fmtRs(r.discountAmt)}</td></tr>` : ''}
          <tr class="total"><td colspan="3">TOTAL</td><td class="r">${fmtRs(r.total)}</td></tr>
        </table>
        <hr/>
        <p class="center small">Thank you for shopping!<br/>Visit us again 🙏</p>
      </body></html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AdminLayout title="Billing / POS">

      {/* ── Receipt modal ──────────────────────────────────────────────────── */}
      {receipt && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-[#1B4332] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <CheckCircle2 size={20}/>
                <span className="font-bold">Order Created!</span>
              </div>
              <button onClick={() => setReceipt(null)} className="text-white/70 hover:text-white">
                <X size={18}/>
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between text-gray-500"><span>Bill No</span><span className="font-mono font-bold text-gray-800">{receipt.reference_id}</span></div>
              <div className="flex justify-between text-gray-500"><span>Customer</span><span className="font-semibold text-gray-800">{receipt.customerName}</span></div>
              {receipt.customerPhone && <div className="flex justify-between text-gray-500"><span>Phone</span><span className="font-semibold text-gray-800">{receipt.customerPhone}</span></div>}
              <div className="flex justify-between text-gray-500"><span>Payment</span><span className="font-semibold text-gray-800 uppercase">{receipt.payMethod}</span></div>
              <div className="flex justify-between text-gray-500"><span>Items</span><span className="font-semibold text-gray-800">{receipt.cartSnapshot?.length}</span></div>
              {receipt.discountAmt > 0 && <div className="flex justify-between text-red-500"><span>Discount</span><span>- {fmtRs(receipt.discountAmt)}</span></div>}
              <div className="flex justify-between border-t pt-3 text-lg font-extrabold text-[#1B4332]">
                <span>Total</span><span>{fmtRs(receipt.total)}</span>
              </div>
            </div>
            <div className="border-t px-6 pb-6 flex gap-3">
              <button onClick={printReceipt}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#1B4332] text-white rounded-xl font-semibold hover:bg-[#163826] transition">
                <Printer size={16}/> Print Receipt
              </button>
              <button onClick={() => setReceipt(null)}
                className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 transition">
                New Bill
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-4 h-full">

        {/* ── LEFT: Product catalog ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Search + filter */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search products…"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
              />
            </div>
            <div className="relative">
              <select
                value={catFilter}
                onChange={e => setCatFilter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332] bg-white"
              >
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
            </div>
          </div>

          {/* Product grid */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">No products found</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {filtered.map(p => {
                  const price = p.offer_price && Number(p.offer_price) > 0 ? Number(p.offer_price) : Number(p.price)
                  const inCart = cart.find(i => i.id === p.id)
                  const outOfStock = Number(p.stock) === 0
                  return (
                    <button
                      key={p.id}
                      disabled={outOfStock}
                      onClick={() => addToCart(p)}
                      className={`relative text-left border rounded-xl p-3 transition group
                        ${outOfStock ? 'opacity-40 cursor-not-allowed border-gray-100' : 'hover:border-[#1B4332] hover:shadow-md cursor-pointer border-gray-100'}
                        ${inCart ? 'border-[#1B4332] bg-green-50' : 'bg-white'}
                      `}
                    >
                      {inCart && (
                        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#1B4332] rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                          {inCart.qty}
                        </span>
                      )}
                      {p.image_url && (
                        <img src={p.image_url} alt={p.name}
                          className="w-full aspect-square object-cover rounded-lg mb-2"
                          onError={e => { e.target.style.display = 'none' }}
                        />
                      )}
                      <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">{p.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{p.unit}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-bold text-[#1B4332]">{fmtRs(price)}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          outOfStock ? 'bg-red-100 text-red-600' : Number(p.stock) <= 5 ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-700'
                        }`}>
                          {outOfStock ? 'Out' : `${p.stock} left`}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Bill panel ─────────────────────────────────────────────── */}
        <div className="w-full xl:w-[380px] flex flex-col gap-4">

          {/* Customer info */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <h2 className="font-bold text-gray-800 flex items-center gap-2"><User size={16}/> Customer Info</h2>
            <input
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Customer name *"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
            />
            <input
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              placeholder="Phone number (optional)"
              type="tel"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
            />
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332] resize-none"
            />
          </div>

          {/* Cart */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-1 overflow-y-auto" style={{ maxHeight: '340px' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-gray-800 flex items-center gap-2"><ShoppingBag size={16}/> Cart</h2>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs text-red-500 hover:underline">Clear</button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">Tap a product to add it</div>
            ) : (
              <div className="space-y-2">
                {cart.map(item => (
                  <div key={item.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{item.name}</p>
                      <p className="text-[10px] text-gray-400">{item.unit}</p>
                      {/* Editable price */}
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] text-gray-400">₹</span>
                        <input
                          type="number"
                          value={item.price}
                          onChange={e => setPrice(item.id, e.target.value)}
                          className="w-16 text-xs border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#1B4332]"
                          min={0}
                          step={0.5}
                        />
                        <span className="text-[10px] text-gray-500 ml-1">= {fmtRs(item.price * item.qty)}</span>
                      </div>
                    </div>
                    {/* Qty controls */}
                    <div className="flex items-center gap-1">
                      <button onClick={() => changeQty(item.id, -1)} className="w-6 h-6 rounded-lg bg-gray-200 hover:bg-gray-300 flex items-center justify-center">
                        <Minus size={11}/>
                      </button>
                      <input
                        type="number"
                        value={item.qty}
                        onChange={e => setQty(item.id, e.target.value)}
                        className="w-8 text-center text-xs border border-gray-200 rounded focus:outline-none"
                        min={1}
                      />
                      <button onClick={() => changeQty(item.id, 1)} className="w-6 h-6 rounded-lg bg-[#1B4332] hover:bg-[#163826] text-white flex items-center justify-center">
                        <Plus size={11}/>
                      </button>
                    </div>
                    <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600 mt-0.5">
                      <Trash2 size={13}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment + totals */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            {/* Payment method */}
            <div className="grid grid-cols-4 gap-2">
              {PAY_METHODS.map(m => (
                <button
                  key={m.value}
                  onClick={() => setPayMethod(m.value)}
                  className={`py-2 rounded-xl text-xs font-semibold border transition
                    ${payMethod === m.value ? 'bg-[#1B4332] text-white border-[#1B4332]' : 'border-gray-200 text-gray-600 hover:border-[#1B4332]'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Discount */}
            <div className="flex items-center gap-2">
              <Tag size={14} className="text-gray-400 flex-shrink-0"/>
              <input
                type="number"
                value={discount}
                onChange={e => setDiscount(e.target.value)}
                placeholder="Discount amount (₹)"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
                min={0}
              />
            </div>

            {/* Totals */}
            <div className="space-y-1.5 text-sm border-t pt-3">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal ({cart.reduce((s,i)=>s+i.qty,0)} items)</span>
                <span>{fmtRs(subtotal)}</span>
              </div>
              {discountAmt > 0 && (
                <div className="flex justify-between text-red-500">
                  <span>Discount</span><span>− {fmtRs(discountAmt)}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-lg text-[#1B4332] border-t pt-2">
                <span>Total</span><span>{fmtRs(total)}</span>
              </div>
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <button
              onClick={handleBill}
              disabled={loading || cart.length === 0}
              className="w-full py-3.5 bg-[#1B4332] text-white rounded-xl font-bold text-base hover:bg-[#163826] transition disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <Printer size={18}/>
              {loading ? 'Processing…' : `Bill & Print  ${total > 0 ? fmtRs(total) : ''}`}
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
