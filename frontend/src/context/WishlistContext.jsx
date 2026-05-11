import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

const WishlistContext = createContext(null)
const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function getToken() { return localStorage.getItem('auth_token') }

async function saveWishlistToBackend(items) {
  const token = getToken()
  if (!token) return
  try {
    await fetch(`${BACKEND_URL}/api/wishlist`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items }),
    })
  } catch { /* silent */ }
}

async function loadWishlistFromBackend() {
  const token = getToken()
  if (!token) return null
  try {
    const res = await fetch(`${BACKEND_URL}/api/wishlist`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

export function WishlistProvider({ children }) {
  // Start empty — load from DB, never from localStorage
  const [wishlist, setWishlist] = useState([])
  const saveTimer = useRef(null)
  // Guard: don't save the initial [] to backend before the first DB load completes
  const hasSyncedFromBackend = useRef(!getToken())  // guests are always "synced"

  // Sync from backend on mount and on login — merge guest-added items so they aren't lost
  const syncFromBackend = useCallback(async () => {
    const items = await loadWishlistFromBackend()
    hasSyncedFromBackend.current = true  // mark synced regardless of result
    if (Array.isArray(items)) {
      setWishlist(prev => {
        const backendIds = new Set(items.map(i => i.id))
        // Keep any guest-added items that aren't already in the backend list
        const guestOnly = prev.filter(i => !backendIds.has(i.id))
        return [...items, ...guestOnly]
      })
    }
  }, [])

  useEffect(() => {
    syncFromBackend()
    window.addEventListener('rf:login', syncFromBackend)
    return () => window.removeEventListener('rf:login', syncFromBackend)
  }, [syncFromBackend])

  // On logout: clear wishlist so the next user starts fresh
  useEffect(() => {
    function onLogout() {
      setWishlist([])
      hasSyncedFromBackend.current = false
    }
    window.addEventListener('rf:logout', onLogout)
    return () => window.removeEventListener('rf:logout', onLogout)
  }, [])

  // Debounced save to backend whenever wishlist changes
  useEffect(() => {
    if (!getToken()) return
    if (!hasSyncedFromBackend.current) return  // block save until first DB load done
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveWishlistToBackend(wishlist), 1500)
  }, [wishlist])

  function toggleWishlist(product) {
    setWishlist(prev => {
      const exists = prev.find(p => p.id === product.id)
      return exists ? prev.filter(p => p.id !== product.id) : [...prev, product]
    })
  }

  function isWishlisted(productId) {
    return wishlist.some(p => p.id === productId)
  }

  function clearWishlist() {
    setWishlist([])
    const token = getToken()
    if (token) {
      fetch(`${BACKEND_URL}/api/wishlist`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
  }

  return (
    <WishlistContext.Provider value={{ wishlist, toggleWishlist, isWishlisted, clearWishlist }}>
      {children}
    </WishlistContext.Provider>
  )
}

export function useWishlist() {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist must be used inside WishlistProvider')
  return ctx
}
