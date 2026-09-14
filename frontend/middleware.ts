import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through without auth check
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Dashboard routes require a valid auth cookie
  if (pathname.startsWith('/dashboard')) {
    const token = request.cookies.get('authToken')?.value;

    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Basic JWT structure check (3 base64 segments separated by dots)
    const parts = token.split('.');
    if (parts.length !== 3) {
      const loginUrl = new URL('/login', request.url);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete('authToken');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
