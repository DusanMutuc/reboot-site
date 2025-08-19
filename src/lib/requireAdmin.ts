// lib/requireAdmin.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getAdminClient } from './supabaseAdmin';

export async function requireAdmin(request?: NextRequest) {
  try {
    let supaSSR;
    
    if (request) {
      // If we have the request object, use it for cookies (preferred method)
      console.log('🔐 requireAdmin: Using NextRequest for cookies');
      supaSSR = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get: (name: string) => {
              const value = request.cookies.get(name)?.value;
              if (name.includes('supabase')) {
                console.log(`🍪 Cookie ${name}:`, value ? 'present' : 'missing');
              }
              return value;
            },
            set: () => {}, // Read-only for API routes
            remove: () => {}, // Read-only for API routes
          },
        }
      );
    } else {
      // Fallback to your existing method
      console.log('🔐 requireAdmin: Using getServerAnonClient (fallback)');
      const { getServerAnonClient } = await import('./supabaseServer');
      supaSSR = await getServerAnonClient();
    }

    console.log('🔐 requireAdmin: Getting user session...');
    const { data: { user }, error: userErr } = await supaSSR.auth.getUser();
    
    if (userErr) {
      console.error('❌ requireAdmin user error:', userErr);
      return { 
        ok: false as const, 
        res: NextResponse.json({ error: 'Authentication failed', details: userErr.message }, { status: 401 }) 
      };
    }
    
    if (!user) {
      console.log('👤 requireAdmin: No user found in session');
      return { 
        ok: false as const, 
        res: NextResponse.json({ error: 'Unauthorized - No session' }, { status: 401 }) 
      };
    }

    console.log('👤 requireAdmin: User found:', user.id, user.email);

    // Use admin client to check role (bypasses RLS issues)
    console.log('🔧 requireAdmin: Checking admin role with service client');
    const supaAdmin = getAdminClient();
    const { data: row, error } = await supaAdmin
      .from('user_roles')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('role_id', 1)
      .maybeSingle();

    console.log('📊 requireAdmin role check:', { row, error, userId: user.id });

    if (error) {
      console.error('❌ requireAdmin role check error:', error);
      return { 
        ok: false as const, 
        res: NextResponse.json({ error: 'Role check failed', details: error.message }, { status: 500 }) 
      };
    }
    
    if (!row) {
      console.log('🚫 requireAdmin: User is not admin');
      return { 
        ok: false as const, 
        res: NextResponse.json({ error: 'Forbidden - Admin required' }, { status: 403 }) 
      };
    }

    console.log('✅ requireAdmin: Admin access granted');
    return { ok: true as const, user };

  } catch (error: any) {
    console.error('💥 requireAdmin unexpected error:', error);
    return { 
      ok: false as const, 
      res: NextResponse.json({ error: 'Server error', details: error.message }, { status: 500 }) 
    };
  }
}