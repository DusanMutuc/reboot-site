// src/middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const RESET_PATH = '/reset-password';
const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  RESET_PATH,
  '/api/auth',        // allow clear-first-login-flag
  '/api/ghl',         // allow GHL webhooks to bypass auth
  '/auth',            // oauth callbacks if you have them
  '/_next',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/images',
  '/api/webhooks',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes & assets
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Create a response we can mutate cookies on
  const res = NextResponse.next({ request: { headers: req.headers } });

  // ✅ Type the cookie adapter (no `any`)
  type CookiesAdapter = {
    get(name: string): string | undefined;
    set(name: string, value: string, options: CookieOptions): void;
    remove(name: string, options: CookieOptions): void;
  };

  const cookieAdapter: CookiesAdapter = {
    get(name) {
      return req.cookies.get(name)?.value;
    },
    set(name, value, options) {
      res.cookies.set({ name, value, ...options });
    },
    remove(name, options) {
      res.cookies.set({ name, value: '', ...options, maxAge: 0 });
    },
  };

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieAdapter }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Not logged in → redirect to login
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // Must reset → force to reset page
  if (session.user.app_metadata?.must_reset_password === true && pathname !== RESET_PATH) {
    const url = req.nextUrl.clone();
    url.pathname = RESET_PATH;
    return NextResponse.redirect(url);
  }

  const assistantAllowed =
    pathname === '/assistant-library' ||
    pathname.startsWith('/assistant-library/') ||
    pathname.startsWith('/r/') ||
    pathname.startsWith('/api');

  if (!assistantAllowed) {
    const { data: isAssistant, error: assistantErr } = await supabase.rpc('is_assistant');
    if (!assistantErr && isAssistant) {
      const url = req.nextUrl.clone();
      url.pathname = '/assistant-library';
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ['/((?!api/cron|_next/static|_next/image|favicon.ico).*)'],
};
