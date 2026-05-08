// v2
import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'

// Scroll to top on every route change
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}
import { ToastProvider }    from './context/ToastContext'
import { CartProvider }     from './context/CartContext'
import { ProductsProvider } from './context/ProductsContext'
import { OrdersProvider }   from './context/OrdersContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { WishlistProvider } from './context/WishlistContext'
import { LocationProvider } from './context/LocationContext'
import { AddressProvider }  from './context/AddressContext'
import Navbar               from './components/Navbar'
import Footer               from './components/Footer'
import BottomNav            from './components/BottomNav'
import CartDrawer           from './components/CartDrawer'
import ToastContainer       from './components/Toast'
import HomePage             from './pages/HomePage'
import CartPage             from './pages/CartPage'
import CheckoutPage         from './pages/CheckoutPage'
import OrderConfirmationPage from './pages/OrderConfirmationPage'
import LoginPage            from './pages/LoginPage'
import MyOrdersPage         from './pages/MyOrdersPage'
import ProductPage          from './pages/ProductPage'
import WishlistPage         from './pages/WishlistPage'
import ProfilePage          from './pages/ProfilePage'
import OrderTrackingPage    from './pages/OrderTrackingPage'
import NotFoundPage         from './pages/NotFoundPage'
import FindOrdersPage       from './pages/FindOrdersPage'

function RequireAuth({ children }) {
  const { isLoggedIn } = useAuth()
  const location = useLocation()
  if (!isLoggedIn) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  return children
}

export default function App() {
  return (
    <ToastProvider>
      <LocationProvider>
      <ProductsProvider>
        <OrdersProvider>
          <WishlistProvider>
            <CartProvider>
              <AddressProvider>
              <AuthProvider>
                <Router>
                  <ScrollToTop />
                  <div className="min-h-screen bg-sage-50 font-poppins flex flex-col">
                    <Navbar />
                    <CartDrawer />
                    <ToastContainer />
                    <main className="flex-1 pb-20 md:pb-0">
                      <Routes>
                        <Route path="/"              element={<HomePage />} />
                        <Route path="/product/:id"   element={<ProductPage />} />
                        <Route path="/wishlist"       element={<WishlistPage />} />
                        <Route path="/login"          element={<LoginPage />} />
                        <Route path="/cart"           element={<CartPage />} />
                        <Route path="/checkout"       element={<RequireAuth><CheckoutPage /></RequireAuth>} />
                        <Route path="/confirmation/:orderId" element={<OrderConfirmationPage />} />
                        <Route path="/track/:orderId" element={<OrderTrackingPage />} />
                        <Route path="/my-orders"      element={<RequireAuth><MyOrdersPage /></RequireAuth>} />
                        <Route path="/profile"        element={<RequireAuth><ProfilePage /></RequireAuth>} />
                        <Route path="/find-orders"    element={<FindOrdersPage />} />
                        <Route path="*"               element={<NotFoundPage />} />
                      </Routes>
                    </main>
                    <Footer />
                    <BottomNav />
                  </div>
                </Router>
              </AuthProvider>
              </AddressProvider>
            </CartProvider>
          </WishlistProvider>
        </OrdersProvider>
      </ProductsProvider>
      </LocationProvider>
    </ToastProvider>
  )
}
