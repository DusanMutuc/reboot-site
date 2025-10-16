import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type SupabaseClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';

export type RequireUserSuccess = {
  ok: true;
  user: User;
  supabase: SupabaseClient;
};

export type RequireUserFailure = {
  ok: false;
  res: NextResponse;
};

export type RequireUserResult = RequireUserSuccess | RequireUserFailure;

export async function requireUser(request?: NextRequest): Promise<RequireUserResult> {
  try {
    let supabase: SupabaseClient;

    if (request) {
      supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get: (name: string) => request.cookies.get(name)?.value,
            set: () => {},
            remove: () => {},
          },
        },
      );
    } else {
      const { getServerAnonClient } = await import('./supabaseServer');
      supabase = await getServerAnonClient();
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      return {
        ok: false,
        res: NextResponse.json({ error: 'Authentication failed', details: error.message }, { status: 401 }),
      };
    }

    if (!user) {
      return {
        ok: false,
        res: NextResponse.json({ error: 'Unauthorized - No session' }, { status: 401 }),
      };
    }

    return { ok: true, user, supabase };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      ok: false,
      res: NextResponse.json({ error: 'Server error', details: message }, { status: 500 }),
    };
  }
}
