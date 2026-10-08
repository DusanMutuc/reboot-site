import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { ACCOUNT_MERGED_CODE, ACCOUNT_MERGED_MESSAGE, ACCOUNT_MERGED_PATH, fetchAccountLifecycle, isAccountMerged } from '@/lib/accountLifecycle';

import {
  ACCESS_REMOVED_PATH,
  canSwitchMemberViews,
  fetchMemberHomeContext,
  fetchUserRoleCodes,
  hasDualMembership,
  hasRoleCode,
  isPastMemberAllowedApiPath,
  isPastMemberRole,
  NINETY_DAY_HOME_PATH,
  resolveHomePathForRoleCodes,
} from '@/lib/userRoles';

const RESET_PATH = '/reset-password';
const PUBLIC_PREFIXES = [
  '/delete-account',
  '/login',
  '/privacy-policy',
  '/support',
  '/signup',
  RESET_PATH,
  '/api/auth',
  '/api/mobile',
  '/api/ghl',
  '/auth',
  '/_next',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/images',
  '/api/webhooks',
];

const NINETY_DAY_PAGE_PREFIXES = [
  NINETY_DAY_HOME_PATH,
  '/library',
  '/courses',
  '/tracker',
  '/support',
  '/reset-password',
  '/r',
];

function isPathAtOrBelow(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApiRequest = pathname.startsWith('/api');

  if (pathname === ACCOUNT_MERGED_PATH) return NextResponse.next();
  const isPublicRequest = PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
  const isAuthPage = ['/login', RESET_PATH, '/auth'].some((prefix) => isPathAtOrBelow(pathname, prefix));
  // Public APIs enforce their own guards. Auth pages must also reject a merged
  // session already present before a login, recovery or mobile handoff exchange.
  if (isPublicRequest && !isAuthPage) {
    return NextResponse.next();
  }

  const res = NextResponse.next({ request: { headers: req.headers } });

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
    { cookies: cookieAdapter },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isPublicRequest) return res;
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  try {
    if (isAccountMerged(await fetchAccountLifecycle(getAdminClient(), user.id))) {
      const denied = isApiRequest
        ? NextResponse.json({ error: ACCOUNT_MERGED_MESSAGE, code: ACCOUNT_MERGED_CODE }, { status: 403 })
        : NextResponse.redirect(new URL(ACCOUNT_MERGED_PATH, req.url));
      for (const cookie of res.cookies.getAll()) denied.cookies.set(cookie);
      return denied;
    }
  } catch {
    return NextResponse.json({ error: 'Account access could not be verified. Please try again.' }, { status: 503 });
  }
  if (isPublicRequest) return res;

  const roleCodes = await fetchUserRoleCodes(supabase, user.id);
  const isPastMember = isPastMemberRole(roleCodes);

  if (pathname === ACCESS_REMOVED_PATH) {
    if (isPastMember) {
      return res;
    }

    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (isPastMember) {
    if (isApiRequest) {
      if (isPastMemberAllowedApiPath(pathname)) {
        return res;
      }

      return NextResponse.json({ error: 'Access removed' }, { status: 403 });
    }

    const url = req.nextUrl.clone();
    url.pathname = ACCESS_REMOVED_PATH;
    return NextResponse.redirect(url);
  }

  if (user.app_metadata?.must_reset_password === true && pathname !== RESET_PATH) {
    const url = req.nextUrl.clone();
    url.pathname = RESET_PATH;
    return NextResponse.redirect(url);
  }

  const homeContext = hasDualMembership(roleCodes) ? await fetchMemberHomeContext(supabase) : undefined;
  const resolvedHomePath = resolveHomePathForRoleCodes(roleCodes, homeContext);
  const isNinetyDayHome = isPathAtOrBelow(pathname, NINETY_DAY_HOME_PATH);
  const ninetyDayOnly = hasRoleCode(roleCodes, 'ninety-day-user') && !hasRoleCode(roleCodes, 'user')
    && resolvedHomePath === NINETY_DAY_HOME_PATH;

  if (isNinetyDayHome && !ninetyDayOnly && !canSwitchMemberViews(roleCodes, homeContext)) {
    const url = req.nextUrl.clone();
    url.pathname = resolvedHomePath;
    return NextResponse.redirect(url);
  }

  if (ninetyDayOnly) {
    const allowed = NINETY_DAY_PAGE_PREFIXES.some((prefix) => isPathAtOrBelow(pathname, prefix));
    if (!isApiRequest && !allowed) {
      const url = req.nextUrl.clone();
      url.pathname = NINETY_DAY_HOME_PATH;
      return NextResponse.redirect(url);
    }
  }

  const assistantAllowed =
    pathname === '/assistant-library' ||
    pathname.startsWith('/assistant-library/') ||
    pathname.startsWith('/r/') ||
    isApiRequest;

  const assistantPath =
    pathname === '/assistant-library' || pathname.startsWith('/assistant-library/');

  const mainLibraryPath = pathname === '/library' || pathname.startsWith('/library/');
  const legendsLibraryPath =
    pathname === '/legends-library' || pathname.startsWith('/legends-library/');

  const isAssistant = hasRoleCode(roleCodes, 'assistant');
  const isLegend = hasRoleCode(roleCodes, 'legend');

  if (legendsLibraryPath && !isLegend) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.replace(/^\/legends-library/, '/library');
    return NextResponse.redirect(url);
  }

  if (mainLibraryPath && isLegend && !isAssistant) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.replace(/^\/library/, '/legends-library');
    return NextResponse.redirect(url);
  }

  if (assistantPath && !isAssistant) {
    const url = req.nextUrl.clone();
    url.pathname = '/library';
    return NextResponse.redirect(url);
  }

  if (!assistantAllowed && isAssistant) {
    const url = req.nextUrl.clone();
    url.pathname = '/assistant-library';
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ['/((?!api/cron|_next/static|_next/image|favicon.ico).*)'],
};
