import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useOrders } from './OrdersContext'

export const GOOGLE_CLIENT_ID = '748062369153-cras387r0nfe12n4n8q8a5iu91g60jq1.apps.googleusercontent.com'

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const AuthContext = createContext(null)

function decodeJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch { return null }
}

export function AuthProvider({ children }) {
  const { syncOrdersByUser, syncOrdersByPhone } = useOrders()

  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('rf_auth_user')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [loading, setLoading] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)

  // Persist user to localStorage
  useEffect(() => {
    if (user) localStorage.setItem('rf_auth_user', JSON.stringify(user))
    else localStorage.removeItem('rf_auth_user')
  }, [user])

  // On mount: if Google user has no auth_token (happened during a Render cold-start
  // where the backend was unavailable at login time), try to silently re-fetch a JWT.
  // We do NOT immediately log them out — that caused logout-on-every-reload.
  useEffect(() => {
    const saved = localStorage.getItem('rf_auth_user')
    if (!saved) return
    try {
      const u = JSON.parse(saved)
      if (u?.provider === 'google' && !localStorage.getItem('auth_token')) {
        // Keep the user logged in. Attempt a silent re-auth via Google One Tap
        // so we can get a real JWT from the backend.
        // If the backend is still unavailable, the user stays logged in (no logout).
        const tryReauth = () => {
          if (!window.google?.accounts?.id) return
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: async (response) => {
              try {
                const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ credential: response.credential }),
                })
                const data = await res.json()
                if (res.ok && data.token) {
                  localStorage.setItem('auth_token', data.token)
                  const payload = decodeJwt(response.credential)
                  setUser({ ...data.user, avatar: payload?.picture, provider: 'google' })
                  setTimeout(() => syncAllOrders(), 300)
                }
              } catch { /* silent — keep existing session */ }
            },
          })
          window.google.accounts.id.prompt()
        }
        // Wait for Google SDK to load before attempting
        const interval = setInterval(() => {
          if (window.google?.accounts?.id) { clearInterval(interval); tryReauth() }
        }, 300)
        setTimeout(() => clearInterval(interval), 10000) // give up after 10s
      }
    } catch { /* ignore */ }
  }, []) // eslint-disable-line

  // After any login: sync orders immediately using every available method
  function syncAllOrders(phone = null) {
    syncOrdersByUser()
    // Sync by phone if available (phone passed from login form takes priority)
    if (phone) syncOrdersByPhone(phone)
  }

  // Wait for Google GSI script to load
  useEffect(() => {
    const check = setInterval(() => {
      if (window.google?.accounts?.id) {
        setGoogleReady(true)
        clearInterval(check)
      }
    }, 200)
    return () => clearInterval(check)
  }, [])

  // ─── Google Sign-In ────────────────────────────────────────────────
  const renderGoogleButton = useCallback((containerId) => {
    if (!googleReady) return
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        const payload = decodeJwt(response.credential)
        if (!payload) return
        try {
          // Call backend to find/create user and get JWT token
          const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential }),
          })
          const data = await res.json()
          if (res.ok && data.token) {
            localStorage.setItem('auth_token', data.token)
            const loggedUser = { ...data.user, avatar: payload.picture, provider: 'google' }
            setUser(loggedUser)
            // Notify cart + address contexts to sync from backend
            window.dispatchEvent(new CustomEvent('rf:login'))
            // Sync orders immediately — auth_token is now in localStorage
            setTimeout(() => syncAllOrders(), 300)
            return
          }
        } catch { /* fallback below */ }
        // Backend was unavailable (Render cold start). Keep user logged in, then
        // retry getting a real JWT in the background — Render typically wakes in 20-40s.
        const partialUser = { uid: payload.sub, name: payload.name, email: payload.email, avatar: payload.picture, provider: 'google' }
        setUser(partialUser)
        ;(async () => {
          let gotToken = false
          for (let i = 0; i < 4; i++) {
            await new Promise(r => setTimeout(r, 10000 * (i + 1))) // 10s, 20s, 30s, 40s
            try {
              const r2 = await fetch(`${BACKEND_URL}/api/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: response.credential }),
              })
              const d2 = await r2.json()
              if (r2.ok && d2.token) {
                localStorage.setItem('auth_token', d2.token)
                setUser({ ...d2.user, avatar: payload.picture, provider: 'google' })
                setTimeout(() => syncAllOrders(), 300)
                gotToken = true
                break
              }
            } catch { /* keep trying */ }
          }
          // All retries failed — backend is unreachable; let the UI know
          if (!gotToken) window.dispatchEvent(new CustomEvent('rf:auth-failed'))
        })()
        window.dispatchEvent(new CustomEvent('rf:login'))
      },
    })
    const el = document.getElementById(containerId)
    if (el) {
      window.google.accounts.id.renderButton(el, {
        theme: 'outline',
        size: 'large',
        width: el.offsetWidth || 320,
        text: 'signin_with',
        shape: 'rectangular',
      })
    }
  }, [googleReady]) // eslint-disable-line

  // ─── Email/Phone Sign Up ───────────────────────────────────────────
  async function signupWithEmail(name, email, password, phone = '') {
    setLoading(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, phone: phone || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Signup failed')
      localStorage.setItem('auth_token', data.token)
      const newUser = { ...data.user, provider: 'email' }
      setUser(newUser)
      window.dispatchEvent(new CustomEvent('rf:login'))
      setTimeout(() => syncAllOrders(phone), 300)
      return newUser
    } finally {
      setLoading(false)
    }
  }

  // ─── Email or Phone Login ──────────────────────────────────────────
  async function loginWithEmail(emailOrPhone, password) {
    setLoading(true)
    try {
      const isPhone = /^[+\d]/.test(emailOrPhone) && !/[@]/.test(emailOrPhone)
      const body = isPhone
        ? { phone: emailOrPhone, password }
        : { email: emailOrPhone, password }
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      if (data.user.role === 'admin') throw new Error('Please use the admin panel to sign in.')
      localStorage.setItem('auth_token', data.token)
      const loggedUser = { ...data.user, provider: 'email' }
      setUser(loggedUser)
      window.dispatchEvent(new CustomEvent('rf:login'))
      setTimeout(() => syncAllOrders(isPhone ? emailOrPhone : null), 300)
      return loggedUser
    } finally {
      setLoading(false)
    }
  }

  // ─── Logout ────────────────────────────────────────────────────────
  function logout() {
    const token = localStorage.getItem('auth_token')
    if (token) {
      fetch(`${BACKEND_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
    setUser(null)
    localStorage.removeItem('auth_token')
    localStorage.removeItem('rf_auth_user')
    window.dispatchEvent(new CustomEvent('rf:logout'))
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect()
    }
  }

  // ─── Session expired (token 401) ────────────────────────────────────
  // When backend says token is invalid/expired, clear the session so the
  // user sees the login page instead of a silently empty profile.
  useEffect(() => {
    function onTokenExpired() {
      // Only act if we actually think we're logged in
      if (!localStorage.getItem('auth_token')) return
      localStorage.removeItem('auth_token')
      localStorage.removeItem('rf_auth_user')
      setUser(null)
      window.dispatchEvent(new CustomEvent('rf:logout'))
      // Small delay so contexts can clear before the page re-renders
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('rf:session-expired'))
      }, 50)
    }
    window.addEventListener('rf:token-expired', onTokenExpired)
    return () => window.removeEventListener('rf:token-expired', onTokenExpired)
  }, []) // eslint-disable-line

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      googleReady,
      loginWithEmail,
      signupWithEmail,
      renderGoogleButton,
      logout,
      isLoggedIn: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
