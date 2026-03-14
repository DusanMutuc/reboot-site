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
  const { data: assignments, error: assignErr } = await admin
    .from('user_assistants')
    .select('assistant_id, assigned_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('assigned_at', { ascending: false });

  if (assignErr) {
    return NextResponse.json({ error: assignErr.message }, { status: 400 });
  }

  const assistantIds = [...new Set((assignments ?? []).map((assignment) => assignment.assistant_id).filter(Boolean))];

  if (assistantIds.length === 0) {
    return NextResponse.json({ assistants: [] });
  }

  const { data: profiles, error: profileErr } = await admin
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', assistantIds);

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  const emailEntries = await Promise.all(
    assistantIds.map(async (assistantId) => {
      const { data: authData } = await admin.auth.admin.getUserById(assistantId);
      return [assistantId, authData?.user?.email ?? ''] as const;
    })
  );
  const emailMap = new Map(emailEntries);

  const assistants = (assignments ?? []).flatMap((assignment) => {
    if (!assignment.assistant_id) return [];
    const profile = profileMap.get(assignment.assistant_id);
    const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim();

    return [
      {
        id: assignment.assistant_id,
        name: name || assignment.assistant_id,
        email: emailMap.get(assignment.assistant_id) ?? '',
        assigned_at: assignment.assigned_at ?? null,
      },
    ];
  });

  return NextResponse.json({ assistants });
}
