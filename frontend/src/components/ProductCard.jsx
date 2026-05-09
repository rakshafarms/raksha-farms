import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'
import { useToast } from '../context/ToastContext'

function Stars({ rating = 4.8 }) {
  const full = Math.floor(rating)
  const hasHalf = rating % 1 >= 0.5
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < full
        const half   = !filled && hasHalf && i === full
        return (
          <svg key={i} className={`w-3 h-3 ${filled || half ? 'text-earth-500' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        )
      })}
    </div>
  )
}

function seededRating(id) {
  const seed = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return [4.7, 4.8, 4.9, 5.0, 4.6, 4.8, 4.9, 4.7, 5.0, 4.8][seed % 10]
}

export default function ProductCard({ product }) {
  const { cart, addToCart, updateQuantity, openDrawer } = useCart()
  const { isWishlisted, toggleWishlist } = useWishlist()
  const { addToast } = useToast()
  const [adding, setAdding]               = useState(false)
  const [wishlisting, setWishlisting]     = useState(false)
  const [notifySubmitted, setNotifySubmitted] = useState(false)
  const [imgError, setImgError]           = useState(false)

  const [selectedVariant, setSelectedVariant] = useState(
    product.variants ? product.variants[0] : null
  )

  const activePrice    = selectedVariant ? selectedVariant.price : product.price
  const offerPrice     = !selectedVariant && product.offer_price ? Number(product.offer_price) : null
  const displayPrice   = offerPrice ?? activePrice
  const discountPct    = offerPrice ? Math.round((1 - offerPrice / activePrice) * 100) : 0
  const activeUnit  = selectedVariant ? selectedVariant.label : product.unit
  // Short unit for price display — strip parenthetical details e.g. "1kg (4-6 pcs)" → "1kg"
  const displayUnit = activeUnit?.split('(')[0].trim() || activeUnit
  const cartKey     = selectedVariant ? `${product.id}_${selectedVariant.label}` : product.id
  const cartItem    = cart.find((item) => item.cartKey === cartKey)

  const isOutOfStock = product.stock === 0
  const isLowStock   = product.stock > 0 && product.stock <= 5
  const wishlisted   = isWishlisted(product.id)
  const rating       = seededRating(product.id)

  function handleAdd() {
    if (isOutOfStock) return
    setAdding(true)
    addToCart(product, 1, selectedVariant)
    addToast(`${product.name} added to cart!`, 'success')
    setTimeout(() => setAdding(false), 500)
  }

  function handleWishlist(e) {
    e.preventDefault()
    e.stopPropagation()
    setWishlisting(true)
    toggleWishlist(product)
    addToast(wishlisted ? `Removed from wishlist` : `${product.name} wishlisted!`, wishlisted ? 'info' : 'success')
    setTimeout(() => setWishlisting(false), 300)
  }

  function handleNotifyMe(e) {
    e.preventDefault()
    setNotifySubmitted(true)
    addToast("We'll notify you when this is back in stock!", 'success')
  }

  function increment() {
    if (cartItem && cartItem.quantity >= product.stock) {
      addToast('Maximum available stock reached', 'warning')
      return
    }
    updateQuantity(cartKey, (cartItem?.quantity || 0) + 1)
  }
  function decrement() {
    updateQuantity(cartKey, (cartItem?.quantity || 0) - 1)
  }

  // On mobile show max 3 variants to avoid card height explosion
  const visibleVariants = product.variants?.slice(0, 3) || []

  return (
    <div className={`card group flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-soft active:scale-[0.98] ${isOutOfStock ? 'opacity-80' : ''}`}>
      {/* Image */}
      <Link to={`/product/${product.id}`} className="block relative overflow-hidden bg-sage-50 h-36 sm:h-44">
        {product.image && !imgError ? (
          <img
            src={product.image}
            alt={product.name}
            className={`w-full h-full object-cover transition-transform duration-500 ${!isOutOfStock ? 'group-hover:scale-110' : ''}`}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-sage-50 to-sage-100">
            <span className="text-5xl">{product.emoji || '🌿'}</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Status badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {isOutOfStock && (
            <span className="badge bg-red-500 text-white text-[10px] shadow-sm">Out of Stock</span>
          )}
          {isLowStock && (
            <span className="badge bg-earth-500 text-white text-[10px] shadow-sm stock-low">
              Only {product.stock} left!
            </span>
          )}
          {product.featured && !isOutOfStock && !isLowStock && (
            <span className="badge bg-earth-500 text-white text-[10px] shadow-sm">Featured</span>
          )}
          {product.subscriptionAvailable && (
            <span className="badge bg-forest-500 text-white text-[10px] shadow-sm">Subscribe</span>
          )}
        </div>

        {/* Organic badge */}
        {!isOutOfStock && (
          <div className="absolute top-2 right-2">
            <span className="organic-badge inline-flex items-center gap-0.5 bg-forest-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Organic
            </span>
          </div>
        )}

        {/* Wishlist — always visible on mobile, hover-only on desktop */}
        <button
          onClick={handleWishlist}
          className={`absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 shadow-sm ${
            wishlisted
              ? 'bg-rose-500 text-white'
              : 'bg-white/90 text-gray-500 md:opacity-0 md:group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-500'
          } ${wishlisting ? 'heart-pop' : ''}`}
          aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <svg className="w-4 h-4" fill={wishlisted ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
      </Link>

      {/* Content */}
      <div className="p-2.5 sm:p-3.5 flex flex-col flex-1">
        {/* Rating */}
        <div className="flex items-center gap-1 mb-1">
          <Stars rating={rating} />
          <span className="text-[10px] text-gray-400 font-medium">({rating.toFixed(1)})</span>
        </div>

        {/* Name */}
        <Link to={`/product/${product.id}`} className="font-bold text-gray-800 text-sm leading-tight mb-0.5 hover:text-forest-500 transition-colors line-clamp-1">
          {product.name}
        </Link>

        {/* Description — 1 line on mobile, 2 on desktop */}
        <p className="text-gray-400 text-xs mb-2 leading-relaxed line-clamp-1 sm:line-clamp-2 flex-1">
          {product.description}
        </p>

        {/* Variant selector — single row, no wrapping */}
        {visibleVariants.length > 1 && (
          <div className="flex gap-1 mb-2 overflow-x-auto scrollbar-hide">
            {visibleVariants.map((v) => (
              <button
                key={v.label}
                onClick={() => setSelectedVariant(v)}
                className={`flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full border transition-all duration-150 min-h-0 ${
                  selectedVariant?.label === v.label
                    ? 'bg-forest-500 text-white border-forest-500'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-forest-400 hover:text-forest-600'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}

        {/* Price + stock */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex flex-col min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-forest-500 font-black text-lg sm:text-xl flex-shrink-0">₹{displayPrice}</span>
              {offerPrice && <span className="text-gray-400 text-xs line-through flex-shrink-0">₹{activePrice}</span>}
              <span className="text-gray-400 text-[10px] truncate">/{displayUnit}</span>
            </div>
            {discountPct > 0 && (
              <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full w-fit mt-0.5">
                {discountPct}% OFF
              </span>
            )}
          </div>
          {!isOutOfStock && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
              isLowStock ? 'bg-earth-50 text-earth-600' : 'bg-sage-50 text-gray-500'
            }`}>
              {isLowStock ? `${product.stock} left` : 'In Stock'}
            </span>
          )}
        </div>

        {/* Cart control */}
        {isOutOfStock ? (
          notifySubmitted ? (
            <div className="flex items-center justify-center gap-1.5 py-2.5 bg-forest-50 rounded-xl text-forest-600 text-xs font-semibold min-h-[44px]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              We'll notify you!
            </div>
          ) : (
            <button
              onClick={handleNotifyMe}
              className="w-full py-2.5 rounded-xl text-xs font-bold border-2 border-earth-400 text-earth-500 hover:bg-earth-50 active:scale-95 transition-all duration-200 flex items-center justify-center gap-1.5 min-h-[44px]"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Notify Me
            </button>
          )
        ) : cartItem ? (
          <div className="flex items-center justify-between bg-forest-50 rounded-xl p-1 min-h-[44px]">
            <button
              onClick={decrement}
              className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-forest-600 font-bold hover:bg-red-50 hover:text-red-500 active:scale-90 transition-all duration-200 text-lg leading-none"
            >
              −
            </button>
            <span className="font-bold text-forest-700 text-base">
              {cartItem.quantity} <span className="text-xs font-normal text-gray-400">{activeUnit}</span>
            </span>
            <button
              onClick={increment}
              disabled={product.stock > 0 && cartItem.quantity >= product.stock}
              className="w-9 h-9 rounded-lg bg-forest-500 shadow-sm flex items-center justify-center text-white font-bold hover:bg-forest-600 active:scale-90 transition-all duration-200 text-lg leading-none disabled:opacity-40 disabled:cursor-not-allowed"
            >
              +
            </button>
          </div>
        ) : (
          <button
            onClick={handleAdd}
            className={`btn-ripple w-full py-2.5 rounded-xl text-sm font-bold transition-all duration-200 flex items-center justify-center gap-1.5 min-h-[44px] active:scale-95 ${
              adding
                ? 'bg-forest-600 text-white scale-95'
                : 'bg-forest-500 hover:bg-forest-600 text-white shadow-sm hover:shadow-forest'
            }`}
          >
            {adding ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Added!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Add to Cart
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
