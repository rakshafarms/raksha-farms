import React, { createContext, useContext, useState, useEffect } from 'react'
import { INITIAL_PRODUCTS } from '../data/products2'

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const API_URL = `${BACKEND_URL}/api/products`

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

  // Fetch from backend on mount. Fall back to static data ONLY if the network fails.
  useEffect(() => {
    fetch(`${API_URL}?limit=200`)
      .then(r => {
        if (!r.ok) throw new Error('API error')
        return r.json()
      })
      .then(data => {
        // Always replace state with whatever the DB returned — including an empty array.
        // An empty array means the admin removed all products; respect that.
        const apiProducts = Array.isArray(data.products) ? data.products : []
        const normalized = apiProducts.map(p => ({
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
          organic:     true,
          rating:      4.7,
          reviews:     42,
          variants:    Array.isArray(p.variants) ? p.variants : [],
          // Apply the same URL normalisation to every gallery image
          images:      Array.isArray(p.images)
            ? p.images.map(normalizeImg).filter(Boolean)
            : [],
        }))
        setProducts(normalized)
      })
      .catch(() => {
        // Backend unreachable (offline / deploy down) — fall back to bundled static data
        // so the app stays usable offline. This is the ONLY place static data is used.
        setProducts(INITIAL_PRODUCTS)
      })
      .finally(() => setLoading(false))
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
