'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authAPI } from '../../lib/api'
import { Leaf, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: 'admin@rakshafarms.in', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [show, setShow] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const { data } = await authAPI.login(form.email, form.password)
      // Reject if not an admin role — never store a customer token in admin panel
      if (data.user?.role !== 'admin') {
        setError('Access denied: admin accounts only')
        return
      }
      const t = data.token

      // Write to every possible storage so AdminLayout always finds it on refresh
      localStorage.setItem('admin_token', t)
      sessionStorage.setItem('admin_token', t) // backup if localStorage is blocked

      // Synchronous cookie (must happen before the HTTP redirect below)
      const exp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString()
      document.cookie = `admin_token=${t}; expires=${exp}; path=/; SameSite=Lax`

      // Verify the writes actually landed before navigating
      const stored = localStorage.getItem('admin_token')
      if (!stored) {
        setError('Storage write failed — please allow cookies/localStorage and try again.')
        return
      }

      // Server-side cookie (non-blocking, best-effort)
      fetch('/api/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),
      }).catch(() => {})

      // Use client-side navigation — this does NOT make an HTTP request,
      // so there is zero chance of any server redirect intercepting it.
      // window.location.replace('/') was making a full GET / which could
      // be caught by Vercel's edge and redirected before the page loaded.
      router.replace('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1B4332] to-[#2d6a4f] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#1B4332] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Leaf size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Login</h1>
          <p className="text-sm text-gray-500 mt-1">Raksha Farms Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" required value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B4332]"
              placeholder="admin@rakshafarms.in" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input type={show ? 'text' : 'password'} required value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B4332] pr-11" />
              <button type="button" onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {show ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-3 bg-[#1B4332] text-white rounded-xl font-semibold hover:bg-[#163826] transition disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Admin access only · v2.4
        </p>
      </div>
    </div>
  )
}
