import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useProducts } from '../context/ProductsContext'
import { useToast } from '../context/ToastContext'
import { calcDelivery } from '../utils/constants'

export default function CartPage() {
  const { cart, removeFromCart, updateQuantity, totalPrice, clearCart } = useCart()
  const { products } = useProducts()
  const { addToast } = useToast()
  const navigate = useNavigate()

  if (cart.length === 0) {
    return (
      <div className="page-enter max-w-2xl mx-auto px-4 py-24 text-center">
        <div className="text-7xl mb-6">🛒</div>
        <h2 className="text-2xl font-bold text-gray-700 mb-2">Your cart is empty</h2>
        <p className="text-gray-400 mb-8">
          Add some fresh vegetables, fruits, or groceries to get started!
        </p>
        <Link to="/" className="btn-primary inline-flex items-center gap-2">
          <span>🌿</span> Browse Products
        </Link>
      </div>
    )
  }

  const deliveryFee = calcDelivery(totalPrice)
  const finalTotal = totalPrice + deliveryFee

  return (
    <div className="page-enter max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">My Cart 🛒</h1>
          <p className="text-gray-400 text-sm mt-0.5">{cart.length} item{cart.length !== 1 ? 's' : ''} in your cart</p>
        </div>
        <button
          onClick={() => { clearCart(); addToast('Cart cleared', 'info') }}
          className="text-sm text-red-400 hover:text-red-600 font-medium transition-colors"
        >
          Clear All
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Items list */}
        <div className="lg:col-span-2 space-y-3">
          {cart.map((item) => {
            const product = products.find((p) => p.id === item.id)
            const maxStock = product ? product.stock : 999
            return (
              <CartItemRow
                key={item.cartKey || item.id}
                item={item}
                maxStock={maxStock}
                onUpdateQty={(qty) => {
                  if (qty > maxStock) {
                    addToast(`Only ${maxStock} units available for ${item.name}`, 'warning')
                    return
                  }
                  updateQuantity(item.cartKey || item.id, qty)
                }}
                onRemove={() => {
                  removeFromCart(item.cartKey || item.id)
                  addToast(`${item.name} removed from cart`, 'info')
                }}
              />
            )
          })}

          <Link
            to="/"
            className="flex items-center gap-2 text-green-600 hover:text-green-700 text-sm font-medium mt-2 group"
          >
            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Continue Shopping
          </Link>
        </div>

        {/* Order summary */}
        <div className="lg:col-span-1">
          <div className="card p-5 sticky top-20">
            <h3 className="font-bold text-gray-800 text-lg mb-4">Order Summary</h3>

            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal ({cart.length} items)</span>
                <span>₹{totalPrice}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Delivery Fee</span>
                <span>{deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}</span>
              </div>
              <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-gray-800 text-base">
                <span>Total</span>
                <span className="text-green-700">₹{finalTotal}</span>
              </div>
            </div>

            <button
              onClick={() => navigate('/checkout')}
              className="w-full btn-primary flex items-center justify-center gap-2"
            >
              <span>🛍️</span> Proceed to Checkout
            </button>

            {/* Trust signals */}
            <div className="mt-4 space-y-1.5">
              {[
                '✅ Fresh produce guaranteed',
                '🔒 Secure & trusted checkout',
                '🚚 Same-day delivery',
              ].map((text) => (
                <p key={text} className="text-xs text-gray-400">{text}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CartItemRow({ item, maxStock, onUpdateQty, onRemove }) {
  const atMax = item.quantity >= maxStock

  return (
    <div className="card p-4 flex items-center gap-4">
      {/* Emoji */}
      <div className="w-14 h-14 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0 text-3xl">
        {item.emoji}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-gray-800 text-sm truncate">{item.name}</h4>
        <p className="text-green-600 text-sm font-medium">₹{item.price}/{item.unit}</p>
        <p className="text-gray-400 text-xs">
          Subtotal: <span className="text-gray-700 font-semibold">₹{item.price * item.quantity}</span>
        </p>
        {atMax && (
          <p className="text-orange-500 text-xs mt-0.5">Max stock reached</p>
        )}
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onUpdateQty(item.quantity - 1)}
          className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-gray-600 font-bold transition-colors text-lg leading-none"
        >
          −
        </button>
        <span className="w-8 text-center font-semibold text-gray-800">
          {item.quantity}
        </span>
        <button
          onClick={() => onUpdateQty(item.quantity + 1)}
          disabled={atMax}
          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold transition-colors text-lg leading-none ${
            atMax
              ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
              : 'bg-gray-100 hover:bg-green-50 hover:text-green-600 text-gray-600'
          }`}
        >
          +
        </button>
      </div>

      {/* Remove — always visible (mobile-friendly) */}
      <button
        onClick={() => onRemove()}
        className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
        aria-label="Remove item"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  )
}
