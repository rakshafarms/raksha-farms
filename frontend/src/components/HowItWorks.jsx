import React from 'react'
import { useScrollReveal } from '../hooks/useScrollReveal'

const steps = [
  {
    step: '01',
    icon: '🔍',
    title: 'Browse & Select',
    desc: 'Explore our range of 22+ organic vegetables, seasonal fruits, and daily groceries. Filter by category or search what you need.',
  },
  {
    step: '02',
    icon: '🛒',
    title: 'Place Your Order',
    desc: 'Add to cart and checkout in under 2 minutes. Pay via Cash on Delivery or UPI — simple, secure, and hassle-free.',
  },
  {
    step: '03',
    icon: '🚚',
    title: 'Fresh at Doorstep',
    desc: 'We harvest and pack your order the same morning. Delivered fresh within hours — straight from farm to your kitchen.',
  },
]

export default function HowItWorks() {
  useScrollReveal()

  return (
    <section className="py-16 bg-gradient-to-br from-green-700 via-green-600 to-emerald-600 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-300/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-14 reveal">
          <span className="inline-block bg-white/15 text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest mb-4 border border-white/20">
            How It Works
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Farm to Table in 3 Easy Steps
          </h2>
          <p className="text-green-200 max-w-xl mx-auto">
            Getting fresh organic produce has never been this simple.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connector lines (desktop only) — left 1/6 to right 1/6 so dots sit centred on the line */}
          <div className="hidden md:block absolute top-16 left-[16.67%] right-[16.67%] h-0.5 bg-white/20 z-0" />

          {steps.map((s, i) => (
            <div
              key={s.step}
              className={`reveal-scale delay-${(i + 1) * 200} relative z-10 text-center`}
            >
              {/* Step number badge */}
              <div className="inline-flex items-center justify-center w-12 h-12 bg-white/15 border-2 border-white/30 rounded-full text-white font-bold text-sm mb-4 backdrop-blur-sm">
                {s.step}
              </div>

              {/* Icon circle */}
              <div className="w-24 h-24 bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl flex items-center justify-center text-5xl mx-auto mb-5 hover:scale-110 transition-transform duration-300 cursor-default">
                {s.icon}
              </div>

              <h3 className="text-xl font-bold text-white mb-3">{s.title}</h3>
              <p className="text-green-200 text-sm leading-relaxed max-w-xs mx-auto">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-14 reveal delay-300">
          <a
            href="#products"
            className="inline-flex items-center gap-3 bg-white text-green-700 font-bold px-8 py-4 rounded-2xl hover:bg-green-50 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-1 btn-ripple"
          >
            <span className="text-xl">🛒</span>
            Start Shopping Now
          </a>
        </div>
      </div>
    </section>
  )
}
