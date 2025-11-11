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

  // 1) Fetch coach_profiles row (coach-specific metadata)
  const { data: coachProfile, error: coachError } = await supa
    .from('coach_profiles')
    .select(
      [
        'user_id',
        'bio',
        'm2_booking_url',
        'call15_url',
        'coaching_dashboard_url',
        'ghl_calendar_embed_url',
        'coaching_notes_url',
        'm2_form_url',
        'impl_booking_url',
      ].join(', '),
    )
    .eq('user_id', user_id)
    .maybeSingle();

  if (coachError) {
    console.error('❌ coach-profiles GET: Error fetching coach profile', coachError);
    return NextResponse.json({ error: coachError.message }, { status: 400 });
  }

  // 2) Fetch ghl_user_id from profiles
  const { data: profileRow, error: profileError } = await supa
    .from('profiles')
    .select('ghl_user_id')
    .eq('id', user_id)
    .maybeSingle();

  if (profileError) {
    console.error('❌ coach-profiles GET: Error fetching profile ghl_user_id', profileError);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({
    profile: coachProfile ?? null,
    ghl_user_id: profileRow?.ghl_user_id ?? null,
  });
}

type CoachProfileBody = {
  user_id: string;
  bio?: string | null;
  m2_booking_url?: string | null;
  call15_url?: string | null;
  coaching_dashboard_url?: string | null;
  ghl_calendar_embed_url?: string | null;
  // NOTE: ghl_user_id now lives on profiles, not coach_profiles
  ghl_user_id?: string | null; // kept here for backwards compatibility in POST parsing
  coaching_notes_url?: string | null;
  m2_form_url?: string | null;
  impl_booking_url?: string | null;
};

// Shape expected from the new admin UI:
// { profile: CoachProfileBodyWithoutGhlUserId, ghl_user_id: string | null }
type CoachProfilesPostPayload =
  | {
      profile: CoachProfileBody;
      ghl_user_id?: string | null;
    }
  | CoachProfileBody; // fallback for old shape (no "profile" wrapper)

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  try {
    const raw = (await request.json()) as CoachProfilesPostPayload;

    // Normalize incoming shape: support both new ({ profile, ghl_user_id })
    // and old flat body ({ user_id, ..., ghl_user_id }).
    let body: CoachProfileBody;
    let rawGhlUserId: string | null | undefined;

    if ('profile' in raw) {
      body = raw.profile;
      rawGhlUserId = raw.ghl_user_id ?? raw.profile.ghl_user_id ?? null;
    } else {
      body = raw;
      rawGhlUserId = raw.ghl_user_id ?? null;
    }

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

    // 1) Upsert coach_profiles (coach-only fields; NO ghl_user_id here anymore)
    const profilePayload = {
      user_id,
      bio: body.bio ?? null,
      m2_booking_url: normalize(body.m2_booking_url),
      call15_url: normalize(body.call15_url),
      coaching_dashboard_url: normalize(body.coaching_dashboard_url),
      ghl_calendar_embed_url: normalize(body.ghl_calendar_embed_url),
      coaching_notes_url: normalize(body.coaching_notes_url),
      m2_form_url: normalize(body.m2_form_url),
      impl_booking_url: normalize(body.impl_booking_url),
    };

    const { error: upsertError } = await supa
      .from('coach_profiles')
      .upsert(profilePayload, { onConflict: 'user_id' });

    if (upsertError) {
      console.error('❌ coach-profiles POST: Error upserting coach profile', upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 400 });
    }

    // 2) Update profiles.ghl_user_id (global user mapping for GHL)
    const ghl_user_id = normalize(rawGhlUserId ?? null);

    const { error: updateProfileError } = await supa
      .from('profiles')
      .update({ ghl_user_id })
      .eq('id', user_id);

    if (updateProfileError) {
      console.error(
        '❌ coach-profiles POST: Error updating profiles.ghl_user_id',
        updateProfileError,
      );
      return NextResponse.json({ error: updateProfileError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unexpected server error';
    console.error('💥 coach-profiles POST: Unexpected error:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
