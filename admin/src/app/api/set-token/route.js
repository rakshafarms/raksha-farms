import { NextResponse } from 'next/server'

// Sets the admin_token cookie via a server-side Set-Cookie header.
// This is more reliable than js-cookie (client-side) because the browser
// always honours Set-Cookie from an HTTP response, regardless of SameSite /
// Secure rules that can block JS-written cookies on some browser configs.
export async function POST(request) {
  try {
    const { token } = await request.json()
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 400 })

    const res = NextResponse.json({ ok: true })
    res.cookies.set('admin_token', token, {
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
      path: '/',
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: false, // must be readable by js-cookie for client-side API requests
    })
    return res
  } catch {
    return NextResponse.json({ error: 'Failed to set token' }, { status: 500 })
  }
}

// Also handles DELETE to clear the cookie on logout
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('admin_token', '', { maxAge: 0, path: '/' })
  return res
}
