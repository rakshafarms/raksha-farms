import React, { useMemo } from 'react'
import ProductCard from './ProductCard'

export const RECENTLY_VIEWED_KEY = 'rf_recently_viewed'

export function rememberProductView(productId) {
  if (!productId) return
  try {
    const current = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || '[]')
    const next = [productId, ...current.filter(id => id !== productId)].slice(0, 10)
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next))
  } catch { /* ignore bad localStorage */ }
}

export default function RecentlyViewedItems({ products, excludeId = null }) {
  const recentProducts = useMemo(() => {
    let ids = []
    try { ids = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || '[]') } catch { ids = [] }
    return ids
      .filter(id => id !== excludeId)
      .map(id => products.find(p => p.id === id))
      .filter(Boolean)
      .slice(0, 6)
  }, [products, excludeId])

  if (!recentProducts.length) return null

  return (
    <section className="py-10 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">Recently Viewed Items</h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {recentProducts.map(product => (
            <div key={product.id} className="w-44 sm:w-52 flex-shrink-0">
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
