import { NextResponse } from 'next/server'

export function middleware(request) {
  const { pathname } = request.nextUrl

  // Skip API routes and static assets entirely
  if (pathname.startsWith('/api/')) return NextResponse.next()

  // Only one server-side guard: prevent a logged-in user from landing on /login
  // All other auth (unauthenticated → /login) is handled client-side by AdminLayout,
  // which reads from localStorage — reliable across refreshes without cookie issues.
  const token = request.cookies.get('admin_token')?.value
  if (token && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
