import React, { useState, useMemo, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import HeroSection from '../components/HeroSection'
import WhyChooseUs from '../components/WhyChooseUs'
import HowItWorks from '../components/HowItWorks'
import ReviewsSection from '../components/ReviewsSection'
import ProductCard from '../components/ProductCard'
import TrustBadges from '../components/TrustBadges'
import FreeDeliveryBar from '../components/FreeDeliveryBar'
import RecentlyViewedItems from '../components/RecentlyViewedItems'
import { ProductCardSkeleton } from '../components/ProductSkeleton'
import { useProducts } from '../context/ProductsContext'
import { CATEGORIES as FALLBACK_CATEGORIES } from '../data/products2'
import { useScrollReveal } from '../hooks/useScrollReveal'

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

// Convert backend category (has hex color) to a tailwind-compatible gradient string
function catColor(hex) {
  return hex || '#16a34a'
}

export default function HomePage() {
  useScrollReveal()
  const { products, loading } = useProducts()
  const [searchParams, setSearchParams] = useSearchParams()
  const [backendCats, setBackendCats] = useState(null) // null = not loaded yet

  // Fetch categories from backend; fall back to static list if API fails
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/categories`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data) && data.length) setBackendCats(data) })
      .catch(() => {})
  }, [])

  // Merge backend categories with static fallback for display
  const CATEGORIES = backendCats
    ? [{ id: 'all', label: 'All Products', icon: '🛒', color: 'from-forest-400 to-forest-600', desc: 'Everything fresh' },
       ...backendCats.map(c => ({ id: c.slug, label: c.name, icon: c.emoji, color: null, hexColor: c.color, desc: c.tagline || '' }))]
    : FALLBACK_CATEGORIES

  const [activeCategory, setActiveCategory] = useState('all')

  // Sync active category from URL param (e.g. Footer links use ?category=vegetables)
  useEffect(() => {
    const cat = searchParams.get('category')
    if (cat) {
      setActiveCategory(cat)
      setSearchParams({}, { replace: true }) // clean URL after applying
      // Small delay so the products section renders before we scroll
      setTimeout(() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    }
  }, [searchParams, setSearchParams])
  const [searchQuery, setSearchQuery]       = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [sortBy, setSortBy]                 = useState('default')

  const filteredProducts = useMemo(() => {
    let list = [...products]
    if (activeCategory !== 'all') list = list.filter((p) => p.category === activeCategory)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.category.includes(q)
      )
    }
    switch (sortBy) {
      case 'price-asc':  list.sort((a, b) => a.price - b.price); break
      case 'price-desc': list.sort((a, b) => b.price - a.price); break
      case 'name':       list.sort((a, b) => a.name.localeCompare(b.name)); break
      default:
        list.sort((a, b) => {
          if (a.stock === 0 && b.stock > 0) return 1
          if (b.stock === 0 && a.stock > 0) return -1
          if (a.featured && !b.featured)    return -1
          if (!a.featured && b.featured)    return 1
          return 0
        })
    }
    return list
  }, [products, activeCategory, searchQuery, sortBy])

  const categoryCounts = useMemo(() => {
    const counts = { all: products.length }
    products.forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1 })
    return counts
  }, [products])

  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return { products: [], categories: [] }
    return {
      products: products
        .filter((p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        )
        .slice(0, 6),
      categories: CATEGORIES
        .filter((cat) => cat.id !== 'all' && cat.label.toLowerCase().includes(q))
        .slice(0, 4),
    }
  }, [products, CATEGORIES, searchQuery])

  function selectCategory(id) {
    setActiveCategory(id)
    setSearchQuery('')
    document.getElementById('products')?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }

  function clearFilters() {
    setActiveCategory('all')
    setSearchQuery('')
  }

  return (
    <div className="page-enter">
      <HeroSection />
      <TrustBadges />
      <FreeDeliveryBar />

      {/* ── Category grid ── */}
      <section id="categories" className="py-10 bg-sage-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-7 reveal">
            <span className="section-subtitle">Browse</span>
            <h2 className="section-title">Shop by Category</h2>
          </div>

          {/* Category cards — desktop grid */}
          <div className="hidden md:grid grid-cols-5 gap-3 mb-6">
            {CATEGORIES.filter((c) => c.id !== 'all').map((cat) => {
              const isActive = activeCategory === cat.id
              const accent = cat.hexColor || '#16a34a'
              return (
                <button
                  key={cat.id}
                  onClick={() => selectCategory(cat.id)}
                  className={`group relative bg-white rounded-2xl p-5 text-left transition-all duration-200 border-2 ${
                    isActive
                      ? 'shadow-lg scale-[1.02]'
                      : 'border-gray-100 shadow-sm hover:shadow-md hover:scale-[1.01]'
                  }`}
                  style={{ borderColor: isActive ? accent : undefined }}
                >
                  <p className="font-bold text-gray-800 text-sm leading-tight mb-1">{cat.label}</p>
                  {cat.desc && <p className="text-gray-400 text-[11px] leading-snug">{cat.desc}</p>}
                  <span className="inline-block mt-3 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: accent + '18', color: accent }}>
                    {categoryCounts[cat.id] || 0} items
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Products section ── */}
      <section id="products" className="py-8 bg-sage-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Category pills — always visible above products for easy switching */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => selectCategory(cat.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all border ${
                  activeCategory === cat.id
                    ? 'bg-forest-600 text-white border-forest-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-forest-400'
                }`}
              >
                {cat.label}
                {categoryCounts[cat.id] > 0 && (
                  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    activeCategory === cat.id ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>{categoryCounts[cat.id]}</span>
                )}
              </button>
            ))}
          </div>

          {/* Search + sort bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5 reveal">
            <div className="relative flex-1">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search vegetables, fruits, oils, millets..."
                value={searchQuery}
                onFocus={() => setSuggestionsOpen(true)}
                onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
                onChange={(e) => { setSearchQuery(e.target.value); setSuggestionsOpen(true) }}
                className="input-field pl-10"
              />
              {suggestionsOpen && searchQuery.trim() && (
                <div className="absolute left-0 right-0 top-full mt-2 z-30 bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
                  {searchSuggestions.products.length === 0 && searchSuggestions.categories.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500">No matching products or categories</div>
                  ) : (
                    <>
                      {searchSuggestions.products.map((product) => (
                        <Link
                          key={product.id}
                          to={`/product/${product.id}`}
                          onClick={() => setSuggestionsOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-sage-50 transition-colors"
                        >
                          <div className="w-10 h-10 rounded-xl bg-sage-50 overflow-hidden flex items-center justify-center text-lg flex-shrink-0">
                            {product.image ? <img src={product.image} alt="" className="w-full h-full object-cover" /> : (product.emoji || '🌿')}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-gray-800 truncate">{product.name}</p>
                            <p className="text-xs text-gray-400 capitalize truncate">{product.category} · ₹{product.price}/{product.unit}</p>
                          </div>
                        </Link>
                      ))}
                      {searchSuggestions.categories.length > 0 && (
                        <div className="border-t border-gray-100 py-1">
                          {searchSuggestions.categories.map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { selectCategory(cat.id); setSuggestionsOpen(false) }}
                              className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-sage-50 transition-colors"
                            >
                              <span className="text-sm font-semibold text-gray-700">{cat.label}</span>
                              <span className="text-xs text-gray-400">{categoryCounts[cat.id] || 0} items</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="input-field sm:w-52"
            >
              <option value="default">Featured First</option>
              <option value="price-asc">Price: Low → High</option>
              <option value="price-desc">Price: High → Low</option>
              <option value="name">Name: A → Z</option>
            </select>
          </div>

          {/* Active filters */}
          {(activeCategory !== 'all' || searchQuery) && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {activeCategory !== 'all' && (
                <span className="inline-flex items-center gap-1.5 bg-forest-100 text-forest-700 text-sm font-medium px-3 py-1 rounded-full">
                  {CATEGORIES.find((c) => c.id === activeCategory)?.icon}
                  {CATEGORIES.find((c) => c.id === activeCategory)?.label}
                  <button onClick={() => selectCategory('all')} className="ml-1 hover:text-red-500 transition-colors">✕</button>
                </span>
              )}
              {searchQuery && (
                <span className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-700 text-sm font-medium px-3 py-1 rounded-full">
                  "{searchQuery}"
                  <button onClick={clearFilters} className="ml-1 hover:text-red-500 transition-colors">✕</button>
                </span>
              )}
            </div>
          )}

          {/* Product grid */}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
              {Array.from({ length: 10 }).map((_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-20 h-20 mx-auto rounded-full bg-white flex items-center justify-center mb-4 shadow-card">
                <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="text-gray-600 text-lg font-bold">No products found</p>
              <p className="text-gray-400 text-sm mt-1">Try adjusting your search or category</p>
              <button onClick={clearFilters} className="btn-outline mt-4">Clear Filters</button>
            </div>
          ) : (
            <>
              <p className="text-gray-500 text-sm mb-4 font-medium">
                Showing <span className="text-forest-600 font-bold">{filteredProducts.length}</span> product{filteredProducts.length !== 1 ? 's' : ''}
                {activeCategory !== 'all' && <span className="text-gray-400"> in {CATEGORIES.find((c) => c.id === activeCategory)?.label}</span>}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
                {filteredProducts.map((product, i) => (
                  <div key={product.id} className="product-card-anim" style={{ animationDelay: `${(i % 10) * 40}ms` }}>
                    <ProductCard product={product} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Subscription CTA */}
      <section className="py-12 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 reveal">
          <div className="bg-gradient-to-br from-earth-500 to-earth-600 rounded-3xl p-8 md:p-10 shadow-earth relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/5 rounded-full blur-2xl" />
            <div className="relative flex flex-col md:flex-row items-center gap-6">
              <div className="flex-1">
                <span className="inline-block bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full mb-3">🔄 Subscribe & Save</span>
                <h2 className="text-2xl md:text-3xl font-black text-white mb-2">Never Run Out of Farm-Fresh Goodness</h2>
                <p className="text-white/80 text-sm md:text-base">Choose a daily, weekly or monthly plan — pick your items, subscribe at checkout, and get fresh farm produce delivered on your schedule. Save up to 15%.</p>
                <div className="flex flex-wrap gap-3 mt-4 text-xs text-white/70">
                  <span>✅ Daily plans</span>
                  <span>✅ Weekly bundles</span>
                  <span>✅ Monthly savings</span>
                  <span>✅ Pause anytime</span>
                </div>
              </div>
              <div className="flex-shrink-0">
                <a
                  href="#products"
                  onClick={e => { e.preventDefault(); document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' }) }}
                  className="inline-flex items-center gap-2 bg-white text-earth-600 font-bold px-7 py-3.5 rounded-2xl hover:bg-earth-50 transition-all shadow-lg text-sm whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  Shop & Subscribe
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <WhyChooseUs />
      <HowItWorks />
      <ReviewsSection />
      <RecentlyViewedItems products={products} />

      {/* Contact CTA */}
      <section className="py-14 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center reveal">
          <div className="bg-hero-gradient rounded-3xl p-10 shadow-forest relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/5 rounded-full blur-2xl" />
            <div className="relative">
              <h2 className="text-3xl font-black text-white mb-3">Questions? We're Here!</h2>
              <p className="text-white/80 mb-7 max-w-md mx-auto">
                Our team is available 7AM–8PM daily to help with orders, delivery or anything about our products.
              </p>
              <a
                href="tel:+919346566945"
                className="btn-ripple inline-flex items-center gap-3 bg-white text-forest-600 font-bold px-8 py-4 rounded-2xl hover:bg-sage-50 transition-all shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call +91 9346566945
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
