import React, { createContext, useContext, useState, useEffect } from 'react'
import { INITIAL_PRODUCTS } from '../data/products2'

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const API_URL = `${BACKEND_URL}/api/products`

// Fire a lightweight ping as soon as the module loads so Render wakes up
// before the product fetch runs. Errors are silently ignored.
fetch(`${BACKEND_URL}/health`).catch(() => {})

// Normalise any image URL coming from the DB:
// – already absolute (http/https) → keep as-is
// – legacy bundled path (/images/…)  → keep as-is
// – uploaded file (/uploads/…)       → prepend BACKEND_URL
function normalizeImg(url) {
  if (!url) return null
  if (url.startsWith('http') || url.startsWith('/images/')) return url
  return `${BACKEND_URL}${url}`
}

const ProductsContext = createContext(null)

export function ProductsProvider({ children }) {
  // ── Fix: start with empty list — never show stale static data ─────────────────
  // INITIAL_PRODUCTS is only used as an offline fallback when the API is unreachable.
  // If the admin has removed all products we must show an empty list, not fake ones.
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  // Fetch from backend on mount. Retries up to 3× (for Render cold-start wakeup).
  useEffect(() => {
    let cancelled = false

    function normalizeProduct(p) {
      return {
        id:          p.id,
        name:        p.name,
        category:    p.category,
        description: p.description || '',
        price:       Number(p.price),
        offer_price: p.offer_price ? Number(p.offer_price) : null,
        unit:        p.unit || 'kg',
        stock:       Number(p.stock),
        image:       normalizeImg(p.image_url),
        featured:    p.is_featured || false,
        is_organic:  p.is_organic || false,
        avg_rating:  p.avg_rating != null ? Number(p.avg_rating) : null,
        review_count: p.review_count ? Number(p.review_count) : 0,
        variants:    Array.isArray(p.variants) ? p.variants : [],
        images:      Array.isArray(p.images)
          ? p.images.map(normalizeImg).filter(Boolean)
          : [],
      }
    }

    async function fetchWithRetry() {
      const delays = [0, 8000, 16000] // immediate, then 8s, then 16s (covers Render cold-start ~20s)
      for (let i = 0; i < delays.length; i++) {
        if (cancelled) return
        if (delays[i] > 0) await new Promise(r => setTimeout(r, delays[i]))
        if (cancelled) return
        try {
          const res = await fetch(`${API_URL}?limit=200`)
          if (!res.ok) throw new Error('API error')
          const data = await res.json()
          if (cancelled) return
          // Always replace state with whatever the DB returned — including an empty array.
          // An empty array means the admin removed all products; respect that.
          const normalized = (Array.isArray(data.products) ? data.products : []).map(normalizeProduct)
          setProducts(normalized)
          setLoading(false)
          return
        } catch {
          // Keep loading=true while retrying so skeleton stays visible
          if (i === delays.length - 1 && !cancelled) {
            // All retries exhausted — show empty (INITIAL_PRODUCTS is [])
            setProducts(INITIAL_PRODUCTS)
            setLoading(false)
          }
        }
      }
    }

    fetchWithRetry()
    return () => { cancelled = true }
  }, [])

  function addProduct(product) {
    const newProduct = { ...product, id: `p_${Date.now()}` }
    setProducts(prev => [...prev, newProduct])
    return newProduct
  }

  function updateProduct(id, updates) {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))
  }

  function deleteProduct(id) {
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  function decreaseStock(id, quantity) {
    setProducts(prev =>
      prev.map(p => p.id === id ? { ...p, stock: Math.max(0, p.stock - quantity) } : p)
    )
  }

  function resetProducts() {
    setProducts(INITIAL_PRODUCTS)
  }

  return (
    <ProductsContext.Provider
      value={{ products, loading, addProduct, updateProduct, deleteProduct, decreaseStock, resetProducts }}
    >
      {children}
    </ProductsContext.Provider>
  )
}

export function useProducts() {
  const ctx = useContext(ProductsContext)
  if (!ctx) throw new Error('useProducts must be used inside ProductsProvider')
  return ctx
}
