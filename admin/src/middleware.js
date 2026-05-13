import { NextResponse } from 'next/server'

// No server-side auth checks — all authentication is handled client-side
// by AdminLayout which reads from localStorage (persists across refreshes).
// Having server-side cookie checks here caused logout-on-refresh bugs because
// cookies were not always available at edge request time.
export function middleware(_request) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
