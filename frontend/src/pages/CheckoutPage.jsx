import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useOrders } from '../context/OrdersContext'
import { useProducts } from '../context/ProductsContext'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { DELIVERY_SLOTS, OWNER_UPI_ID, calcDelivery, FREE_DELIVERY_THRESHOLD } from '../utils/constants'
import { useAddresses } from '../context/AddressContext'

const STEPS = [
  { id: 1, label: 'Delivery'  },
  { id: 2, label: 'Schedule'  },
  { id: 3, label: 'Payment'   },
]

// Regex constants at module scope to avoid esbuild JSX parsing issues
const PHONE_RE   = /^[6-9]\d{9}$/
const PINCODE_RE = /^\d{6}$/
const DIGIT_RE   = /\D/g

const SUB_MODES = ['Daily', 'Custom', 'On Interval', 'Buy Once']
const DAYS      = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const INTERVALS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 30]

function tomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}
function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function CheckoutPage() {
  const { cart, totalPrice, clearCart, closeDrawer } = useCart()
  const { addOrder }    = useOrders()
  const { decreaseStock } = useProducts()
  const { user }        = useAuth()
  const { addToast }    = useToast()
  const navigate        = useNavigate()
  const { addresses, addAddress, deleteAddress, LABEL_ICONS } = useAddresses()
  const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

  const [step, setStep]   = useState(1)
  // Subscription frequency mode — 'Buy Once' = regular one-time order
  const [subMode, setSubMode]           = useState('Buy Once')
  const [intervalDays, setIntervalDays] = useState(2)
  const [dayQty, setDayQty]             = useState(Object.fromEntries(DAYS.map(d => [d, 1])))
  const [subStartDate, setSubStartDate] = useState(tomorrow())
  const [subQty, setSubQty]             = useState(1)
  const [placing, setPlacing] = useState(false)

  const orderType = subMode === 'Buy Once' ? 'onetime' : 'subscription'

  // Step 1 form — pre-fill from user profile only (address filled from DB addresses below)
  const [form, setForm] = useState({
    name:    user?.name  || '',
    phone:   user?.phone || '',
    address: '',
    city:    '',
    pincode: '',
    notes:   '',
  })
  const [errors, setErrors] = useState({})
  const [prefilled, setPrefilled] = useState(false)

  // Deduplicate saved addresses by address+city+pincode fingerprint
  const uniqueAddresses = addresses.filter((addr, idx, arr) =>
    arr.findIndex(a =>
      (a.address || '').trim().toLowerCase() === (addr.address || '').trim().toLowerCase() &&
      (a.city    || '').trim().toLowerCase() === (addr.city    || '').trim().toLowerCase() &&
      (a.pincode || '').trim()               === (addr.pincode || '').trim()
    ) === idx
  )

  // Selected saved address id (null = entering new address)
  const [selectedAddressId, setSelectedAddressId] = useState(null)

  // Auto-select first saved address on load
  useEffect(() => {
    if (uniqueAddresses.length > 0 && selectedAddressId === null && !prefilled) {
      const first = uniqueAddresses[0]
      setSelectedAddressId(first.id)
      setForm(f => ({
        ...f,
        name:    first.name    || f.name    || '',
        phone:   first.phone   || f.phone   || '',
        address: first.address || '',
        city:    first.city    || '',
        pincode: first.pincode || '',
        notes:   first.notes   || '',
      }))
      setPrefilled(true)
    }
  }, [uniqueAddresses, selectedAddressId, prefilled])

  // Step 2: delivery slot
  const [selectedSlot, setSelectedSlot] = useState('morning')

  // Step 3: payment — 'card' is disabled (coming soon), default to upi
  const [paymentMethod, setPaymentMethod] = useState('upi')

  // Coupon state
  const [couponCode, setCouponCode]             = useState('')
  const [couponApplied, setCouponApplied]       = useState(null)  // { discount, code, coupon }
  const [couponError, setCouponError]           = useState('')
  const [couponLoading, setCouponLoading]       = useState(false)
  const [availableCoupons, setAvailableCoupons] = useState([])
  const [showOffers, setShowOffers]             = useState(false)

  // Load available coupons once
  useEffect(() => {
    fetch(BACKEND_URL + '/api/coupons/available')
      .then(r => r.json())
      .then(data => setAvailableCoupons(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  useEffect(() => { closeDrawer() }, [])

  const activeSlot    = DELIVERY_SLOTS.find((s) => s.id === selectedSlot)
  const slotFee       = calcDelivery(totalPrice, activeSlot?.id)
  const couponDiscount = couponApplied ? couponApplied.discount : 0
  const finalTotal    = Math.max(0, totalPrice - couponDiscount + slotFee)

  async function validateAndApplyCoupon(code) {
    const trimmed = (code || '').trim().toUpperCase()
    if (!trimmed) return
    setCouponLoading(true); setCouponError('')
    try {
      const res = await fetch(BACKEND_URL + '/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed, order_total: totalPrice, user_id: user?.id || null }),
      })
      const data = await res.json()
      if (!res.ok) { setCouponError(data.error || 'Invalid coupon'); return }
      setCouponApplied({ discount: data.discount, code: trimmed, coupon: data.coupon })
      addToast('Coupon applied! You save ₹' + data.discount, 'success')
    } catch { setCouponError('Could not validate coupon') }
    finally { setCouponLoading(false) }
  }

  function applyCoupon() { validateAndApplyCoupon(couponCode) }

  function applyOfferCoupon(code) {
    setCouponCode(code)
    setCouponError('')
    setShowOffers(false)
    validateAndApplyCoupon(code)
  }

  if (cart.length === 0) {
    return (
      <div className="page-enter max-w-md mx-auto px-4 py-24 text-center">
        <div className="w-20 h-20 mx-auto rounded-full bg-sage-50 flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 5M7 13l1.5 5m7-5l1.5 5M17 18a1 1 0 11-2 0 1 1 0 012 0zM9 18a1 1 0 11-2 0 1 1 0 012 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-700 mb-2">Your cart is empty</h2>
        <Link to="/" className="btn-primary inline-flex mt-4">Go Shopping</Link>
      </div>
    )
  }

  function setField(key, val) {
    setForm((f) => ({ ...f, [key]: val }))
    if (errors[key]) setErrors((e) => { const n = {...e}; delete n[key]; return n })
  }

  function setPincode(val) {
    setField('pincode', val.replace(DIGIT_RE, '').slice(0, 6))
  }

  function fillFromAddress(addr) {
    setForm(f => ({
      ...f,
      name:    addr.name    || f.name,
      phone:   addr.phone   || f.phone,
      address: addr.address || f.address,
      city:    addr.city    || f.city,
      pincode: addr.pincode || f.pincode,
      notes:   addr.notes   || '',
    }))
    setErrors({})
    addToast(`Address filled from ${addr.label}`, 'success', 2000)
  }

  function validateStep1() {
    const errs = {}
    if (!form.name.trim())                          errs.name    = 'Full name is required'
    if (!PHONE_RE.test(form.phone.trim()))          errs.phone   = 'Enter valid 10-digit Indian mobile number'
    if (!form.address.trim())                       errs.address = 'Delivery address is required'
    if (!form.city.trim())                          errs.city    = 'City is required'
    if (!PINCODE_RE.test(form.pincode.trim()))      errs.pincode = 'Enter valid 6-digit pincode'
    return errs
  }

  function handleNext() {
    if (step === 1) {
      const errs = validateStep1()
      if (Object.keys(errs).length > 0) { setErrors(errs); addToast('Please fix the errors below', 'error'); return }
      setErrors({})
    }
    setStep((s) => Math.min(s + 1, 3))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const changeDayQty = (day, delta) =>
    setDayQty(p => ({ ...p, [day]: Math.max(0, (p[day] || 0) + delta) }))

  const customActiveDays = DAYS.filter(d => dayQty[d] > 0).length

  async function handlePlaceOrder() {
    if (orderType === 'subscription' && !user) {
      addToast('Please log in to place a subscription order', 'error', 5000)
      return
    }
    if (subMode === 'Custom' && customActiveDays === 0) {
      addToast('Please select at least one day for your custom schedule', 'error', 5000)
      return
    }

    // Subscription path — create via subscriptions API
    if (orderType === 'subscription') {
      setPlacing(true)
      const items = cart.map(item => ({
        id: item.id, name: item.name, price: item.price,
        unit: item.unit, emoji: item.emoji || '🌿', quantity: item.quantity,
      }))
      const frequency = subMode === 'Daily' ? 'daily'
        : subMode === 'On Interval' ? `interval_${intervalDays}`
        : 'custom'
      const custom_schedule = subMode === 'Custom' ? dayQty : null
      const address = `${form.address.trim()}, ${form.city.trim()} — ${form.pincode.trim()}`
      try {
        const token = localStorage.getItem('auth_token')
        let res
        try {
          res = await fetch(`${BACKEND_URL}/api/subscriptions/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ items, frequency, start_date: subStartDate, address, custom_schedule }),
          })
        } catch {
          addToast('❌ Cannot reach server. Check your internet and try again.', 'error', 7000)
          setPlacing(false)
          return
        }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || `Server error (${res.status})`)
        }
        clearCart()
        addToast('Subscription created! 🎉', 'success', 5000)
        navigate('/')
      } catch (e) {
        addToast(`❌ ${e.message || 'Subscription failed. Please try again.'}`, 'error', 7000)
      } finally {
        setPlacing(false)
      }
      return
    }

    // Stock validation before placing
    const outOfStock = cart.filter(item => item.stock === 0 || item.quantity > item.stock)
    if (outOfStock.length) {
      addToast(`❌ ${outOfStock.map(i => i.name).join(', ')} — insufficient stock`, 'error', 5000)
      return
    }
    setPlacing(true)
    // Reference ID is now generated by the backend; placeholder until response arrives.
    let orderId = ''
    const customer = {
      name:    form.name.trim(),
      phone:   form.phone.trim(),
      address: `${form.address.trim()}, ${form.city.trim()} — ${form.pincode.trim()}`,
      notes:   form.notes.trim(),
      email:   user?.email || '',
    }
    const items = cart.map((item) => ({
      id:       item.id,
      name:     item.name,
      emoji:    item.emoji,
      price:    item.price,
      quantity: item.quantity,
      unit:     item.unit,
    }))
    const order = {
      orderId,
      customer,
      items,
      total:         finalTotal,
      subtotal:      totalPrice,
      deliveryFee:   slotFee,
      deliverySlot:  activeSlot?.label,
      paymentMethod,
      status:       'pending',
      userEmail:    user?.email || null,
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    }

    // Save to backend database (so admin can see it and status can be polled)
    let backendId = null
    try {
      const headers = { 'Content-Type': 'application/json' }
      const token = localStorage.getItem('auth_token')
      if (token) headers['Authorization'] = `Bearer ${token}`
      const backendRes = await fetch(`${BACKEND_URL}/api/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ customer, items, subtotal: totalPrice - couponDiscount, deliveryFee: slotFee, total: finalTotal, paymentMethod, deliverySlot: activeSlot?.label, coupon_code: couponApplied?.code || null }),
      })
      if (backendRes.ok) {
        const data = await backendRes.json()
        backendId = data.id || null
        // Server-generated reference id becomes the canonical order id for the UI.
        if (data.reference_id) {
          orderId = data.reference_id
          order.orderId = data.reference_id
        }
        // Override local order with server-confirmed values so tracking shows accurate totals
        order.total       = Number(data.total)       || order.total
        order.subtotal    = Number(data.subtotal)     || order.subtotal
        order.deliveryFee = Number(data.delivery_fee) || order.deliveryFee
        // Use server-validated items (prices may have been corrected server-side)
        if (Array.isArray(data.items) && data.items.length > 0) {
          order.items = data.items
        }
      } else {
        const errData = await backendRes.json().catch(() => ({}))
        setPlacing(false)
        addToast(`❌ Order failed: ${errData.error || 'Server error'}. Please try again.`, 'error', 7000)
        return
      }
    } catch {
      setPlacing(false)
      addToast('❌ Cannot reach server. Check your internet and try again.', 'error', 7000)
      return
    }

    // Save the used address only if it doesn't already exist (prevent duplicates)
    const normalize = (s) => (s || '').trim().toLowerCase()
    const alreadySaved = addresses.some(a =>
      normalize(a.address) === normalize(form.address) &&
      normalize(a.city)    === normalize(form.city)    &&
      normalize(a.pincode) === normalize(form.pincode) &&
      normalize(a.name)    === normalize(form.name)
    )
    if (!alreadySaved) {
      addAddress({
        label:   'Home',
        name:    form.name.trim(),
        phone:   form.phone.trim(),
        address: form.address.trim(),
        city:    form.city.trim(),
        pincode: form.pincode.trim(),
      }).catch(() => {})
    }

    addOrder({ ...order, backendId })
    // Stock already deducted server-side in transaction; sync local context so UI reflects it
    cart.forEach((item) => decreaseStock(item.id, item.quantity))
    clearCart()
    setPlacing(false)

    addToast('Order placed successfully! 🎉', 'success', 5000)
    navigate(`/track/${orderId}`)
  }

  return (
    <div className="page-enter max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Checkout</h1>

      {/* Step indicator */}
      <div className="flex items-center mb-8">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <div className="flex flex-col items-center">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                s.id < step  ? 'bg-forest-500 text-white' :
                s.id === step ? 'bg-forest-500 text-white ring-4 ring-forest-100' :
                                'bg-gray-100 text-gray-400'
              }`}>
                {s.id < step ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : s.id}
              </div>
              <span className={`text-xs mt-1 font-medium hidden sm:block ${s.id <= step ? 'text-forest-600' : 'text-gray-400'}`}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 transition-all duration-300 ${s.id < step ? 'bg-forest-500' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-4">

          {/* ── STEP 1: Delivery Info ── */}
          {step === 1 && (
            <div className="card p-6 animate-slide-up">
              {/* Order Type */}
              <div className="mb-6 pb-6 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Order Type</p>

                {/* Buy Once — primary prominent option */}
                <button type="button" onClick={() => setSubMode('Buy Once')}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 mb-3 transition-all text-left ${
                    subMode === 'Buy Once'
                      ? 'border-forest-500 bg-forest-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}>
                  <span className="text-3xl">🛒</span>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 text-sm">Buy Once</p>
                    <p className="text-xs text-gray-500 mt-0.5">One-time delivery, no commitment</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    subMode === 'Buy Once' ? 'border-forest-500 bg-forest-500' : 'border-gray-300'
                  }`}>
                    {subMode === 'Buy Once' && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                      </svg>
                    )}
                  </div>
                </button>

                {/* Subscribe — secondary option */}
                <button type="button" onClick={() => setSubMode(subMode === 'Buy Once' ? 'Daily' : subMode)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                    subMode !== 'Buy Once'
                      ? 'border-forest-500 bg-forest-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}>
                  <span className="text-3xl">🔔</span>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 text-sm">Subscribe</p>
                    <p className="text-xs text-green-600 font-medium mt-0.5">Set a recurring delivery schedule</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    subMode !== 'Buy Once' ? 'border-forest-500 bg-forest-500' : 'border-gray-300'
                  }`}>
                    {subMode !== 'Buy Once' && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                      </svg>
                    )}
                  </div>
                </button>

                {/* Subscription frequency — shown only when Subscribe is selected */}
                {subMode !== 'Buy Once' && (
                  <div className="mt-3 bg-gray-50 rounded-2xl p-4 space-y-4">
                    {/* Frequency tabs */}
                    <div className="grid grid-cols-3 gap-2">
                      {['Daily', 'Custom', 'On Interval'].map(m => (
                        <button key={m} type="button" onClick={() => setSubMode(m)}
                          className={`py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                            subMode === m
                              ? 'bg-forest-500 border-forest-500 text-white shadow-sm'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-forest-300'
                          }`}>
                          {m}
                        </button>
                      ))}
                    </div>

                    {/* Daily */}
                    {subMode === 'Daily' && (
                      <div className="space-y-3">
                        <SubDateRow label="Start Date" value={subStartDate} onChange={setSubStartDate}/>
                        <SubQtyRow label="Quantity per delivery" qty={subQty} onChange={setSubQty}/>
                      </div>
                    )}

                    {/* Custom */}
                    {subMode === 'Custom' && (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Quantity per day</p>
                        <div className="grid grid-cols-7 gap-1">
                          {DAYS.map(day => (
                            <div key={day} className={`flex flex-col items-center rounded-xl border-2 overflow-hidden transition-all ${
                              dayQty[day] > 0 ? 'border-forest-400 bg-white' : 'border-gray-200 bg-white'
                            }`}>
                              <button type="button" onClick={() => changeDayQty(day, 1)}
                                className={`w-full py-2 text-base font-bold flex items-center justify-center ${
                                  dayQty[day] > 0 ? 'text-forest-600 hover:bg-forest-50' : 'text-gray-400 hover:bg-gray-100'
                                }`}>+</button>
                              <div className="w-full h-px bg-gray-200"/>
                              <p className="text-sm font-extrabold text-gray-800 py-1.5">{dayQty[day]}</p>
                              <p className={`text-[10px] font-bold mb-1 ${dayQty[day] > 0 ? 'text-forest-500' : 'text-gray-400'}`}>{day}</p>
                              <div className="w-full h-px bg-gray-200"/>
                              <button type="button" onClick={() => changeDayQty(day, -1)} disabled={dayQty[day] === 0}
                                className={`w-full py-2 text-base font-bold flex items-center justify-center ${
                                  dayQty[day] > 0 ? 'text-forest-600 hover:bg-forest-50' : 'text-gray-300'
                                }`}>−</button>
                            </div>
                          ))}
                        </div>
                        {customActiveDays > 0 && (
                          <p className="text-xs text-forest-600 font-medium text-center">
                            {customActiveDays} day{customActiveDays > 1 ? 's' : ''} per week · {DAYS.filter(d => dayQty[d] > 0).join(', ')}
                          </p>
                        )}
                        <SubDateRow label="Start Date" value={subStartDate} onChange={setSubStartDate}/>
                      </div>
                    )}

                    {/* On Interval */}
                    {subMode === 'On Interval' && (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Repeat once every</p>
                        <div className="flex flex-wrap gap-2">
                          {INTERVALS.map(n => (
                            <button key={n} type="button" onClick={() => setIntervalDays(n)}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all ${
                                intervalDays === n
                                  ? 'bg-forest-500 border-forest-500 text-white shadow-sm'
                                  : 'bg-white border-forest-200 text-forest-600 hover:bg-forest-50'
                              }`}>
                              {n} days
                            </button>
                          ))}
                        </div>
                        <SubDateRow label="Start Date" value={subStartDate} onChange={setSubStartDate}/>
                        <SubQtyRow label="Quantity" qty={subQty} onChange={setSubQty}/>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <h2 className="font-bold text-gray-800 text-lg mb-5 flex items-center gap-2">
                <svg className="w-5 h-5 text-forest-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Delivery Information
              </h2>

              {/* ── Saved Addresses (Swiggy/Zomato style) ── */}
              {uniqueAddresses.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Saved Addresses</p>
                  <div className="flex flex-col gap-2">
                    {uniqueAddresses.map(addr => {
                      const isSelected = selectedAddressId === addr.id
                      return (
                        <div
                          key={addr.id}
                          onClick={() => {
                            setSelectedAddressId(addr.id)
                            setForm(f => ({
                              ...f,
                              name:    addr.name    || f.name,
                              phone:   addr.phone   || f.phone,
                              address: addr.address || '',
                              city:    addr.city    || '',
                              pincode: addr.pincode || '',
                              notes:   addr.notes   || '',
                            }))
                            setErrors({})
                          }}
                          className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200 ${
                            isSelected
                              ? 'border-forest-500 bg-forest-50 shadow-sm'
                              : 'border-gray-100 hover:border-gray-300 bg-white'
                          }`}
                        >
                          {/* Radio circle */}
                          <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                            isSelected ? 'border-forest-500' : 'border-gray-300'
                          }`}>
                            {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-forest-500"/>}
                          </div>

                          {/* Icon + details */}
                          <span className="text-xl flex-shrink-0">{LABEL_ICONS[addr.label] || '📍'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-800">{addr.label}</p>
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              {addr.address}, {addr.city} – {addr.pincode}
                            </p>
                            {addr.phone && <p className="text-xs text-gray-400 mt-0.5">📞 {addr.phone}</p>}
                          </div>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              deleteAddress(addr.id)
                              if (isSelected) {
                                setSelectedAddressId(null)
                                setForm(f => ({ ...f, address: '', city: '', pincode: '', notes: '' }))
                                setPrefilled(false)
                              }
                            }}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                          </button>
                        </div>
                      )
                    })}

                    {/* Add new address option */}
                    <div
                      onClick={() => {
                        setSelectedAddressId(null)
                        setForm(f => ({ ...f, address: '', city: '', pincode: '', notes: '' }))
                        setErrors({})
                      }}
                      className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
                        selectedAddressId === null
                          ? 'border-forest-400 bg-forest-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                        selectedAddressId === null ? 'border-forest-500' : 'border-gray-300'
                      }`}>
                        {selectedAddressId === null && <div className="w-2.5 h-2.5 rounded-full bg-forest-500"/>}
                      </div>
                      <span className="text-lg">➕</span>
                      <p className="text-sm font-semibold text-gray-700">Add a new address</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Manual form — shown when adding a new address OR no saved addresses */}
              {(selectedAddressId === null || uniqueAddresses.length === 0) && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Full Name" placeholder="e.g. Priya Sharma" value={form.name} onChange={(v) => setField('name', v)} error={errors.name} required />
                  <Field label="Mobile Number" placeholder="10-digit number" type="tel" value={form.phone} onChange={(v) => setField('phone', v)} error={errors.phone} required prefix="+91" />
                </div>
                <Field label="Delivery Address" placeholder="House no., Street, Locality" value={form.address} onChange={(v) => setField('address', v)} error={errors.address} required textarea />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="City" placeholder="e.g. Hyderabad" value={form.city} onChange={(v) => setField('city', v)} error={errors.city} required />
                  <Field label="Pincode" placeholder="6-digit pincode" value={form.pincode} onChange={setPincode} error={errors.pincode} required />
                </div>
                <Field label="Delivery Notes (optional)" placeholder="Gate code, landmark, special instructions..." value={form.notes} onChange={(v) => setField('notes', v)} textarea />
              </div>
              )}
              <button onClick={handleNext} className="btn-primary w-full mt-6 flex items-center justify-center gap-2">
                Choose Delivery Slot
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>
            </div>
          )}

          {/* ── STEP 2: Delivery Scheduling ── */}
          {step === 2 && (
            <div className="card p-6 animate-slide-up">
              <h2 className="font-bold text-gray-800 text-lg mb-2 flex items-center gap-2">
                <svg className="w-5 h-5 text-forest-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Choose Delivery Slot
              </h2>
              <p className="text-sm text-gray-400 mb-5">Select when you'd like your order delivered</p>

              <div className="space-y-3 mb-6">
                {DELIVERY_SLOTS.map((slot) => {
                  const isAvailable = slot.available()
                  const isSelected  = selectedSlot === slot.id
                  const fee         = totalPrice >= FREE_DELIVERY_THRESHOLD ? 0 : slot.fee
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => setSelectedSlot(slot.id)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                        !isAvailable ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed' :
                        isSelected   ? 'border-forest-500 bg-forest-50 shadow-sm' :
                                       'border-gray-200 hover:border-forest-200 hover:bg-sage-50'
                      }`}
                    >
                      <span className="text-3xl">{slot.icon}</span>
                      <div className="flex-1">
                        <p className="font-bold text-gray-800 text-sm">{slot.label}</p>
                        <p className="text-gray-400 text-xs mt-0.5">{slot.desc}</p>
                        {!isAvailable && <p className="text-xs text-gray-400 mt-0.5">Not available right now</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-bold ${fee === 0 ? 'text-forest-600' : 'text-gray-700'}`}>
                          {fee === 0 ? 'FREE' : `+₹${fee}`}
                        </p>
                      </div>
                      {isAvailable && (
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'border-forest-500 bg-forest-500' : 'border-gray-300'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {totalPrice < FREE_DELIVERY_THRESHOLD && (
                <div className="bg-earth-50 border border-earth-200 rounded-xl p-3 mb-4 flex items-start gap-2 text-sm">
                  <span className="text-earth-500 flex-shrink-0">💡</span>
                  <span className="text-earth-700">Add <strong>₹{FREE_DELIVERY_THRESHOLD - totalPrice}</strong> more to get free delivery on any slot!</span>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={handleBack} className="btn-secondary flex-1">← Back</button>
                <button onClick={handleNext} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  Choose Payment
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Payment ── */}
          {step === 3 && (
            <div className="card p-6 animate-slide-up">
              <h2 className="font-bold text-gray-800 text-lg mb-5 flex items-center gap-2">
                <svg className="w-5 h-5 text-forest-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Payment Method
              </h2>

              <div className="space-y-3 mb-5">
                <PaymentOption id="upi" selected={paymentMethod === 'upi'} onSelect={() => setPaymentMethod('upi')}
                  icon={<UpiIcon />} title="UPI Payment" subtitle="PhonePe, GPay, Paytm, BHIM & more" recommended />
                <PaymentOption id="cod" selected={paymentMethod === 'cod'} onSelect={() => setPaymentMethod('cod')}
                  icon={<CodIcon />} title="Cash on Delivery" subtitle="Pay when your order arrives" />
                <PaymentOption id="card" selected={paymentMethod === 'card'} onSelect={() => setPaymentMethod('card')}
                  icon={<CardIcon />} title="Credit / Debit Card" subtitle="Coming soon — use UPI or COD for now" disabled />
              </div>

              {paymentMethod === 'upi' && (
                <div className="bg-forest-50 rounded-2xl p-5 text-center border border-forest-100 mb-4 animate-slide-up">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Scan & Pay</p>
                  <div className="w-36 h-36 mx-auto bg-white rounded-2xl border-2 border-forest-200 flex flex-col items-center justify-center mb-3 shadow-sm">
                    <svg className="w-16 h-16 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    <span className="text-xs text-gray-400 mt-1">QR Code</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 bg-white rounded-xl px-4 py-2.5 border border-forest-200 w-fit mx-auto shadow-sm">
                    <span className="text-forest-600 font-mono font-bold text-sm">{OWNER_UPI_ID}</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(OWNER_UPI_ID); addToast('UPI ID copied!', 'success') }}
                      className="text-gray-400 hover:text-forest-600 transition-colors"
                      title="Copy UPI ID"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Complete payment, then click Place Order</p>
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-700 flex gap-2 animate-slide-up">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Card payments are coming soon. Please select UPI or Cash on Delivery to place your order.
                </div>
              )}

              {/* Order review */}
              <div className="bg-sage-50 rounded-xl p-4 mb-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Order Summary</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-500">
                    <span>Delivery to</span>
                    <span className="font-medium text-gray-700 text-right max-w-[180px] truncate">{form.address}, {form.city}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Slot</span>
                    <span className="font-medium text-gray-700">{activeSlot?.icon} {activeSlot?.label}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Payment</span>
                    <span className="font-medium text-gray-700 capitalize">
                      {paymentMethod === 'cod' ? 'Cash on Delivery' : 'UPI'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={handleBack} className="btn-secondary flex-1 flex items-center justify-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <button
                  onClick={handlePlaceOrder}
                  disabled={placing || paymentMethod === 'card'}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 bg-forest-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {placing ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Placing Order...
                    </>
                  ) : (
                    <>Place Order ₹{finalTotal}</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: order summary */}
        <div className="lg:col-span-1">
          <div className="card p-5 sticky top-20">
            <h3 className="font-bold text-gray-800 mb-3 text-sm">Order Summary</h3>
            <div className="space-y-2 text-sm mb-3 max-h-48 overflow-y-auto pr-1">
              {cart.map((item) => (
                <div key={item.cartKey} className="flex justify-between items-start gap-2 text-gray-600">
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-700 font-medium truncate block">{item.name}</span>
                    <span className="text-gray-400 text-xs">{item.unit} ×{item.quantity}</span>
                  </div>
                  <span className="font-semibold flex-shrink-0">₹{item.price * item.quantity}</span>
                </div>
              ))}
            </div>
            {/* Coupon section */}
            <div className="border-t pt-3 mb-2">
              {couponApplied ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                  <div>
                    <p className="text-green-700 font-bold text-sm">🎟 {couponApplied.code}</p>
                    <p className="text-green-600 text-xs">−₹{couponApplied.discount} saved{couponApplied.coupon?.type === 'percent' ? ` (${couponApplied.coupon.value}%)` : ''}</p>
                  </div>
                  <button onClick={() => { setCouponApplied(null); setCouponCode('') }} className="text-gray-400 hover:text-red-500 text-xs ml-2 p-1">✕</button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input value={couponCode} onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError('') }}
                      onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                      placeholder="Enter coupon code"
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-forest-400 uppercase font-mono"/>
                    <button onClick={applyCoupon} disabled={couponLoading || !couponCode.trim()}
                      className="px-3 py-2 bg-forest-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50 hover:bg-forest-600 transition-colors">
                      {couponLoading ? '…' : 'Apply'}
                    </button>
                  </div>
                  {couponError && <p className="text-red-500 text-xs mt-1.5">{couponError}</p>}

                  {/* Available offers */}
                  {availableCoupons.length > 0 && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setShowOffers(v => !v)}
                        className="flex items-center gap-1 text-forest-600 text-xs font-semibold hover:text-forest-700 transition-colors"
                      >
                        🏷 {availableCoupons.length} offer{availableCoupons.length > 1 ? 's' : ''} available
                        <svg className={`w-3 h-3 transition-transform ${showOffers ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
                        </svg>
                      </button>
                      {showOffers && (
                        <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {availableCoupons.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => applyOfferCoupon(c.code)}
                              className="w-full flex items-center gap-2 p-2.5 bg-gray-50 hover:bg-forest-50 hover:border-forest-200 border border-gray-100 rounded-xl transition-colors text-left"
                            >
                              <span className="text-base">🎟</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-forest-600 font-mono">{c.code}</p>
                                <p className="text-[10px] text-gray-500 truncate">
                                  {c.type === 'percent'
                                    ? (c.value + '% off' + (c.max_discount ? ' (max ₹' + c.max_discount + ')' : ''))
                                    : ('₹' + c.value + ' off')}
                                  {c.min_order > 0 ? (' · Min ₹' + c.min_order) : ''}
                                </p>
                                {c.description && <p className="text-[10px] text-gray-400 truncate">{c.description}</p>}
                              </div>
                              <span className="text-[10px] text-forest-600 font-semibold whitespace-nowrap">Tap to apply →</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="border-t pt-2 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span><span>₹{totalPrice}</span>
              </div>
              {couponDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Coupon ({couponApplied.code})</span>
                  <span>−₹{couponDiscount}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-500">
                <span>Delivery</span>
                <span className={slotFee === 0 ? 'text-forest-600 font-semibold' : ''}>
                  {slotFee === 0 ? 'FREE' : `₹${slotFee}`}
                </span>
              </div>
              <div className="flex justify-between font-bold text-gray-800 text-base border-t pt-2">
                <span>Total</span>
                <span className="text-forest-500">₹{finalTotal}</span>
              </div>
            </div>
            {/* Trust */}
            <div className="mt-4 pt-3 border-t space-y-1.5">
              {['Chemical-free guarantee', 'Same-day freshness', 'Secure checkout'].map((t) => (
                <div key={t} className="flex items-center gap-1.5 text-xs text-gray-400">
                  <svg className="w-3.5 h-3.5 text-forest-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Subscription helpers ── */
function SubDateRow({ label, value, onChange }) {
  return (
    <div>
      <p className="text-xs text-gray-400 font-medium mb-1.5">{label}</p>
      <label className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 cursor-pointer hover:border-forest-300 transition-colors">
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span className="text-gray-700 font-medium text-sm flex-1">{value ? fmtDate(value) : 'Select date'}</span>
        <input type="date" value={value} min={tomorrow()} onChange={e => onChange(e.target.value)} className="absolute opacity-0 w-0 h-0"/>
      </label>
    </div>
  )
}

function SubQtyRow({ label, qty, onChange }) {
  return (
    <div>
      <p className="text-xs text-gray-400 font-medium mb-1.5">{label}</p>
      <div className="flex items-center gap-0 w-fit">
        <button type="button" onClick={() => onChange(Math.max(1, qty - 1))}
          className="w-10 h-10 rounded-l-xl bg-forest-500 hover:bg-forest-600 text-white font-bold text-xl flex items-center justify-center transition-colors">−</button>
        <span className="w-10 h-10 flex items-center justify-center font-extrabold text-base text-gray-900 bg-white border-y border-gray-200">{qty}</span>
        <button type="button" onClick={() => onChange(qty + 1)}
          className="w-10 h-10 rounded-r-xl bg-forest-500 hover:bg-forest-600 text-white font-bold text-xl flex items-center justify-center transition-colors">+</button>
      </div>
    </div>
  )
}

/* ── Sub-components ── */
function Field({ label, placeholder, value, onChange, error, required, textarea, type = 'text', prefix }) {
  const cls = `input-field ${error ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''} ${prefix ? 'pl-12' : ''}`
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">{prefix}</span>}
        {textarea ? (
          <textarea rows={3} className={cls + ' resize-none'} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input type={type} className={cls} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
        )}
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}

function PaymentOption({ id, selected, onSelect, icon, title, subtitle, recommended, disabled }) {
  return (
    <button type="button" onClick={disabled ? undefined : onSelect} disabled={disabled}
      className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 text-left ${
        disabled  ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed' :
        selected  ? 'border-forest-500 bg-forest-50 shadow-sm' :
                    'border-gray-200 hover:border-forest-200 hover:bg-sage-50'
      }`}
    >
      <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          <p className="font-semibold text-gray-800 text-sm">{title}</p>
          {recommended && <span className="badge bg-earth-100 text-earth-600 text-[10px]">Recommended</span>}
          {disabled && <span className="badge bg-gray-100 text-gray-400 text-[10px]">Coming Soon</span>}
        </div>
        <p className="text-gray-400 text-xs mt-0.5">{subtitle}</p>
      </div>
      {!disabled && (
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selected ? 'border-forest-500 bg-forest-500' : 'border-gray-300'}`}>
          {selected && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
        </div>
      )}
    </button>
  )
}

function UpiIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <rect width="24" height="24" rx="4" fill="#6739B7" />
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">UPI</text>
    </svg>
  )
}
function CodIcon() {
  return (
    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
}
function CardIcon() {
  return (
    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  )
}
