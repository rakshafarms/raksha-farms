'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse,
  Users, Tag, RefreshCw, BarChart2, Settings, LogOut, Leaf, Grid3X3, X,
  ChevronLeft, ChevronRight
} from 'lucide-react'
import Cookies from 'js-cookie'

const nav = [
  { label:'Dashboard',     href:'/',                      icon: LayoutDashboard },
  { label:'Orders',        href:'/orders',                icon: ShoppingCart },
  { label:'Products',      href:'/products',              icon: Package },
  { label:'Categories',    href:'/categories',            icon: Grid3X3 },
  { label:'Inventory',     href:'/inventory',             icon: Warehouse },
  { label:'Customers',     href:'/customers',             icon: Users },
  { label:'Coupons',       href:'/coupons',               icon: Tag },
  { label:'Sub Overview',   href:'/subscription-plans', icon: BarChart2  },
  { label:'Subscriptions',  href:'/subscriptions',        icon: RefreshCw },
  { label:'Analytics',     href:'/analytics',             icon: BarChart2 },
  { label:'Settings',      href:'/settings',              icon: Settings },
]

export default function Sidebar({ mobileOpen = true, onClose, collapsed = false, onToggleCollapse }) {
  const path = usePathname()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  function doLogout() {
    Cookies.remove('admin_token')
    localStorage.removeItem('admin_token')
    window.location.href = '/login'
  }

  function handleLinkClick() {
    // Close sidebar on mobile after navigation
    if (onClose) onClose()
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 ${collapsed ? 'md:w-20' : 'md:w-64'} w-64 bg-[#1B4332] text-white flex flex-col z-50
        transition-all duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
      `}>
        {/* Logo + Close button */}
        <div className={`flex items-center gap-3 ${collapsed ? 'md:px-4' : 'md:px-6'} px-6 py-5 border-b border-white/10`}>
          <div className="w-9 h-9 bg-[#D97706] rounded-xl flex items-center justify-center flex-shrink-0">
            <Leaf size={18} className="text-white" />
          </div>
          <div className={`flex-1 min-w-0 ${collapsed ? 'md:hidden' : ''}`}>
            <p className="font-bold text-base leading-none">Raksha Farms</p>
            <p className="text-xs text-green-300 mt-0.5">Admin Panel</p>
          </div>
          <button
            onClick={onToggleCollapse}
            className="hidden md:flex p-1.5 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={18} className="text-white/80" /> : <ChevronLeft size={18} className="text-white/80" />}
          </button>
          {/* Close button — visible only on mobile */}
          <button
            onClick={onClose}
            className="md:hidden p-1.5 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
            aria-label="Close menu"
          >
            <X size={18} className="text-white/80" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {nav.map(({ label, href, icon: Icon }) => {
            const active = path === href || (href !== '/' && path.startsWith(href))
            return (
              <Link key={href} href={href} onClick={handleLinkClick}
                title={collapsed ? label : undefined}
                className={`flex items-center gap-3 ${collapsed ? 'md:justify-center md:px-0' : 'md:px-6'} px-6 py-2.5 text-sm font-medium transition-colors mx-2 rounded-lg mb-0.5
                  ${active ? 'bg-white/15 text-white' : 'text-green-200 hover:bg-white/10 hover:text-white'}`}>
                <Icon size={18} />
                <span className={collapsed ? 'md:hidden' : ''}>{label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-white/10">
          <button onClick={() => setShowLogoutConfirm(true)}
            title={collapsed ? 'Sign Out' : undefined}
            className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-300 hover:bg-white/10 rounded-lg transition-colors ${collapsed ? 'md:justify-center' : ''}`}>
            <LogOut size={18} /> <span className={collapsed ? 'md:hidden' : ''}>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Logout confirmation modal ── */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowLogoutConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center pt-7 pb-4 px-6">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-3">
                <LogOut size={24} className="text-red-500" />
              </div>
              <h3 className="text-base font-bold text-gray-800">Sign out of Admin Panel?</h3>
              <p className="text-sm text-gray-400 text-center mt-1">You'll be redirected to the login page.</p>
            </div>
            <div className="border-t border-gray-100">
              <button
                onClick={doLogout}
                className="w-full py-3.5 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors border-b border-gray-100"
              >
                Yes, Sign Out
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="w-full py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
