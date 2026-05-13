import { NextResponse } from 'next/server'

export function middleware(request) {
  const { pathname } = request.nextUrl

  // Never intercept API routes — they handle auth themselves,
  // and /api/set-token must be reachable WITHOUT a cookie (it IS the login step).
  if (pathname.startsWith('/api/')) return NextResponse.next()

  const token = request.cookies.get('admin_token')?.value
  const isLoginPage = pathname === '/login'

  if (!token && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (token && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
