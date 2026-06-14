import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/u/(.*)',
  '/api/(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
]);

const isSuperuserRoute = createRouteMatcher(['/superuser(.*)']);

const SUPERUSER_IDS = (process.env.SUPERUSER_USER_IDS ?? '').split(',').filter(Boolean);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId } = await auth();

  if (!userId) {
    const signInUrl = new URL('/sign-in', req.url);
    signInUrl.searchParams.set('redirect_url', req.url);
    return NextResponse.redirect(signInUrl);
  }

  if (isSuperuserRoute(req) && SUPERUSER_IDS.length > 0 && !SUPERUSER_IDS.includes(userId)) {
    return NextResponse.redirect(new URL('/', req.url));
  }
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
