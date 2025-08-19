// app/api/admin/assign-coach/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

const COURSE_ID = 2;

type AssignCoachBody = {
  user_id: string;
  coach_id: string;
  replace?: boolean;
};

export async function POST(request: NextRequest) {
  console.log('🎯 assign-coach: Starting request');

  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  try {
    const body = (await request.json()) as AssignCoachBody;
    console.log('📝 assign-coach: Request body:', body);

    const { user_id, coach_id, replace = true } = body;
    if (!user_id || !coach_id) {
      console.error('❌ assign-coach: Missing required fields');
      return NextResponse.json({ error: 'Missing user_id or coach_id' }, { status: 400 });
    }

    console.log('🎯 assign-coach: Assigning user', user_id, 'to coach', coach_id, 'replace:', replace);
    const supa = getAdminClient();

    if (replace) {
      console.log('🔄 assign-coach: Deactivating existing assignments');
      const { error } = await supa
        .from('user_coaches')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq('user_id', user_id)
        .eq('course_id', COURSE_ID)
        .eq('is_active', true);

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
      // assigned_at will be set automatically by DEFAULT now()
    });

    if (insErr) {
      console.error('❌ assign-coach: Error creating assignment:', insErr);
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    console.log('✅ assign-coach: Assignment successful');
    return NextResponse.json({ ok: true, message: 'Coach assigned successfully' });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unexpected server error';
    console.error('💥 assign-coach: Unexpected error:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
