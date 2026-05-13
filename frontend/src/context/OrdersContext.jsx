import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

// Maps backend status → frontend status used in the UI
const STATUS_MAP = {
  placed:           'pending',
  accepted:         'accepted',
  preparing:        'accepted',
  out_for_delivery: 'out_for_delivery',
  delivered:        'delivered',
  cancelled:        'cancelled',
  rejected:         'rejected',
}

const OrdersContext = createContext(null)

export function OrdersProvider({ children }) {
  // Start from localStorage cache for fast render, then always overwrite from DB
  const [orders, setOrders] = useState(() => {
    try {
      const saved = localStorage.getItem('rf_orders')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  // Keep localStorage as a fast-render cache only (DB is the source of truth)
  useEffect(() => {
    localStorage.setItem('rf_orders', JSON.stringify(orders))
  }, [orders])

  function addOrder(order) {
    setOrders((prev) => [order, ...prev])
  }

  function updateOrderStatus(orderId, status, deliveryTime = null, backendId = null) {
    setOrders((prev) =>
      prev.map((o) =>
        o.orderId === orderId
          ? {
              ...o,
              status,
              ...(deliveryTime ? { deliveryTime } : {}),
              ...(backendId   ? { backendId }   : {}),
              updatedAt: new Date().toISOString(),
            }
          : o
      )
    )
  }

  function getOrder(orderId) {
    return orders.find((o) => o.orderId === orderId)
  }

  // Show ALL local orders for logged-in users (email match + no-email guest orders)
  function getOrdersByUser(email) {
    if (!email) return orders
    return orders.filter((o) => !o.userEmail || o.userEmail.toLowerCase() === email.toLowerCase())
  }

  // Merge backend orders into localStorage — updates existing AND restores cleared history
  function applyBackendOrders(backendOrders) {
    if (!backendOrders?.length) return
    setOrders(prev => {
      let changed = false
      // Step 1: update statuses of existing local orders
      const next = prev.map(order => {
        const match = backendOrders.find(b =>
          (b.reference_id && b.reference_id === order.orderId) ||
          (b.id && b.id === order.backendId) ||
          (Math.abs(Number(b.total) - Number(order.total)) < 1 &&
           Math.abs(new Date(b.created_at) - new Date(order.createdAt)) < 10 * 60 * 1000)
        )
        if (!match) return order
        const newStatus = STATUS_MAP[match.status] || match.status
        // Always use backend notes — null explicitly if backend has no notes
        // (don't fall back to stale local notes)
        const newNotes  = match.notes ?? null
        const newTotal  = Number(match.total)
        // Skip update only when nothing changed
        const noChange = newStatus === order.status
          && order.backendId === match.id
          && newTotal === Number(order.total)
          && newNotes === order.notes
        if (noChange) return order
        changed = true
        // Also refresh items from backend — needed when the local copy came from
        // the phone-sync endpoint (which omitted items for privacy), or when the
        // order was restored on a new device and items were never cached locally.
        const backendItems = Array.isArray(match.items)
          ? match.items
          : (() => { try { return JSON.parse(match.items || '[]') } catch { return [] } })()
        const mergedItems = backendItems.length > 0 ? backendItems : order.items
        return {
          ...order,
          status:    newStatus,
          backendId: match.id,
          total:     newTotal,
          notes:     newNotes,
          items:     mergedItems,
          updatedAt: new Date().toISOString(),
        }
      })
      // Step 2: add backend orders not present locally (restores cleared localStorage)
      const localIds  = new Set(next.map(o => o.backendId).filter(Boolean))
      const localRefs = new Set(next.map(o => o.orderId).filter(Boolean))
      const missing = backendOrders.filter(b => !localIds.has(b.id) && !localRefs.has(b.reference_id))
      if (missing.length) {
        changed = true
        const restored = missing.map(b => {
          const addr = typeof b.address === 'string' ? (() => { try { return JSON.parse(b.address) } catch { return {} } })() : (b.address || {})
          const parsedItems = Array.isArray(b.items) ? b.items : (() => { try { return JSON.parse(b.items || '[]') } catch { return [] } })()
          return {
            orderId:       b.reference_id || b.id,
            backendId:     b.id,
            status:        STATUS_MAP[b.status] || b.status,
            total:         Number(b.total),
            deliveryFee:   Number(b.delivery_fee || 0),
            items:         parsedItems,
            customer:      addr,
            userEmail:     addr.email || '',
            paymentMethod: b.payment_method,
            notes:         b.notes || null,
            createdAt:     b.created_at,
            updatedAt:     b.updated_at || b.created_at,
          }
        })
        return [...restored, ...next]
      }
      return changed ? next : prev
    })
  }

  // Primary: sync by user_id (works for all logged-in users including Google)
  const syncOrdersByUser = useCallback(async () => {
    const token = localStorage.getItem('auth_token')
    if (!token) return
    try {
      const res = await fetch(`${BACKEND_URL}/api/orders/mine`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.status === 401) {
        // Token expired — tell the app so the UI can prompt re-login
        window.dispatchEvent(new CustomEvent('rf:token-expired'))
        return
      }
      if (!res.ok) return
      applyBackendOrders(await res.json())
    } catch { /* silent */ }
  }, [])

  // Fallback: sync by phone (works for guest orders)
  const syncOrdersByPhone = useCallback(async (phone) => {
    if (!phone) return
    const digits = phone.replace(/\D/g, '').slice(-10)
    if (digits.length < 8) return
    try {
      const res = await fetch(`${BACKEND_URL}/api/orders/by-phone/${digits}`)
      if (!res.ok) return
      applyBackendOrders(await res.json())
    } catch { /* silent */ }
  }, [])

  // On mount: sync immediately if already logged in (page refresh case)
  useEffect(() => {
    if (localStorage.getItem('auth_token')) syncOrdersByUser()
  }, []) // eslint-disable-line

  // On login (new device / cache cleared): restore orders from DB immediately
  useEffect(() => {
    window.addEventListener('rf:login', syncOrdersByUser)
    return () => window.removeEventListener('rf:login', syncOrdersByUser)
  }, [syncOrdersByUser])

  // On logout: clear local order cache so the next user starts fresh
  useEffect(() => {
    function onLogout() {
      setOrders([])
      localStorage.removeItem('rf_orders')
    }
    window.addEventListener('rf:logout', onLogout)
    return () => window.removeEventListener('rf:logout', onLogout)
  }, [])

  return (
    <OrdersContext.Provider value={{ orders, addOrder, updateOrderStatus, getOrder, getOrdersByUser, syncOrdersByPhone, syncOrdersByUser, applyBackendOrders }}>
      {children}
    </OrdersContext.Provider>
  )
}

export function useOrders() {
  const ctx = useContext(OrdersContext)
  if (!ctx) throw new Error('useOrders must be used inside OrdersProvider')
  return ctx
}
