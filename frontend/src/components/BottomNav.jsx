import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'
import { useAuth } from '../context/AuthContext'

export default function BottomNav() {
  const { totalItems, openDrawer } = useCart()
  const { wishlist } = useWishlist()
  const { isLoggedIn } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const active = (path) => pathname === path

  function goHome() {
    if (pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      navigate('/')
    }
  }

  function goShop() {
    if (pathname === '/') {
      document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' })
    } else {
      navigate('/')
      setTimeout(() => document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' }), 200)
    }
  }

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-100 shadow-bottom" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="grid grid-cols-5 h-16">
        {/* Home */}
        <NavBtn onClick={goHome} isActive={active('/')} label="Home">
          <svg className="w-5 h-5" fill={active('/') ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active('/') ? 0 : 2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </NavBtn>

        {/* Shop / Categories — never marked active since it's a scroll action, not a route */}
        <NavBtn onClick={goShop} isActive={false} label="Shop">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        </NavBtn>

        {/* Cart — centre, prominent */}
        <div className="flex items-center justify-center">
          <button
            onClick={openDrawer}
            className="relative -mt-5 w-14 h-14 bg-forest-500 rounded-full shadow-forest flex items-center justify-center text-white transition-all active:scale-95"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 5M7 13l1.5 5m7-5l1.5 5M17 18a1 1 0 11-2 0 1 1 0 012 0zM9 18a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-earth-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {totalItems > 9 ? '9+' : totalItems}
              </span>
            )}
          </button>
        </div>

        {/* Wishlist */}
        <NavItem to="/wishlist" isActive={active('/wishlist')} label="Wishlist">
          <div className="relative">
            <svg className="w-5 h-5" fill={active('/wishlist') ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            {wishlist.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                {wishlist.length > 9 ? '9+' : wishlist.length}
              </span>
            )}
          </div>
        </NavItem>

        {/* Profile */}
        <NavItem to={isLoggedIn ? '/profile' : '/login'} isActive={active('/profile')} label="Profile">
          <svg className="w-5 h-5" fill={active('/profile') ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </NavItem>
      </div>
    </nav>
  )
}

function NavItem({ to, isActive, label, children }) {
  return (
    <Link
      to={to}
      className={`bottom-nav-item flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
        isActive ? 'text-forest-500 active' : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      {children}
      <span>{label}</span>
    </Link>
  )
}

function NavBtn({ onClick, isActive, label, children }) {
  return (
    <button
      onClick={onClick}
      className={`bottom-nav-item flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors w-full ${
        isActive ? 'text-forest-500 active' : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}
