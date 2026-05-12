import React, { useState, useMemo, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useProducts } from '../context/ProductsContext'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'
import { useToast } from '../context/ToastContext'
import ProductCard from '../components/ProductCard'
import RecentlyViewedItems, { rememberProductView } from '../components/RecentlyViewedItems'
import { ProductDetailSkeleton } from '../components/ProductSkeleton'
import SubscriptionSheet from '../components/SubscriptionSheet'

function Stars({ rating }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} className={`w-4 h-4 ${i < Math.floor(rating) ? 'text-earth-500' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

export default function ProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { products, loading } = useProducts()
  const { cart, addToCart, updateQuantity, openDrawer } = useCart()
  const { isWishlisted, toggleWishlist } = useWishlist()
  const { addToast } = useToast()

  // Scroll to top whenever the product id changes
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [id])

  const product = products.find((p) => p.id === id)
  const [selectedVariant, setSelectedVariant] = useState(null)

  // Auto-select first variant whenever the product changes
  useEffect(() => {
    if (product?.variants?.length > 0) {
      setSelectedVariant(product.variants[0])
    } else {
      setSelectedVariant(null)
    }
  }, [id, product])
  const [qty, setQty] = useState(1)
  const [showSubSheet, setShowSubSheet] = useState(false)
  const [imgError, setImgError] = useState(false)
  // Image gallery: collect cover + extra images
  const allImages = [
    ...(product?.image && !imgError ? [product.image] : []),
    ...(product?.images || []),
  ].filter(Boolean)
  const [activeImg, setActiveImg] = useState(0)

  const activePrice  = selectedVariant?.price ?? product?.price
  const offerPrice   = !selectedVariant && product?.offer_price ? Number(product.offer_price) : null
  const displayPrice = offerPrice ?? activePrice
  const discountPct  = offerPrice ? Math.round((1 - offerPrice / activePrice) * 100) : 0
  const activeUnit  = selectedVariant?.label ?? product?.unit
  const cartKey     = selectedVariant ? `${id}_${selectedVariant.label}` : id
  const cartItem    = cart.find((i) => i.cartKey === cartKey)
  const wishlisted  = product ? isWishlisted(product.id) : false

  const related = useMemo(() => {
    if (!product) return []
    return products
      .filter((p) => p.category === product.category && p.id !== product.id)
      .slice(0, 4)
  }, [product, products])

  useEffect(() => {
    if (product) rememberProductView(product.id)
  }, [product])

  if (!product) {
    if (loading) return <ProductDetailSkeleton />
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-4 page-enter">
        <p className="text-6xl mb-4">🌿</p>
        <h2 className="text-xl font-bold text-gray-700 mb-2">Product not found</h2>
        <Link to="/" className="btn-primary mt-4 inline-flex">Back to Shop</Link>
      </div>
    )
  }

  const isOutOfStock = product.stock === 0
  const isLowStock   = product.stock > 0 && product.stock <= 5
  const rating       = 4.8

  function handleAddToCart() {
    if (isOutOfStock) return
    addToCart(product, qty, selectedVariant)
    addToast(`${product.name} added to cart!`, 'success')
    openDrawer()
  }

  return (
    <div className="page-enter max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 pb-24 md:pb-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link to="/" className="hover:text-forest-500 transition-colors">Home</Link>
        <span>/</span>
        <Link to={`/?category=${product.category}`} className="hover:text-forest-500 transition-colors capitalize">{product.category}</Link>
        <span>/</span>
        <span className="text-gray-600 font-medium truncate">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* ── Image Gallery (Swiggy-style) ── */}
        <div className="relative select-none">

          {/* Main image */}
          <div className="relative aspect-square rounded-3xl overflow-hidden bg-gray-50 shadow-soft">
            {allImages.length > 0 ? (
              <img
                key={activeImg}
                src={allImages[activeImg]}
                alt={product.name}
                className="w-full h-full object-contain p-4 transition-opacity duration-200"
                loading="lazy"
                onError={() => { setImgError(true); if (activeImg > 0) setActiveImg(0) }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-8xl">{product.emoji || '🌿'}</div>
            )}

            {/* Left / Right arrows — only when multiple images */}
            {allImages.length > 1 && (
              <>
                <button
                  onClick={() => setActiveImg(i => (i - 1 + allImages.length) % allImages.length)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 rounded-full shadow-md flex items-center justify-center hover:bg-white transition"
                >
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/>
                  </svg>
                </button>
                <button
                  onClick={() => setActiveImg(i => (i + 1) % allImages.length)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 rounded-full shadow-md flex items-center justify-center hover:bg-white transition"
                >
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              </>
            )}

            {/* Dot indicators */}
            {allImages.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {allImages.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    className={`rounded-full transition-all duration-200 ${
                      activeImg === i ? 'w-4 h-1.5 bg-forest-500' : 'w-1.5 h-1.5 bg-gray-300'
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Badges */}
            <div className="absolute top-3 left-3 flex flex-col gap-1.5">
              {isOutOfStock && <span className="badge bg-red-500 text-white text-xs">Out of Stock</span>}
              {isLowStock   && <span className="badge bg-earth-500 text-white text-xs stock-low">Only {product.stock} left!</span>}
              {product.featured && <span className="badge bg-earth-500 text-white text-xs">Featured</span>}
            </div>

            {/* Wishlist */}
            <button
              onClick={() => { toggleWishlist(product); addToast(wishlisted ? 'Removed from wishlist' : 'Added to wishlist!', wishlisted ? 'info' : 'success') }}
              className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center shadow-md transition-all duration-200 ${
                wishlisted ? 'bg-rose-500 text-white' : 'bg-white text-gray-400 hover:text-rose-500'
              }`}
            >
              <svg className="w-4 h-4" fill={wishlisted ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
          </div>

          {/* Thumbnail strip below main image — scrollable */}
          {allImages.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
              {allImages.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  className={`flex-shrink-0 w-[72px] h-[72px] rounded-xl overflow-hidden border-2 transition-all duration-200 bg-gray-50 ${
                    activeImg === i
                      ? 'border-forest-500 shadow-md scale-105'
                      : 'border-gray-200 opacity-60 hover:opacity-100 hover:border-gray-300'
                  }`}
                >
                  <img src={src} alt={`View ${i + 1}`} className="w-full h-full object-contain p-1" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <span className="section-subtitle capitalize">{product.category}</span>
          <h1 className="text-3xl font-black text-gray-800 mt-1 mb-2">{product.name}</h1>

          {/* Rating */}
          <div className="flex items-center gap-2 mb-4">
            <Stars rating={rating} />
            <span className="text-sm text-gray-500 font-medium">{rating} · 128 reviews</span>
          </div>

          {/* Price */}
          <div className="mb-5">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-forest-500">₹{displayPrice}</span>
              {offerPrice && <span className="text-xl text-gray-400 line-through">₹{activePrice}</span>}
              <span className="text-gray-400 text-lg">/{activeUnit}</span>
            </div>
            {discountPct > 0 && (
              <span className="inline-block mt-1 text-sm font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full">
                {discountPct}% OFF
              </span>
            )}
          </div>

          {/* Description */}
          <p className="text-gray-600 leading-relaxed mb-6">{product.description}</p>

          {/* Variant selector */}
          {product.variants && product.variants.length > 1 && (
            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-700 mb-2">Choose Size</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button
                    key={v.label}
                    onClick={() => setSelectedVariant(v)}
                    className={`px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all duration-200 ${
                      (selectedVariant?.label ?? product.variants[0].label) === v.label
                        ? 'border-forest-500 bg-forest-500 text-white shadow-forest'
                        : 'border-gray-200 text-gray-600 hover:border-forest-400 hover:text-forest-600'
                    }`}
                  >
                    <span>{v.label}</span>
                    <span className="ml-1.5 opacity-75 text-xs">₹{v.price}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stock indicator */}
          {!isOutOfStock && (
            <div className="flex items-center gap-2 mb-5">
              <div className={`w-2.5 h-2.5 rounded-full ${isLowStock ? 'bg-earth-500 stock-low' : 'bg-forest-500'}`} />
              <span className={`text-sm font-semibold ${isLowStock ? 'text-earth-600' : 'text-forest-600'}`}>
                {isLowStock ? `Only ${product.stock} units left — order soon!` : 'In Stock'}
              </span>
            </div>
          )}

          {/* Subscribe button */}
          {product.subscriptionAvailable && (
            <button
              onClick={() => setShowSubSheet(true)}
              className="w-full mb-5 flex items-center gap-3 bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 hover:border-blue-400 rounded-2xl p-4 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-blue-700">Subscribe & Save</p>
                <p className="text-xs text-blue-500 mt-0.5">Daily, Custom, or Interval delivery. Cancel anytime.</p>
              </div>
              <svg className="w-5 h-5 text-blue-400 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          )}

          {/* Subscription Sheet */}
          {showSubSheet && (
            <SubscriptionSheet
              product={product}
              variant={selectedVariant}
              onClose={() => setShowSubSheet(false)}
              onSuccess={() => addToast('Subscription created! 🎉', 'success')}
            />
          )}

          {/* Quantity + Add to cart */}
          {isOutOfStock ? (
            <div className="flex items-center justify-center py-4 bg-red-50 rounded-xl text-red-400 font-semibold">
              Out of Stock
            </div>
          ) : cartItem ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-forest-50 rounded-xl p-1.5">
                <button onClick={() => updateQuantity(cartKey, cartItem.quantity - 1)} className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center text-forest-600 font-bold hover:bg-red-50 hover:text-red-500 transition-all text-xl">−</button>
                <span className="font-bold text-forest-700 text-lg w-10 text-center">{cartItem.quantity}</span>
                <button
                  onClick={() => updateQuantity(cartKey, cartItem.quantity + 1)}
                  disabled={product.stock > 0 && cartItem.quantity >= product.stock}
                  className="w-10 h-10 rounded-lg bg-forest-500 shadow-sm flex items-center justify-center text-white font-bold hover:bg-forest-600 transition-all text-xl disabled:opacity-40 disabled:cursor-not-allowed"
                >+</button>
              </div>
              <button onClick={openDrawer} className="btn-primary flex-1 flex items-center justify-center gap-2">
                View Cart
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <div className="flex items-center gap-1 border-2 border-gray-200 rounded-xl px-3">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-8 h-10 text-gray-500 font-bold text-xl hover:text-forest-500 transition-colors">−</button>
                <span className="font-bold text-gray-700 w-8 text-center">{qty}</span>
                <button onClick={() => setQty((q) => product.stock > 0 ? Math.min(product.stock, q + 1) : q)} className="w-8 h-10 text-gray-500 font-bold text-xl hover:text-forest-500 transition-colors">+</button>
              </div>
              <button onClick={handleAddToCart} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 5M7 13l1.5 5m7-5l1.5 5M17 18a1 1 0 11-2 0 1 1 0 012 0zM9 18a1 1 0 11-2 0 1 1 0 012 0z" />
                </svg>
                Add to Cart · ₹{displayPrice * qty}
              </button>
            </div>
          )}

          {/* Trust badges */}
          <div className="mt-6 pt-5 border-t border-gray-100 grid grid-cols-3 gap-3">
            {[
              { icon: '🌱', text: 'Chemical Free' },
              { icon: '⚡', text: 'Same-day delivery' },
              { icon: '🔒', text: 'Secure payment' },
            ].map((b) => (
              <div key={b.text} className="flex flex-col items-center gap-1 text-center">
                <span className="text-xl">{b.icon}</span>
                <span className="text-xs text-gray-500 font-medium">{b.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Related products */}
      {related.length > 0 && (
        <section className="mt-14">
          <h2 className="text-2xl font-bold text-gray-800 mb-5">You Might Also Like</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
      <RecentlyViewedItems products={products} excludeId={product.id} />
    </div>
  )
}
