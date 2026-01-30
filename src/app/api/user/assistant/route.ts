import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getAdminClient } from '@/lib/supabaseAdmin';

export async function GET(request: NextRequest) {
  const supaSSR = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => request.cookies.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );

  const {
    data: { user },
    error: userErr,
  } = await supaSSR.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdminClient();
  const { data: assignment, error: assignErr } = await admin
    .from('user_assistants')
    .select('assistant_id, assigned_at')
    .eq('user_id', user.id)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (assignErr) {
    return NextResponse.json({ error: assignErr.message }, { status: 400 });
  }

  if (!assignment?.assistant_id) {
    return NextResponse.json({ assistant: null });
  }

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('id', assignment.assistant_id)
    .maybeSingle();

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  let email = '';
  const { data: authData } = await admin.auth.admin.getUserById(assignment.assistant_id);
  if (authData?.user?.email) email = authData.user.email;

  const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim();

  return NextResponse.json({
    assistant: {
      id: assignment.assistant_id,
      name: name || assignment.assistant_id,
      email,
      assigned_at: assignment.assigned_at ?? null,
    },
  });
}
