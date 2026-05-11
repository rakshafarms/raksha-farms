import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
export default function LoginPage() {
  const { loginWithEmail, signupWithEmail, renderGoogleButton, isLoggedIn, loading, googleReady } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const googleBtnRef = useRef(null)

  const [tab, setTab] = useState('login')
  const [form, setForm] = useState(() => {
    const saved = localStorage.getItem('rf_remember_email') || ''
    return { name: '', email: saved, emailOrPhone: saved, phone: '', password: '', confirm: '' }
  })
  const [rememberMe, setRememberMe] = useState(!!localStorage.getItem('rf_remember_email'))
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const from = location.state?.from || '/'

  // Redirect if already logged in
  useEffect(() => {
    if (isLoggedIn) navigate(from, { replace: true })
  }, [isLoggedIn, navigate, from])

  // Render Google button once GSI is ready
  useEffect(() => {
    if (googleReady) renderGoogleButton('google-btn-container')
  }, [googleReady, renderGoogleButton, tab])

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: '' }))
  }

  function validateLogin() {
    const errs = {}
    const id = form.email.trim()
    if (!id) errs.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(id)) errs.email = 'Enter a valid email address'
    if (!form.password) errs.password = 'Password is required'
    return errs
  }

  function validateSignup() {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Full name is required'
    if (!form.email.trim()) errs.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Enter a valid email'
    if (form.phone && form.phone.replace(/\D/g, '').length !== 10) errs.phone = 'Enter a valid 10-digit mobile number'
    if (!form.password) errs.password = 'Password is required'
    else if (form.password.length < 6) errs.password = 'Minimum 6 characters'
    if (form.password !== form.confirm) errs.confirm = 'Passwords do not match'
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = tab === 'login' ? validateLogin() : validateSignup()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSubmitting(true)
    try {
      if (tab === 'login') {
        await loginWithEmail(form.email.trim(), form.password)
        if (rememberMe) localStorage.setItem('rf_remember_email', form.email.trim())
        else localStorage.removeItem('rf_remember_email')
        addToast('Welcome back! 🌿', 'success')
      } else {
        await signupWithEmail(form.name, form.email, form.password, form.phone)
        addToast('Account created! Welcome to Raksha Farms 🌿', 'success')
      }
      // Navigation is handled by the isLoggedIn useEffect above
    } catch (err) {
      setErrors({ submit: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 group mb-6">
            <div className="w-12 h-12 bg-green-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <span className="text-2xl">🌿</span>
            </div>
            <div className="text-left">
              <p className="text-xl font-black text-green-700 leading-none">Raksha Farms</p>
              <p className="text-xs text-green-500 font-medium">Farm to Doorstep</p>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">
            {tab === 'login' ? 'Welcome back!' : 'Create your account'}
          </h1>
          <p className="text-gray-500 text-sm">
            {tab === 'login'
              ? 'Sign in to track your orders and shop fresh'
              : 'Join thousands of families ordering fresh organic produce'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-soft border border-gray-100 p-8">

          {/* Tab switcher */}
          <div className="flex bg-gray-100 rounded-2xl p-1 mb-6">
            {['login', 'signup'].map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setErrors({}) }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                  tab === t
                    ? 'bg-white text-green-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'login' ? '🔑 Sign In' : '✨ Sign Up'}
              </button>
            ))}
          </div>

          {/* Google button */}
          <div className="mb-4">
            <div
              id="google-btn-container"
              className="w-full flex justify-center min-h-[44px]"
            />
            {!googleReady && (
              <div className="w-full h-11 bg-white border border-gray-200 rounded-xl flex items-center justify-center gap-3 text-sm text-gray-400 cursor-not-allowed">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Loading Google Sign-In...
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400 font-medium">or continue with email</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'signup' && (
              <AuthField
                label="Full Name"
                placeholder="e.g. Priya Sharma"
                value={form.name}
                onChange={(v) => update('name', v)}
                error={errors.name}
                icon="👤"
              />
            )}

            <AuthField
              label="Email Address"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(v) => update('email', v)}
              error={errors.email}
              icon="📧"
            />

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base pointer-events-none">🔒</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={tab === 'signup' ? 'Minimum 6 characters' : 'Your password'}
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  className={`input-field pl-10 pr-10 ${errors.password ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-medium"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
            </div>

            {tab === 'login' && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-4 h-4 accent-green-600 cursor-pointer"
                />
                <label htmlFor="rememberMe" className="text-sm text-gray-600 cursor-pointer select-none">
                  Remember my email
                </label>
              </div>
            )}

            {tab === 'signup' && (
              <AuthField
                label="Confirm Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter your password"
                value={form.confirm}
                onChange={(v) => update('confirm', v)}
                error={errors.confirm}
                icon="✅"
              />
            )}

            {errors.submit && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm flex items-center gap-2">
                <span>⚠️</span> {errors.submit}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || loading}
              className="btn-ripple w-full py-3.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-bold rounded-xl transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  {tab === 'login' ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                tab === 'login' ? '🌿 Sign In' : '✨ Create Account'
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 mt-5">
            {tab === 'login' ? (
              <>Don't have an account?{' '}
                <button onClick={() => { setTab('signup'); setErrors({}) }} className="text-green-600 font-semibold hover:underline">
                  Sign up free
                </button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button onClick={() => { setTab('login'); setErrors({}) }} className="text-green-600 font-semibold hover:underline">
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>

        {/* Trust badges */}
        <div className="flex justify-center gap-6 mt-6 text-xs text-gray-400">
          {['🔒 Secure login', '🌱 100% Organic', '🚚 Same-day delivery'].map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function AuthField({ label, type = 'text', placeholder, value, onChange, error, icon }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label} <span className="text-red-400">*</span>
      </label>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base pointer-events-none">{icon}</span>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`input-field pl-10 ${error ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''}`}
        />
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}
