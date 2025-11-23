// src/lib/supabaseServer.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Primary server-side client (cookie auth, read/write).
 * Use this everywhere in API routes/Server Components that need the user session.
 */
export const getSupabaseServer = () => {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Next 15: cookies() is async → call it inside each method
        async get(name: string) {
          const store = await cookies();
          return store.get(name)?.value ?? null;
        },
        async set(name: string, value: string, options?: Record<string, any>) {
          const store = await cookies();
          store.set({ name, value, ...(options ?? {}) });
        },
        async remove(name: string, options?: Record<string, any>) {
          const store = await cookies();
          store.set({ name, value: '', ...(options ?? {}), maxAge: 0 });
        },
      },
    }
  );
};

/**
 * Lightweight anon client that still participates in cookie auth if present.
 * Keep for legacy callers; behavior matches getSupabaseServer.
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
        async set(name: string, value: string, options?: Record<string, any>) {
          const store = await cookies();
          store.set({ name, value, ...(options ?? {}) });
        },
        async remove(name: string, options?: Record<string, any>) {
          const store = await cookies();
          store.set({ name, value: '', ...(options ?? {}), maxAge: 0 });
        },
      },
    }
  );
};

// Export default too so either `import { getSupabaseServer }` or `import getSupabaseServer` works.
export default getSupabaseServer;
