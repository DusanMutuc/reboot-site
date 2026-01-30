// src/app/api/auth/is-admin/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getAdminClient } from '@/lib/supabaseAdmin';

export async function GET(request: NextRequest) {
  console.log('🔍 is-admin check started');

  try {
    // Create server client with proper cookie handling
    const supaSSR = createServerClient(
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
          set: () => {}, // Read-only for this route
          remove: () => {}, // Read-only for this route
        },
      }
    );

    console.log('🔐 Getting user session...');
    const {
      data: { user },
      error: userErr,
    } = await supaSSR.auth.getUser();

    if (userErr) {
      console.error('❌ User error:', userErr);
      return NextResponse.json({
        isAdmin: false,
        reason: 'user-error',
        error: userErr.message,
        debug: true,
      });
    }

    if (!user) {
      console.log('👤 No user found in session');
      return NextResponse.json({
        isAdmin: false,
        reason: 'no-user',
        debug: true,
      });
    }

    console.log('👤 User found:', user.id, user.email);

    // Use service role to check admin status
    const supaAdmin = getAdminClient();
    console.log('🔧 Using admin client to check user_roles table');

    const { data, error } = await supaAdmin
      .from('user_roles')
      .select('user_id, roles!inner(code)')
      .eq('user_id', user.id)
      .eq('roles.code', 'admin')
      .maybeSingle();

    console.log('📊 user_roles query result:', { data, error });

    if (error) {
      console.error('❌ Query error:', error);
      return NextResponse.json({
        isAdmin: false,
        reason: 'query-error',
        error: error.message,
        debug: true,
        userId: user.id,
      });
    }

    const isAdmin = !!data;
    console.log(`✅ Admin check result: ${isAdmin} for user ${user.id}`);

    return NextResponse.json({
      isAdmin,
      debug: true,
      userId: user.id,
      userEmail: user.email,
      roleData: data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('💥 Unexpected error in is-admin route:', error);
    return NextResponse.json(
      {
        isAdmin: false,
        reason: 'unexpected-error',
        error: message,
        debug: true,
      },
      { status: 500 }
    );
  }
}
