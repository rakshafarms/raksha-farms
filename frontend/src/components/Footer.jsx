import React from 'react'
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="bg-green-950 text-green-100 md:pb-0 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {/* Top wave */}
      <div className="bg-white">
        <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full block">
          <path d="M0 0 Q360 60 720 30 Q1080 0 1440 60 L1440 0 Z" fill="#052e16" />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
                <span className="text-xl">🌿</span>
              </div>
              <div>
                <span className="text-lg font-black text-white tracking-tight">Raksha Farms</span>
                <p className="text-[10px] text-green-400 font-medium">Farm to Doorstep</p>
              </div>
            </div>
            <p className="text-green-300 text-sm leading-relaxed mb-5">
              Bringing the freshness of nature directly to your doorstep.
              100% organic, chemical-free, and always harvested fresh.
            </p>
            {/* Social links */}
            <div className="flex gap-3">
              <SocialLink href="https://instagram.com/rakshafarms" label="Instagram" bg="bg-green-800 hover:bg-pink-600">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </SocialLink>
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-widest">Quick Links</h4>
            <ul className="space-y-2.5 text-sm">
              {[
                { to: '/', label: '🏪 Shop All Products' },
                { to: '/cart', label: '🛒 My Cart' },
                { to: '/my-orders', label: '📦 My Orders' },
                { to: '/login', label: '🔑 Sign In / Sign Up' },
              ].map(({ to, label }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-green-400 hover:text-white transition-colors duration-200 font-medium"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-widest">Contact Us</h4>
            <ul className="space-y-3 text-sm text-green-400">
              <li>
                <a href="tel:+919346566945" className="flex items-start gap-2.5 hover:text-white transition-colors">
                  <span className="text-base mt-0.5">📞</span>
                  <span>+91 9346566945</span>
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-base mt-0.5">📍</span>
                <a
                  href="https://maps.google.com/?q=Plot+159,+Kondapur,+Hyderabad,+Telangana"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors duration-200"
                >
                  Plot 159, Kondapur,<br />Hyderabad, Telangana
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-base mt-0.5">🕐</span>
                <span>Deliveries: 7am – 8pm daily</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Trust badges row */}
        <div className="border-t border-green-900 pt-8 mb-8">
          <div className="flex flex-wrap justify-center gap-6 text-sm text-green-500">
            {[
              { icon: '🌱', text: '100% Organic' },
              { icon: '🛡️', text: 'Quality Guaranteed' },
              { icon: '⚡', text: 'Same Day Delivery' },
              { icon: '🤝', text: 'COD Available' },
              { icon: '🏆', text: '5★ Google Rating' },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-center gap-1.5 font-medium">
                <span>{icon}</span> {text}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-green-900 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-green-600">
          <p>© 2026 Raksha Farms. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Made with <span className="text-red-400 mx-1">❤️</span> for fresh, healthy living
          </p>
        </div>
      </div>
    </footer>
  )
}

function SocialLink({ href, label, bg, children }) {
  return (
    <a
      href={href}
      aria-label={label}
      target="_blank"
      rel="noopener noreferrer"
      className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center text-green-300 hover:text-white transition-all duration-200 transform hover:scale-110`}
    >
      {children}
    </a>
  )
}
