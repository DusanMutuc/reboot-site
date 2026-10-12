import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { archivedAccountWriteResponse } from '@/lib/adminAccountGuard';

type AssignAssistantBody = {
  user_id: string;
};

async function getAssistantRoleId() {
  const supa = getAdminClient();
  const { data: roleRow, error } = await supa
    .from('roles')
    .select('id, code')
    .eq('code', 'assistant')
    .maybeSingle();

  if (error) {
    return { error: error.message, id: null };
  }
  return { error: null, id: roleRow?.id ?? null };
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const body = (await request.json()) as AssignAssistantBody;
  if (!body?.user_id) {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
  }

  const supa = getAdminClient();
  const archived = await archivedAccountWriteResponse(supa, body.user_id);
  if (archived) return archived;
  // Explicit restoration clears automatic revocation and grants the role in one transaction.
  const { error } = await supa.rpc('restore_assistant_access', { p_assistant_id: body.user_id });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id');
  if (!userId) {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
  }

  const { id: roleId, error: roleError } = await getAssistantRoleId();
  if (roleError) return NextResponse.json({ error: roleError }, { status: 400 });
  if (!roleId) return NextResponse.json({ error: 'Assistant role not found' }, { status: 400 });

  const supa = getAdminClient();
  const archived = await archivedAccountWriteResponse(supa, userId);
  if (archived) return archived;
  const { error } = await supa
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role_id', roleId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
