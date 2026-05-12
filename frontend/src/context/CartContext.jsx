import React, { createContext, useContext, useState, useEffect, useRef } from 'react'

const CartContext = createContext(null)
const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function getToken() { return localStorage.getItem('auth_token') }

async function saveCartToBackend(items) {
  const token = getToken()
  if (!token) return
  try {
    await fetch(`${BACKEND_URL}/api/cart`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items }),
    })
  } catch { /* silent */ }
}

async function loadCartFromBackend() {
  const token = getToken()
  if (!token) return null
  try {
    const res = await fetch(`${BACKEND_URL}/api/cart`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

export function CartProvider({ children }) {
  // For logged-in users: start empty, load from DB
  // For guests: read from localStorage as fallback
  const [cart, setCart] = useState(() => {
    if (getToken()) return []   // logged in → wait for DB load
    try { return JSON.parse(localStorage.getItem('rf_cart') || '[]') }
    catch { return [] }
  })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const saveTimer = useRef(null)
  // ── Bug 7 fix: never let an empty initial state overwrite the real backend cart ─
  // hasSyncedFromBackend becomes true after the first successful DB load.
  // The debounced save is blocked until then so an empty [] never clobbers real data.
  const hasSyncedFromBackend = useRef(!getToken())  // guests are always "synced"

  // Persist to localStorage (guest fallback) and debounce backend save
  useEffect(() => {
    localStorage.setItem('rf_cart', JSON.stringify(cart))
    if (!hasSyncedFromBackend.current) return  // DB not yet loaded — don't overwrite it
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveCartToBackend(cart), 2000)
  }, [cart])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  // Merge backend cart into local state
  async function mergeBackendCart() {
    const backendItems = await loadCartFromBackend()
    // Mark as synced regardless of result so saves can proceed after this point
    hasSyncedFromBackend.current = true
    if (!Array.isArray(backendItems)) return
    setCart(prev => {
      if (!backendItems.length) return prev  // backend empty — keep local guest items
      // Backend takes priority; local-only items appended
      const merged = [...backendItems]
      prev.forEach(local => {
        if (!merged.find(b => b.cartKey === local.cartKey)) merged.push(local)
      })
      return merged
    })
  }

  // On mount: load from DB if logged in
  useEffect(() => { mergeBackendCart() }, []) // eslint-disable-line

  // On login: rf:login event dispatched by AuthContext → sync from DB
  useEffect(() => {
    window.addEventListener('rf:login', mergeBackendCart)
    return () => window.removeEventListener('rf:login', mergeBackendCart)
  }, []) // eslint-disable-line

  // On logout: clear cart state so the next user starts fresh
  useEffect(() => {
    function onLogout() {
      setCart([])
      localStorage.removeItem('rf_cart')
      hasSyncedFromBackend.current = false
    }
    window.addEventListener('rf:logout', onLogout)
    return () => window.removeEventListener('rf:logout', onLogout)
  }, [])

  function addToCart(product, quantity = 1, selectedVariant = null) {
    const key = selectedVariant ? `${product.id}_${selectedVariant.label}` : product.id
    // Guard: never silently drop a click for a product whose stock is unknown
    // (undefined/null) or zero — only cap when stock is a known positive number.
    const stock = Number.isFinite(Number(product.stock)) && Number(product.stock) > 0
      ? Number(product.stock)
      : Infinity
    const safeQty = Math.max(1, Number(quantity) || 1)
    setCart(prev => {
      const existing = prev.find(item => item.cartKey === key)
      if (existing) {
        return prev.map(item =>
          item.cartKey === key
            ? { ...item, quantity: Math.min(item.quantity + safeQty, stock) }
            : item
        )
      }
      const price = selectedVariant ? selectedVariant.price : product.price
      const unit  = selectedVariant ? selectedVariant.label : product.unit
      return [...prev, { ...product, cartKey: key, quantity: Math.min(safeQty, stock), price, unit, selectedVariant }]
    })
    window.dispatchEvent(new CustomEvent('rf:cart-bump', {
      detail: { image: product.image, name: product.name },
    }))
  }

  function removeFromCart(cartKey) {
    setCart(prev => prev.filter(item => item.cartKey !== cartKey))
  }

  function updateQuantity(cartKey, quantity) {
    if (quantity <= 0) { removeFromCart(cartKey); return }
    setCart(prev =>
      prev.map(item => {
        if (item.cartKey !== cartKey) return item
        const capped = (item.stock > 0) ? Math.min(quantity, item.stock) : quantity
        return { ...item, quantity: capped }
      })
    )
  }

  function clearCart() {
    setCart([])
    localStorage.removeItem('rf_cart')
    const token = getToken()
    if (token) {
      fetch(`${BACKEND_URL}/api/cart`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
  }

  function openDrawer()   { setDrawerOpen(true)  }
  function closeDrawer()  { setDrawerOpen(false) }
  function toggleDrawer() { setDrawerOpen(v => !v) }

  const totalItems = cart.reduce((s, i) => s + i.quantity, 0)
  const totalPrice = cart.reduce((s, i) => s + i.price * i.quantity, 0)

  return (
    <CartContext.Provider value={{
      cart, addToCart, removeFromCart, updateQuantity, clearCart,
      totalItems, totalPrice,
      drawerOpen, openDrawer, closeDrawer, toggleDrawer,
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
