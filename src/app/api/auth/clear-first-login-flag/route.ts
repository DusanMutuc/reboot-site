import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getAdminClient } from '@/lib/supabaseAdmin';

export async function POST() {
  try {
    // 1) Prepare a response we can mutate cookies on
    const res = new NextResponse();

    // 2) Read current request cookies (async in Next 15)
    const cookieStore = await cookies();

    // 3) Create SSR supabase client bound to request+response cookies
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          // read from the incoming request cookies
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          // write to the outgoing response cookies
          set(name: string, value: string, options: CookieOptions) {
            res.cookies.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            res.cookies.set({ name, value: '', ...options, maxAge: 0 });
          },
        },
      }
    );

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: res.headers });
    }

    // 4) Clear the app_metadata flag with the service-role admin client
    const admin = getAdminClient();
    const { error: adminErr } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { must_reset_password: false },
    });
    if (adminErr) {
      return NextResponse.json({ error: adminErr.message }, { status: 400, headers: res.headers });
    }

    // 5) Return JSON while preserving any Set-Cookie from `res`
    return NextResponse.json({ ok: true }, { status: 200, headers: res.headers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
