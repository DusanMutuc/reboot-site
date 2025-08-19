// lib/supabaseClient.ts
import { createBrowserClient, type CookieOptions } from '@supabase/ssr';

const isProd = process.env.NODE_ENV === 'production';

function setCookie(name: string, value: string, options?: CookieOptions) {
  const opts = { path: '/', sameSite: 'lax' as const, ...options };
  let str = `${name}=${value}; Path=${opts.path}; SameSite=${opts.sameSite}`;
  if (opts.maxAge) str += `; Max-Age=${opts.maxAge}`;
  if (opts.expires) str += `; Expires=${opts.expires.toUTCString()}`;
  if (isProd) str += `; Secure`;
  document.cookie = str;
}
function removeCookie(name: string, options?: CookieOptions) {
  const path = options?.path ?? '/';
  document.cookie = `${name}=; Path=${path}; Max-Age=0`;
}
function getCookie(name: string) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m?.[1];
}

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { cookies: { get: getCookie, set: setCookie, remove: removeCookie } }
);
