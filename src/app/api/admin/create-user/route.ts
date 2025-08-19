// app/api/admin/create-user/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/requireAdmin';

type CreateUserBody = {
  email: string;
  role: string;
  first_name?: string;
  last_name?: string;
};

export async function POST(request: NextRequest) {
  console.log('👤 create-user: Starting request');

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  try {
    const body = (await request.json()) as CreateUserBody;
    const { email, first_name = '', last_name = '', role } = body;

    if (!email || !role) {
      return NextResponse.json({ error: 'Missing email or role' }, { status: 400 });
    }

    console.log('👤 create-user: Creating user with role:', role);
    const supa = getAdminClient();

    // Get role ID
    const { data: roleRow, error: roleErr } = await supa
      .from('roles')
      .select('id, code')
      .eq('code', role)
      .maybeSingle();

    if (roleErr) {
      console.error('❌ create-user: Role lookup error:', roleErr);
      return NextResponse.json({ error: roleErr.message }, { status: 400 });
    }
    if (!roleRow) {
      console.error('❌ create-user: Role not found:', role);
      return NextResponse.json({ error: 'Role not found' }, { status: 400 });
    }

    // Create user
    console.log('👤 create-user: Creating auth user');
    const { data: created, error: authErr } = await supa.auth.admin.createUser({
      email,
      password: 'reboot',
      email_confirm: true,
      user_metadata: { first_name, last_name },
    });
    if (authErr) {
      console.error('❌ create-user: Auth creation error:', authErr);
      return NextResponse.json({ error: authErr.message }, { status: 400 });
    }

    if (!created?.user?.id) {
      console.error('❌ create-user: No user ID returned');
      return NextResponse.json({ error: 'User creation failed - no ID' }, { status: 500 });
    }

    const userId = created.user.id;
    console.log('👤 create-user: User created with ID:', userId);

    // Create profile
    console.log('👤 create-user: Creating profile');
    const { error: profErr } = await supa
      .from('profiles')
      .upsert({ id: userId, first_name, last_name }, { onConflict: 'id' });
    if (profErr) {
      console.error('❌ create-user: Profile creation error:', profErr);
      return NextResponse.json({ error: profErr.message }, { status: 400 });
    }

    // Assign role
    console.log('👤 create-user: Assigning role');
    const { error: linkErr } = await supa
      .from('user_roles')
      .upsert(
        { user_id: userId, role_id: roleRow.id },
        { onConflict: 'user_id,role_id', ignoreDuplicates: true }
      );
    if (linkErr) {
      console.error('❌ create-user: Role assignment error:', linkErr);
      return NextResponse.json({ error: linkErr.message }, { status: 400 });
    }

    // Create coach profile if needed
    if (role === 'coach') {
      console.log('👤 create-user: Creating coach profile');
      const { error: coachErr } = await supa
        .from('coach_profiles')
        .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
      if (coachErr) {
        console.error('❌ create-user: Coach profile error:', coachErr);
        return NextResponse.json({ error: coachErr.message }, { status: 400 });
      }
    }

    console.log('✅ create-user: User created successfully');
    return NextResponse.json({ ok: true, user_id: userId }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unexpected server error';
    console.error('💥 create-user: Unexpected error:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
