import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const IconX = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const IconCal = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)
const IconCheck = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const MODES  = ['Daily', 'Custom', 'On Interval', 'Buy Once']
const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const INTERVALS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 30]

// Tomorrow's date in YYYY-MM-DD (earliest allowed start)
function tomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}
function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })
}

export default function SubscriptionSheet({ product, variant, onClose, onSuccess }) {
  const { user } = useAuth()
  const token = localStorage.getItem('auth_token')
  const navigate = useNavigate()

  const [mode, setMode]         = useState('Daily')
  const [qty, setQty]           = useState(1)
  const [startDate, setStartDate] = useState(tomorrow())
  const [intervalDays, setIntervalDays] = useState(2)
  // Custom mode: { Sun:0, Mon:0, ... } — 0 means skip that day
  const [dayQty, setDayQty] = useState(
    Object.fromEntries(DAYS.map(d => [d, 1]))
  )
  const [saving, setSaving] = useState(false)
  const [done, setDone]     = useState(false)

  const price = variant?.price ?? product?.price ?? 0
  const unit  = variant?.label ?? product?.unit  ?? ''
  const name  = product?.name  ?? ''

  // Adjust day qty
  const changeDayQty = (day, delta) =>
    setDayQty(p => ({ ...p, [day]: Math.max(0, (p[day] || 0) + delta) }))

  // How many times per week for custom mode
  const customActiveDays = DAYS.filter(d => dayQty[d] > 0).length

  async function handleSubscribe() {
    if (!user) { navigate('/login'); return }

    const items = [{
      id:       product.id,
      name,
      price,
      unit,
      emoji:    product.emoji || '🌿',
      quantity: qty,
    }]

    let frequency = 'daily'
    let custom_schedule = null

    if (mode === 'Daily')        frequency = 'daily'
    if (mode === 'On Interval')  frequency = `interval_${intervalDays}`
    if (mode === 'Buy Once')     frequency = 'once'
    if (mode === 'Custom') {
      frequency = 'custom'
      custom_schedule = dayQty      // { Sun:2, Mon:1, Tue:0, ... }
      // items array: use avg qty for price_per_cycle (backend uses this)
      const total = DAYS.reduce((s,d) => s + (dayQty[d]||0), 0)
      items[0].quantity = total || 1
    }

    setSaving(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/subscriptions/create`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ items, frequency, start_date: startDate, custom_schedule }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      setDone(true)
      setTimeout(() => { onSuccess?.(); onClose() }, 1600)
    } catch (e) {
      alert(e.message || 'Subscription failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Price summary
  const cyclePrice = mode === 'Custom'
    ? DAYS.reduce((s,d) => s + price * (dayQty[d]||0), 0)
    : price * qty

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose}/>

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col animate-slide-up">

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200"/>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <div>
            <p className="font-bold text-gray-900 text-base">{name}</p>
            {unit && <p className="text-xs text-gray-400 mt-0.5">{unit} · ₹{price}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors text-gray-500">
            <IconX/>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pb-6">

          {/* Question */}
          <p className="text-lg font-bold text-gray-900 mb-4">How often do you want to receive this item?</p>

          {/* Mode tabs */}
          <div className="grid grid-cols-4 gap-2 mb-6">
            {MODES.map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`py-3 rounded-2xl text-sm font-semibold border-2 transition-all ${
                  mode === m
                    ? 'bg-blue-500 border-blue-500 text-white shadow-md'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'
                }`}>
                {m}
              </button>
            ))}
          </div>

          {/* ── DAILY ── */}
          {mode === 'Daily' && (
            <div className="space-y-5">
              <DateRow label="Delivery Start Date" value={startDate} onChange={setStartDate}/>
              <QtyRow label="Quantity" qty={qty} min={1} onChange={setQty}/>
            </div>
          )}

          {/* ── CUSTOM ── */}
          {mode === 'Custom' && (
            <div className="space-y-5">
              <div>
                <p className="text-base font-bold text-gray-800 mb-3">Quantity per day</p>
                <div className="grid grid-cols-7 gap-1.5">
                  {DAYS.map(day => (
                    <div key={day} className={`flex flex-col items-center rounded-2xl border-2 overflow-hidden transition-all ${
                      dayQty[day] > 0 ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <button onClick={() => changeDayQty(day, 1)}
                        className={`w-full py-2.5 text-lg font-bold flex items-center justify-center transition-colors ${
                          dayQty[day] > 0 ? 'text-blue-600 hover:bg-blue-100' : 'text-gray-400 hover:bg-gray-100'
                        }`}>+</button>
                      <div className="w-full h-px bg-gray-200"/>
                      <p className="text-base font-extrabold text-gray-800 py-2">{dayQty[day]}</p>
                      <p className={`text-[10px] font-bold mb-1 ${dayQty[day] > 0 ? 'text-blue-500' : 'text-gray-400'}`}>{day}</p>
                      <div className="w-full h-px bg-gray-200"/>
                      <button onClick={() => changeDayQty(day, -1)}
                        className={`w-full py-2.5 text-lg font-bold flex items-center justify-center transition-colors ${
                          dayQty[day] > 0 ? 'text-blue-600 hover:bg-blue-100' : 'text-gray-300'
                        }`} disabled={dayQty[day] === 0}>−</button>
                    </div>
                  ))}
                </div>
                {customActiveDays > 0 && (
                  <p className="text-xs text-blue-600 font-medium mt-2 text-center">
                    {customActiveDays} day{customActiveDays > 1 ? 's' : ''} per week · {DAYS.filter(d=>dayQty[d]>0).join(', ')}
                  </p>
                )}
              </div>
              <DateRow label="Delivery Start Date" value={startDate} onChange={setStartDate}/>
            </div>
          )}

          {/* ── ON INTERVAL ── */}
          {mode === 'On Interval' && (
            <div className="space-y-5">
              <div>
                <p className="text-base font-bold text-gray-800 mb-3">Repeat Once in</p>
                <div className="flex flex-wrap gap-2">
                  {INTERVALS.map(n => (
                    <button key={n} onClick={() => setIntervalDays(n)}
                      className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition-all ${
                        intervalDays === n
                          ? 'bg-blue-500 border-blue-500 text-white shadow-sm'
                          : 'bg-white border-blue-300 text-blue-600 hover:bg-blue-50'
                      }`}>
                      {n} {n === 1 ? 'Day' : 'Days'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <DateRow label="Delivery Start Date" value={startDate} onChange={setStartDate}/>
                </div>
                <div className="flex-1">
                  <QtyRow label="Quantity" qty={qty} min={1} onChange={setQty}/>
                </div>
              </div>
            </div>
          )}

          {/* ── BUY ONCE ── */}
          {mode === 'Buy Once' && (
            <div className="space-y-5">
              <div className="bg-blue-50 rounded-2xl p-4 text-sm text-blue-700 font-medium">
                🛒 A single order will be placed for the selected quantity. No recurring deliveries.
              </div>
              <DateRow label="Delivery Date" value={startDate} onChange={setStartDate}/>
              <QtyRow label="Quantity" qty={qty} min={1} onChange={setQty}/>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-100 px-5 py-4 bg-white">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">
              {mode === 'Custom'
                ? `₹${cyclePrice}/week`
                : mode === 'On Interval'
                ? `₹${cyclePrice} every ${intervalDays} days`
                : mode === 'Buy Once'
                ? `₹${cyclePrice} total`
                : `₹${cyclePrice}/day`
              }
            </span>
            {mode !== 'Buy Once' && (
              <span className="text-xs bg-green-100 text-green-700 font-bold px-2.5 py-1 rounded-full">
                Subscribe & Save
              </span>
            )}
          </div>

          <button
            onClick={handleSubscribe}
            disabled={saving || done || (mode === 'Custom' && customActiveDays === 0)}
            className={`w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
              done
                ? 'bg-green-500 text-white'
                : 'bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white active:scale-95'
            }`}
          >
            {done ? (
              <><IconCheck/> Subscribed!</>
            ) : saving ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>{mode === 'Buy Once' ? 'Placing Order…' : 'Subscribing…'}</>
            ) : (
              mode === 'Buy Once' ? '🛒 Place Order' : '🔔 Subscribe'
            )}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function DateRow({ label, value, onChange }) {
  return (
    <div>
      <p className="text-sm text-gray-400 font-medium mb-2">{label}</p>
      <label className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 cursor-pointer hover:border-blue-300 transition-colors">
        <span className="text-gray-400 flex-shrink-0"><IconCal/></span>
        <span className="text-gray-700 font-semibold text-sm flex-1">
          {value ? fmtDate(value) : 'Select date'}
        </span>
        <input type="date" value={value} min={tomorrow()}
          onChange={e => onChange(e.target.value)}
          className="absolute opacity-0 w-0 h-0"/>
      </label>
    </div>
  )
}

function QtyRow({ label, qty, min = 1, onChange }) {
  return (
    <div>
      <p className="text-sm text-gray-400 font-medium mb-2">{label}</p>
      <div className="flex items-center gap-0">
        <button onClick={() => onChange(Math.max(min, qty - 1))}
          className="w-14 h-14 rounded-l-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-2xl flex items-center justify-center transition-colors">
          −
        </button>
        <span className="w-14 h-14 flex items-center justify-center font-extrabold text-xl text-gray-900 bg-white border-y border-gray-200">
          {qty}
        </span>
        <button onClick={() => onChange(qty + 1)}
          className="w-14 h-14 rounded-r-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-2xl flex items-center justify-center transition-colors">
          +
        </button>
      </div>
    </div>
  )
}
