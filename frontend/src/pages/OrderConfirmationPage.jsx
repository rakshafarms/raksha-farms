import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrders } from '../context/OrdersContext'
import { useAuth } from '../context/AuthContext'

const STATUS_CONFIG = {
  pending: {
    icon: '⏳', label: 'Order Received', color: 'text-yellow-600',
    bg: 'bg-yellow-50', border: 'border-yellow-200',
    description: 'Your order has been placed! Our team will call you to confirm the delivery time.',
  },
  placed: {
    icon: '⏳', label: 'Order Placed', color: 'text-yellow-600',
    bg: 'bg-yellow-50', border: 'border-yellow-200',
    description: 'Your order has been placed! Our team will call you to confirm the delivery time.',
  },
  accepted: {
    icon: '✅', label: 'Order Accepted', color: 'text-green-700',
    bg: 'bg-green-50', border: 'border-green-200',
    description: 'Great news! Your order has been accepted and is being prepared for delivery.',
  },
  preparing: {
    icon: '🧑‍🌾', label: 'Being Prepared', color: 'text-blue-600',
    bg: 'bg-blue-50', border: 'border-blue-200',
    description: 'Your fresh produce is being harvested and packed right now!',
  },
  out_for_delivery: {
    icon: '🚚', label: 'Out for Delivery', color: 'text-indigo-600',
    bg: 'bg-indigo-50', border: 'border-indigo-200',
    description: 'Your order is on its way! Our delivery partner will reach you shortly.',
  },
  delivered: {
    icon: '🎉', label: 'Order Delivered', color: 'text-green-700',
    bg: 'bg-green-50', border: 'border-green-200',
    description: 'Your order has been delivered successfully. Enjoy your fresh produce!',
  },
  cancelled: {
    icon: '🚫', label: 'Order Cancelled', color: 'text-gray-600',
    bg: 'bg-gray-50', border: 'border-gray-200',
    description: 'Your order has been cancelled. Please call us at +91 9346566945 if you need help.',
  },
  rejected: {
    icon: '❌', label: 'Order Rejected', color: 'text-red-600',
    bg: 'bg-red-50', border: 'border-red-200',
    description: 'Unfortunately your order could not be fulfilled. Please call us at +91 9346566945 for assistance.',
  },
}

export default function OrderConfirmationPage() {
  const { orderId } = useParams()
  const { getOrder } = useOrders()
  const { isLoggedIn } = useAuth()
  const [showConfetti, setShowConfetti] = useState(true)

  const order = getOrder(orderId)

  useEffect(() => {
    const t = setTimeout(() => setShowConfetti(false), 3000)
    return () => clearTimeout(t)
  }, [])

  if (!order) {
    return (
      <div className="page-enter max-w-md mx-auto px-4 py-24 text-center">
        <div className="text-6xl mb-4">❓</div>
        <h2 className="text-xl font-bold text-gray-700 mb-2">Order not found</h2>
        <p className="text-gray-400 text-sm mb-6">This order may have expired or the link is incorrect.</p>
        <Link to="/" className="btn-primary inline-flex items-center gap-2 mt-4">
          <span>🌿</span> Go Home
        </Link>
      </div>
    )
  }

  const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
  const formattedDate = new Date(order.createdAt).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="page-enter max-w-2xl mx-auto px-4 sm:px-6 py-10">

      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute animate-bounce"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 40}%`,
                animationDelay: `${Math.random() * 1}s`,
                animationDuration: `${1 + Math.random()}s`,
                fontSize: `${16 + Math.random() * 16}px`,
              }}
            >
              {['🌿', '🎉', '✨', '🥦', '🍎', '🌱'][Math.floor(Math.random() * 6)]}
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">
          🎉
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-1">
          Order Placed Successfully!
        </h1>
        <p className="text-gray-500 text-sm">
          Order <span className="font-mono font-semibold text-green-700">#{order.orderId}</span>
          {' '}· {formattedDate}
        </p>
      </div>

      {/* Status card */}
      <div className={`rounded-2xl border-2 p-5 mb-6 ${status.border} ${status.bg}`}>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">{status.icon}</span>
          <h2 className={`font-bold text-lg ${status.color}`}>{status.label}</h2>
        </div>
        <p className="text-gray-600 text-sm">{status.description}</p>
        {order.deliveryTime && (
          <div className="mt-3 flex items-center gap-2 bg-white/60 rounded-xl px-4 py-2.5">
            <span>🕐</span>
            <p className="text-sm font-medium text-gray-700">
              Estimated delivery: <span className="text-green-700">{order.deliveryTime}</span>
            </p>
          </div>
        )}
      </div>

      {/* What happens next */}
      <div className="card p-5 mb-6">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span>📋</span> What Happens Next?
        </h3>
        <div className="space-y-4">
          {[
            {
              icon: '📞',
              title: 'We\'ll call you',
              desc: `Our team will call +91 ${order.customer.phone} to confirm your order and delivery time.`,
            },
            {
              icon: '🚜',
              title: 'Fresh harvest',
              desc: 'Your produce will be freshly harvested and packed the same morning.',
            },
            {
              icon: '🚚',
              title: 'Delivered to your door',
              desc: 'Your order will be delivered the same day between 7am–8pm.',
            },
          ].map((step) => (
            <div key={step.title} className="flex items-start gap-3">
              <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                {step.icon}
              </div>
              <div>
                <p className="font-semibold text-gray-700 text-sm">{step.title}</p>
                <p className="text-gray-400 text-xs mt-0.5">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Order details */}
      <div className="card p-5 mb-6">
        <h3 className="font-bold text-gray-800 mb-4">Order Details</h3>

        {/* Customer info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <InfoRow icon="👤" label="Name" value={order.customer.name} />
          <InfoRow icon="📞" label="Phone" value={`+91 ${order.customer.phone}`} />
          <InfoRow icon="📍" label="Address" value={order.customer.address} className="sm:col-span-2" />
          {order.customer.notes && (
            <InfoRow icon="📝" label="Notes" value={order.customer.notes} className="sm:col-span-2" />
          )}
        </div>

        {/* Items */}
        <div className="border-t pt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Items Ordered</p>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-gray-700">
                  <span>{item.emoji}</span>
                  <span>{item.name}</span>
                  <span className="text-gray-400">× {item.quantity} {item.unit}</span>
                </div>
                <span className="font-semibold text-gray-800">₹{item.price * item.quantity}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="border-t mt-3 pt-3 space-y-1 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Subtotal</span><span>₹{order.subtotal}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Delivery</span>
            <span className={order.deliveryFee === 0 ? 'text-green-600 font-medium' : ''}>
              {order.deliveryFee === 0 ? 'FREE' : `₹${order.deliveryFee}`}
            </span>
          </div>
          <div className="flex justify-between font-bold text-gray-800 text-base border-t pt-2">
            <span>Total</span>
            <span className="text-green-700">₹{order.total}</span>
          </div>
          <div className="flex justify-between text-gray-500 text-xs pt-1">
            <span>Payment Method</span>
            <span>{order.paymentMethod === 'upi' ? '📱 UPI' : '💵 Cash on Delivery'}</span>
          </div>
        </div>
      </div>

      {/* Need help? */}
      <div className="bg-green-50 border border-green-200 rounded-2xl p-5 mb-6 flex items-center gap-4">
        <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
          📞
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-800 text-sm">Need help with your order?</p>
          <p className="text-gray-500 text-xs mt-0.5">Call us anytime between 7am – 8pm daily</p>
        </div>
        <a
          href="tel:+919346566945"
          className="flex-shrink-0 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          📞 Call Us
        </a>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link to="/" className="btn-primary flex-1 flex items-center justify-center gap-2">
          <span>🛒</span> Continue Shopping
        </Link>
        {isLoggedIn ? (
          <Link to="/my-orders" className="btn-secondary flex-1 flex items-center justify-center gap-2">
            <span>📦</span> Track My Order
          </Link>
        ) : (
          <Link to="/login" className="btn-secondary flex-1 flex items-center justify-center gap-2">
            <span>🔑</span> Sign In to Track
          </Link>
        )}
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value, className = '' }) {
  return (
    <div className={`flex items-start gap-2 ${className}`}>
      <span className="text-sm mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className="text-sm text-gray-700">{value}</p>
      </div>
    </div>
  )
}
