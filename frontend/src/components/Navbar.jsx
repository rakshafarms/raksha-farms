import React, { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'
import { useAuth } from '../context/AuthContext'

const announcements = [
  '🌱 100% Organic & Pesticide Free — Straight from our farms',
  '⚡ Same-day delivery in Hyderabad for orders before 12 PM',
  '🌿 Freshly harvested daily — no cold storage',
  '💰 Direct from farm — no middlemen, honest prices',
  '📞 Call us: +91 9346566945 (7AM–8PM)',
  '🚚 Free delivery on orders above ₹500',
]

export default function Navbar() {
  const { totalItems, openDrawer }  = useCart()
  const { wishlist }                = useWishlist()
  const { user, logout, isLoggedIn } = useAuth()
  const location  = useLocation()
  const navigate  = useNavigate()
  const [scrolled, setScrolled]         = useState(false)
  const [menuOpen, setMenuOpen]         = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen]     = useState(false)
  const [searchQuery, setSearchQuery]   = useState('')
  const [cartBump, setCartBump]         = useState(false)
  const userMenuRef = useRef(null)
  const searchRef   = useRef(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
    setUserMenuOpen(false)
    setSearchOpen(false)
  }, [location])

  useEffect(() => {
    function handleClick(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    function handleCartBump() {
      setCartBump(true)
      window.setTimeout(() => setCartBump(false), 650)
    }
    window.addEventListener('rf:cart-bump', handleCartBump)
    return () => window.removeEventListener('rf:cart-bump', handleCartBump)
  }, [])

  function handleSearch(e) {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/?q=${encodeURIComponent(searchQuery.trim())}`)
      setSearchOpen(false)
      setSearchQuery('')
    }
  }

  const marqueeItems = [...announcements, ...announcements]

  return (
    <>
      <header className="sticky top-0 z-50">
        {/* Announcement bar */}
        <div className="bg-forest-500 text-white text-xs overflow-hidden">
          <div className="py-2 relative">
            <div className="marquee-track whitespace-nowrap">
              {marqueeItems.map((msg, i) => (
                <span key={i} className="inline-flex items-center mr-12 font-medium">
                  {msg}
                  {i !== marqueeItems.length - 1 && <span className="mx-6 text-forest-300">•</span>}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Main nav */}
        <nav className={`transition-all duration-300 bg-white ${
          scrolled ? 'shadow-md' : 'shadow-sm border-b border-gray-100'
        }`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">

              {/* Logo */}
              <Link to="/" className="flex items-center flex-shrink-0 group">
                <img
                  src="/logo.png"
                  alt="Raksha Farms"
                  className="h-9 sm:h-11 w-auto object-contain group-hover:scale-105 transition-transform duration-300"
                />
              </Link>

              {/* Desktop nav links */}
              <div className="hidden md:flex items-center gap-6">
                <NavLink to="/" active={location.pathname === '/' && location.hash !== '#categories'}>Shop</NavLink>
                <NavLink to="/#categories" active={location.hash === '#categories'}>Categories</NavLink>
                <NavLink to="/wishlist" active={location.pathname === '/wishlist'}>
                  Wishlist
                  {wishlist.length > 0 && (
                    <span className="ml-1.5 bg-rose-100 text-rose-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{wishlist.length}</span>
                  )}
                </NavLink>
                {isLoggedIn && <NavLink to="/my-orders" active={location.pathname === '/my-orders'}>My Orders</NavLink>}
              </div>

              {/* Right side */}
              <div className="flex items-center gap-2">
                {/* Phone (desktop) */}
                <a href="tel:+919346566945" className="hidden lg:flex items-center gap-1.5 text-sm text-gray-500 hover:text-forest-500 transition-colors font-medium">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>9346566945</span>
                </a>

                {/* Cart button — badge is a sibling (not child) so btn-ripple overflow:hidden can't clip it */}
                <div className="relative">
                  <button
                    onClick={openDrawer}
                    className={`btn-ripple flex items-center gap-2 bg-forest-500 hover:bg-forest-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 shadow-sm hover:shadow-forest ${cartBump ? 'cart-bump' : ''}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 5M7 13l1.5 5m7-5l1.5 5M17 18a1 1 0 11-2 0 1 1 0 012 0zM9 18a1 1 0 11-2 0 1 1 0 012 0z" />
                    </svg>
                    <span className="hidden sm:inline">Cart</span>
                  </button>
                  {totalItems > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[11px] font-black rounded-full min-w-[22px] h-[22px] px-1 flex items-center justify-center ring-2 ring-white shadow-md pointer-events-none">
                      {totalItems > 99 ? '99+' : totalItems}
                    </span>
                  )}
                </div>

                {/* User menu */}
                {isLoggedIn ? (
                  <div className="relative" ref={userMenuRef}>
                    <button
                      onClick={() => setUserMenuOpen((v) => !v)}
                      className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-xl hover:bg-sage-50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-forest-400 to-forest-600 flex items-center justify-center text-white font-bold text-sm overflow-hidden flex-shrink-0 relative">
                        {user?.name?.[0]?.toUpperCase()}
                        {user?.avatar && (
                          <img
                            src={user.avatar}
                            alt={user.name}
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none' }}
                          />
                        )}
                      </div>
                      <span className="hidden sm:block text-sm font-semibold text-gray-700 min-w-[80px] max-w-[120px] truncate">
                        {user?.name?.split(' ')[0]}
                      </span>
                      <svg className={`w-3 h-3 text-gray-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {userMenuOpen && (
                      <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-soft border border-gray-100 overflow-hidden animate-slide-up z-50">
                        <div className="px-4 py-3 border-b border-gray-50">
                          <p className="font-semibold text-gray-800 text-sm truncate">{user?.name}</p>
                          <p className="text-gray-400 text-xs truncate">{user?.email}</p>
                        </div>
                        <div className="py-1">
                          <DropdownItem to="/profile">Profile</DropdownItem>
                          <DropdownItem to="/my-orders">My Orders</DropdownItem>
                          <DropdownItem to="/wishlist">Wishlist {wishlist.length > 0 && `(${wishlist.length})`}</DropdownItem>
                        </div>
                        <div className="border-t border-gray-50 py-1">
                          <button
                            onClick={() => { logout(); navigate('/') }}
                            className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 font-medium transition-colors"
                          >
                            Sign Out
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    to="/login"
                    className="hidden md:flex items-center gap-1.5 text-sm font-bold text-forest-500 hover:text-forest-600 border border-forest-200 hover:border-forest-400 px-4 py-2 rounded-xl transition-all"
                  >
                    Sign In
                  </Link>
                )}

                {/* Mobile hamburger */}
                <button
                  className="md:hidden p-2 rounded-xl hover:bg-sage-50 text-gray-600 transition-colors"
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {menuOpen
                      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                    }
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Mobile menu */}
          {menuOpen && (
            <div className="md:hidden bg-white border-t border-green-100 px-4 py-3 space-y-1 animate-slide-up shadow-soft">
              {isLoggedIn && (
                <div className="flex items-center gap-3 px-3 py-2.5 mb-1 bg-sage-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-forest-400 to-forest-600 flex items-center justify-center text-white font-bold text-sm">
                    {user?.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{user?.name}</p>
                    <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                  </div>
                </div>
              )}
              <MobileNavLink to="/">Shop</MobileNavLink>
              <MobileNavLink to="/wishlist">Wishlist {wishlist.length > 0 && `(${wishlist.length})`}</MobileNavLink>
              {isLoggedIn ? (
                <>
                  <MobileNavLink to="/profile">Profile</MobileNavLink>
                  <MobileNavLink to="/my-orders">My Orders</MobileNavLink>
                  <button
                    onClick={() => { logout(); navigate('/') }}
                    className="block w-full text-left px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-50 font-medium text-sm transition-colors"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <MobileNavLink to="/login">Sign In / Sign Up</MobileNavLink>
              )}
              <div className="pt-2 border-t border-gray-100 mt-2">
                <a href="tel:+919346566945" className="block px-3 py-2.5 text-sm text-gray-500 font-medium">
                  📞 +91 9346566945
                </a>
              </div>
            </div>
          )}
        </nav>
      </header>
    </>
  )
}

function NavLink({ to, active, children }) {
  return (
    <Link
      to={to}
      className={`text-sm font-semibold transition-colors duration-200 ${
        active ? 'text-forest-500 border-b-2 border-forest-500 pb-0.5' : 'text-gray-600 hover:text-forest-500'
      }`}
    >
      {children}
    </Link>
  )
}

function MobileNavLink({ to, children }) {
  return (
    <Link to={to} className="block px-3 py-2.5 rounded-xl text-gray-700 hover:bg-sage-50 hover:text-forest-600 font-medium text-sm transition-colors">
      {children}
    </Link>
  )
}

function DropdownItem({ to, children }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-sage-50 hover:text-forest-600 font-medium transition-colors">
      {children}
    </Link>
  )
}
