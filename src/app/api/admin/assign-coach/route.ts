// app/api/admin/assign-coach/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { invalidateAdminUserDirectory } from '@/lib/adminUserDirectory';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

const COURSE_ID = 2;

type RelationshipType = 'primary' | 'implementation';

type AssignCoachBody = {
  user_id: string;
  coach_id: string;
  replace?: boolean;
  relationship_type?: RelationshipType;
};

type CoachSummary = {
  id: string;
  name: string;
  email: string;
  relationship_type: RelationshipType;
};

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(request.url);
  const user_id = searchParams.get('user_id');

  if (!user_id) {
    console.error('❌ assign-coach GET: Missing user_id');
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
  }

  const supa = getAdminClient();

  const { data: rows, error } = await supa
    .from('user_coaches')
    .select('coach_id, relationship_type')
    .eq('user_id', user_id)
    .eq('course_id', COURSE_ID)
    .eq('is_active', true);

  if (error) {
    console.error('❌ assign-coach GET: Error fetching assignments', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const filteredRows =
    (rows || []).filter(
      (r): r is { coach_id: string; relationship_type: RelationshipType | null } =>
        typeof r.coach_id === 'string' && r.coach_id.length > 0
    );

  if (filteredRows.length === 0) {
    return NextResponse.json({ items: [] as CoachSummary[] });
  }

  const coachIds = Array.from(new Set(filteredRows.map((r) => r.coach_id)));

  const { data: profiles, error: profErr } = await supa
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', coachIds);

  if (profErr) {
    console.error('❌ assign-coach GET: Error fetching profiles', profErr);
    return NextResponse.json({ error: profErr.message }, { status: 400 });
  }

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  const items: CoachSummary[] = await Promise.all(
    filteredRows.map(async (row) => {
      const coachId = row.coach_id;
      const prof = profileMap.get(coachId);
      let email = '';

      try {
        const { data: authData, error: authError } = await supa.auth.admin.getUserById(coachId);
        if (authError) {
          console.error('❌ assign-coach GET: Error fetching coach email', authError);
        } else {
          email = (authData.user?.email || '').toLowerCase();
        }
      } catch (err) {
        console.error('❌ assign-coach GET: Unexpected error fetching coach email', err);
      }

      const name = `${prof?.first_name ?? ''} ${prof?.last_name ?? ''}`.trim();
      const relationship_type: RelationshipType =
        row.relationship_type === 'implementation' ? 'implementation' : 'primary';

      return { id: coachId, name, email, relationship_type };
    })
  );

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  console.log('🎯 assign-coach: Starting request');

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  try {
    const body = (await request.json()) as AssignCoachBody;
    console.log('📝 assign-coach: Request body:', body);

    const {
      user_id,
      coach_id,
      replace = true,
      relationship_type = 'primary',
    } = body;

    if (!user_id || !coach_id) {
      console.error('❌ assign-coach: Missing required fields');
      return NextResponse.json({ error: 'Missing user_id or coach_id' }, { status: 400 });
    }

    console.log(
      '🎯 assign-coach: Assigning user',
      user_id,
      'to coach',
      coach_id,
      'replace:',
      replace,
      'relationship_type:',
      relationship_type
    );

    const supa = getAdminClient();

    if (replace) {
      console.log(
        '🔄 assign-coach: Deactivating existing assignments of same relationship_type'
      );
      const { error } = await supa
        .from('user_coaches')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq('user_id', user_id)
        .eq('course_id', COURSE_ID)
        .eq('is_active', true)
        .eq('relationship_type', relationship_type);

      if (error) {
        console.error('❌ assign-coach: Error deactivating existing assignments:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    console.log('➕ assign-coach: Creating new assignment');
    const { error: insErr } = await supa.from('user_coaches').insert({
      user_id,
      coach_id,
      course_id: COURSE_ID,
      is_active: true,
      relationship_type, // 👈 store primary/implementation
      // assigned_at will be set automatically by DEFAULT now()
    });

    if (insErr) {
      console.error('❌ assign-coach: Error creating assignment:', insErr);
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    console.log('✅ assign-coach: Assignment successful');
    invalidateAdminUserDirectory();
    return NextResponse.json({ ok: true, message: 'Coach assigned successfully' });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unexpected server error';
    console.error('💥 assign-coach: Unexpected error:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(request.url);
  const user_id = searchParams.get('user_id');
  const coach_id = searchParams.get('coach_id');

  if (!user_id || !coach_id) {
    console.error('❌ assign-coach DELETE: Missing user_id or coach_id');
    return NextResponse.json({ error: 'Missing user_id or coach_id' }, { status: 400 });
  }

  const supa = getAdminClient();
  const { error } = await supa
    .from('user_coaches')
    .update({ is_active: false, ended_at: new Date().toISOString() })
    .eq('user_id', user_id)
    .eq('coach_id', coach_id)
    .eq('course_id', COURSE_ID)
    .eq('is_active', true);

  if (error) {
    console.error('❌ assign-coach DELETE: Error removing assignment', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  invalidateAdminUserDirectory();
  return NextResponse.json({ ok: true, message: 'Coach removed successfully' });
}
