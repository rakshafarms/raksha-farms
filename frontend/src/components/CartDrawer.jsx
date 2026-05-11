import React, { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { calcDelivery, FREE_DELIVERY_THRESHOLD } from '../utils/constants'

export default function CartDrawer() {
  const { cart, totalItems, totalPrice, removeFromCart, updateQuantity, clearCart, drawerOpen, closeDrawer } = useCart()
  const navigate = useNavigate()
  const panelRef = useRef(null)
  const deliveryFee = calcDelivery(totalPrice)
  const finalTotal  = totalPrice + deliveryFee
  const progress    = Math.min((totalPrice / FREE_DELIVERY_THRESHOLD) * 100, 100)
  const remaining   = FREE_DELIVERY_THRESHOLD - totalPrice

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') closeDrawer() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeDrawer])

  if (!drawerOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm cart-drawer-overlay"
        onClick={closeDrawer}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-sm bg-white h-full shadow-drawer cart-drawer-panel flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-gray-800 text-lg">My Cart</h2>
            {totalItems > 0 && (
              <span className="bg-forest-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {totalItems}
              </span>
            )}
          </div>
          <button
            onClick={closeDrawer}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Empty state */}
        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="w-20 h-20 rounded-full bg-sage-50 flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13l2.5 5m7-5l2.5 5M17 18a1 1 0 11-2 0 1 1 0 012 0zM9 18a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
            </div>
            <p className="font-semibold text-gray-600 mb-1">Your cart is empty</p>
            <p className="text-gray-400 text-sm mb-5">Add fresh produce from our farm!</p>
            <button
              onClick={closeDrawer}
              className="btn-primary text-sm px-6 py-2.5"
            >
              Continue Shopping
            </button>
          </div>
        ) : (
          <>
            {/* Free delivery bar */}
            <div className="px-5 py-3 bg-sage-50 border-b border-gray-100">
              {totalPrice >= FREE_DELIVERY_THRESHOLD ? (
                <div className="flex items-center gap-2 text-forest-600">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-semibold">You've unlocked FREE delivery!</span>
                </div>
              ) : (
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-500">Add <strong className="text-forest-600">₹{remaining}</strong> for free delivery</span>
                    <span className="text-gray-400 font-medium">₹{totalPrice}/₹{FREE_DELIVERY_THRESHOLD}</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-forest-500 rounded-full delivery-bar transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {cart.map((item) => (
                <CartItem
                  key={item.cartKey}
                  item={item}
                  onRemove={() => removeFromCart(item.cartKey)}
                  onQtyChange={(qty) => updateQuantity(item.cartKey, qty)}
                  onNavigate={closeDrawer}
                />
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-5 py-4 bg-white space-y-3">
              {/* Price summary */}
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal ({totalItems} items)</span>
                  <span>₹{totalPrice}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Delivery</span>
                  <span className={deliveryFee === 0 ? 'text-forest-600 font-semibold' : ''}>
                    {deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-gray-800 text-base border-t pt-2">
                  <span>Total</span>
                  <span className="text-forest-500">₹{finalTotal}</span>
                </div>
              </div>

              {/* Actions */}
              <button
                onClick={() => { closeDrawer(); navigate('/checkout') }}
                className="btn-ripple w-full py-3.5 bg-forest-500 hover:bg-forest-600 text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-forest"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
                Proceed to Checkout · ₹{finalTotal}
              </button>
              <button
                onClick={() => { closeDrawer(); navigate('/cart') }}
                className="w-full py-2.5 text-sm text-forest-500 font-medium hover:bg-sage-50 rounded-xl transition-colors"
              >
                View full cart
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CartItem({ item, onRemove, onQtyChange, onNavigate }) {
  return (
    <div className="flex gap-3 py-2">
      {/* Image — tapping navigates to product page */}
      <Link to={`/product/${item.id}`} onClick={onNavigate}
        className="w-16 h-16 rounded-xl overflow-hidden bg-sage-50 flex-shrink-0 hover:opacity-90 transition-opacity">
        {item.image ? (
          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl">
            {item.emoji || '🛒'}
          </div>
        )}
      </Link>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <Link to={`/product/${item.id}`} onClick={onNavigate}
          className="font-semibold text-gray-800 text-sm leading-tight truncate hover:text-forest-600 transition-colors block">
          {item.name}
        </Link>
        <p className="text-gray-400 text-xs mt-0.5">{item.unit}</p>
        <div className="flex items-center justify-between mt-2">
          {/* Qty stepper */}
          <div className="flex flex-col items-start gap-0.5">
            <div className="flex items-center gap-1 bg-sage-50 rounded-lg p-0.5">
              <button
                onClick={() => onQtyChange(item.quantity - 1)}
                className="w-7 h-7 rounded-md bg-white shadow-sm flex items-center justify-center text-forest-600 font-bold hover:bg-red-50 hover:text-red-500 transition-all text-sm"
              >
                −
              </button>
              <span className="w-6 text-center font-bold text-gray-700 text-sm">{item.quantity}</span>
              <button
                onClick={() => onQtyChange(item.quantity + 1)}
                disabled={item.stock > 0 && item.quantity >= item.stock}
                className="w-7 h-7 rounded-md bg-forest-500 shadow-sm flex items-center justify-center text-white font-bold hover:bg-forest-600 transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
            {item.stock > 0 && item.quantity >= item.stock && (
              <span className="text-[10px] text-orange-500 font-medium pl-0.5">Max {item.stock} available</span>
            )}
          </div>
          {/* Price + remove */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-forest-500 text-sm">₹{item.price * item.quantity}</span>
            <button
              onClick={() => onRemove()}
              className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
