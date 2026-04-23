import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

import { getAdminClient } from './supabaseAdmin';
import { fetchUserRoleCodes, isPastMemberRole } from './userRoles';

export type RequireUserSuccess = {
  ok: true;
  roleCodes: string[];
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
    const accessToken = request ? readBearerToken(request) : null;

    if (request && accessToken) {
      supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        },
      );

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(accessToken);

      if (error) {
        return {
          ok: false,
          res: NextResponse.json(
            { error: 'Authentication failed', details: error.message },
            { status: 401 },
          ),
        };
      }

      if (!user) {
        return {
          ok: false,
          res: NextResponse.json({ error: 'Unauthorized - No session' }, { status: 401 }),
        };
      }

      const roleCodes = await fetchUserRoleCodes(getAdminClient(), user.id);
      if (isPastMemberRole(roleCodes)) {
        return {
          ok: false,
          res: NextResponse.json({ error: 'Access removed' }, { status: 403 }),
        };
      }

      return { ok: true, roleCodes, user, supabase };
    }

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
        res: NextResponse.json(
          { error: 'Authentication failed', details: error.message },
          { status: 401 },
        ),
      };
    }

    if (!user) {
      return {
        ok: false,
        res: NextResponse.json({ error: 'Unauthorized - No session' }, { status: 401 }),
      };
    }

    const roleCodes = await fetchUserRoleCodes(getAdminClient(), user.id);
    if (isPastMemberRole(roleCodes)) {
      return {
        ok: false,
        res: NextResponse.json({ error: 'Access removed' }, { status: 403 }),
      };
    }

    return { ok: true, roleCodes, user, supabase };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      ok: false,
      res: NextResponse.json({ error: 'Server error', details: message }, { status: 500 }),
    };
  }
}

function readBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;

  const [scheme, token] = authorization.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}
