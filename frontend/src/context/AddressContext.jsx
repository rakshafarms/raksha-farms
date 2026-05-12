import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AddressContext = createContext(null)

export const LABEL_ICONS = { Home: '🏠', Work: '🏢', Hostel: '🏫', Other: '📍' }
const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function getToken() { return localStorage.getItem('auth_token') }

export function AddressProvider({ children }) {
  // Start empty — always load from DB, never from localStorage
  const [addresses, setAddresses] = useState([])
  const [loading, setLoading] = useState(false)

  const syncFromBackend = useCallback(async () => {
    const token = getToken()
    if (!token) { setAddresses([]); return }
    setLoading(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setAddresses(Array.isArray(data) ? data : [])
    } catch { /* network error — stay empty */ }
    finally { setLoading(false) }
  }, [])

  // Load on mount and whenever user logs in
  useEffect(() => {
    syncFromBackend()
    window.addEventListener('rf:login', syncFromBackend)
    return () => window.removeEventListener('rf:login', syncFromBackend)
  }, [syncFromBackend])

  // On logout: clear addresses immediately
  useEffect(() => {
    function onLogout() { setAddresses([]) }
    window.addEventListener('rf:logout', onLogout)
    return () => window.removeEventListener('rf:logout', onLogout)
  }, [])

  async function addAddress(addr) {
    const token = getToken()
    if (!token) return null          // must be logged in to save
    try {
      const res = await fetch(`${BACKEND_URL}/api/addresses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(addr),
      })
      if (!res.ok) return null
      const saved = await res.json()
      setAddresses(prev => [saved, ...prev])
      return saved
    } catch { return null }
  }

  async function updateAddress(id, updates) {
    const token = getToken()
    if (!token) return
    try {
      const res = await fetch(`${BACKEND_URL}/api/addresses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(updates),
      })
      if (!res.ok) return
      const updated = await res.json()
      setAddresses(prev => prev.map(a => a.id === id ? updated : a))
    } catch { /* silent */ }
  }

  async function deleteAddress(id) {
    const token = getToken()
    if (!token) return
    try {
      await fetch(`${BACKEND_URL}/api/addresses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setAddresses(prev => prev.filter(a => a.id !== id))
    } catch { /* silent */ }
  }

  return (
    <AddressContext.Provider value={{ addresses, loading, addAddress, updateAddress, deleteAddress, LABEL_ICONS }}>
      {children}
    </AddressContext.Provider>
  )
}

export function useAddresses() {
  const ctx = useContext(AddressContext)
  if (!ctx) throw new Error('useAddresses must be used inside AddressProvider')
  return ctx
}
