// src/lib/supabaseServer.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Primary server-side client (cookie auth, read/write).
 * Works with Next 15 where cookies() is async; we await it inside each method.
 */
export const getSupabaseServer = () => {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async get(name: string) {
          const store = await cookies();
          return store.get(name)?.value ?? null;
        },
        async set(name: string, value: string, options?: Record<string, unknown>) {
          const store = await cookies();
          store.set({ name, value, ...(options ?? {}) });
        },
        async remove(name: string, options?: Record<string, unknown>) {
          const store = await cookies();
          store.set({ name, value: '', ...(options ?? {}), maxAge: 0 });
        },
      },
    }
  );
};

/**
 * Lightweight anon client mirroring getSupabaseServer behavior.
 */
export const getServerAnonClient = () => {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async get(name: string) {
          const store = await cookies();
          return store.get(name)?.value ?? null;
        },
        async set(name: string, value: string, options?: Record<string, unknown>) {
          const store = await cookies();
          store.set({ name, value, ...(options ?? {}) });
        },
        async remove(name: string, options?: Record<string, unknown>) {
          const store = await cookies();
          store.set({ name, value: '', ...(options ?? {}), maxAge: 0 });
        },
      },
    }
  );
};

// Default export convenience.
export default getSupabaseServer;
