import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  const { searchParams } = new URL(request.url);
  const user_id = searchParams.get('user_id');

  if (!user_id) {
    console.error('❌ coach-profiles GET: Missing user_id');
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
  }

  const supa = getAdminClient();

  const { data, error } = await supa
    .from('coach_profiles')
    .select(
      [
        'user_id',
        'bio',
        'm2_booking_url',
        'call15_url',
        'coaching_dashboard_url',
        'ghl_calendar_embed_url',
        'ghl_user_id',
        'coaching_notes_url',
        'm2_form_url',
        'impl_booking_url',
      ].join(', ')
    )
    .eq('user_id', user_id)
    .maybeSingle();

  if (error) {
    console.error('❌ coach-profiles GET: Error fetching profile', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // If no row yet, return null so the UI can show empty fields
  return NextResponse.json({ profile: data ?? null });
}

type CoachProfileBody = {
  user_id: string;
  bio?: string | null;
  m2_booking_url?: string | null;
  call15_url?: string | null;
  coaching_dashboard_url?: string | null;
  ghl_calendar_embed_url?: string | null;
  ghl_user_id?: string | null;
  coaching_notes_url?: string | null;
  m2_form_url?: string | null;
  impl_booking_url?: string | null;
};

export async function POST(request: NextRequest) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.res;
  
    try {
      const body = (await request.json()) as CoachProfileBody;
  
      const normalize = (v?: string | null): string | null => {
        if (v == null) return null;
        const t = v.trim();
        return t === '' ? null : t;
      };
  
      const user_id = body.user_id;
      if (!user_id) {
        console.error('❌ coach-profiles POST: Missing user_id');
        return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
      }
  
      const supa = getAdminClient();
  
      const payload = {
        user_id,
        bio: body.bio ?? null, // bio can safely be empty string if you like
        m2_booking_url: normalize(body.m2_booking_url),
        call15_url: normalize(body.call15_url),
        coaching_dashboard_url: normalize(body.coaching_dashboard_url),
        ghl_calendar_embed_url: normalize(body.ghl_calendar_embed_url),
        ghl_user_id: normalize(body.ghl_user_id),
        coaching_notes_url: normalize(body.coaching_notes_url),
        m2_form_url: normalize(body.m2_form_url),
        impl_booking_url: normalize(body.impl_booking_url),
      };
  
      const { error } = await supa
        .from('coach_profiles')
        .upsert(payload, { onConflict: 'user_id' });
  
      if (error) {
        console.error('❌ coach-profiles POST: Error upserting profile', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
  
      return NextResponse.json({ ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unexpected server error';
      console.error('💥 coach-profiles POST: Unexpected error:', e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  