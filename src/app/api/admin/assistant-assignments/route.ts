import { NextRequest, NextResponse } from 'next/server';
import { invalidateAdminUserDirectory } from '@/lib/adminUserDirectory';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

type AssignmentBody = {
  user_id: string;
  assistant_id: string;
  replace?: boolean;
};

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  const supa = getAdminClient();
  const { data: rows, error } = await supa
    .from('user_assistants')
    .select('user_id, assistant_id, assigned_at, is_active');

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!rows?.length) return NextResponse.json({ items: [] });

  const ids = Array.from(
    new Set(rows.flatMap((row) => [row.user_id, row.assistant_id]).filter(Boolean))
  );

  const { data: profiles, error: profErr } = await supa
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', ids);
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 400 });

  const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);

  const items = rows.map((row) => {
    const userProfile = profileMap.get(row.user_id);
    const assistantProfile = profileMap.get(row.assistant_id);
    const userName = `${userProfile?.first_name ?? ''} ${userProfile?.last_name ?? ''}`.trim();
    const assistantName = `${assistantProfile?.first_name ?? ''} ${assistantProfile?.last_name ?? ''}`.trim();

    return {
      user: { id: row.user_id, name: userName || row.user_id },
      assistant: { id: row.assistant_id, name: assistantName || row.assistant_id },
      assigned_at: row.assigned_at ?? null,
      is_active: row.is_active ?? false,
    };
  });

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const body = (await request.json()) as AssignmentBody;
  if (!body?.user_id || !body?.assistant_id) {
    return NextResponse.json({ error: 'Missing user_id or assistant_id' }, { status: 400 });
  }

  const supa = getAdminClient();
  const replace = body.replace !== false;

  if (replace) {
    const { error: clearErr } = await supa
      .from('user_assistants')
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq('user_id', body.user_id);
    if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 400 });
  }

  const { error } = await supa
    .from('user_assistants')
    .insert({
      user_id: body.user_id,
      assistant_id: body.assistant_id,
      assigned_by: guard.user.id,
      is_active: true,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  invalidateAdminUserDirectory();
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id');
  const assistantId = searchParams.get('assistant_id');
  if (!userId || !assistantId) {
    return NextResponse.json({ error: 'Missing user_id or assistant_id' }, { status: 400 });
  }

  const supa = getAdminClient();
  const { error } = await supa
    .from('user_assistants')
    .update({ is_active: false, ended_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('assistant_id', assistantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  invalidateAdminUserDirectory();
  return NextResponse.json({ ok: true });
}
