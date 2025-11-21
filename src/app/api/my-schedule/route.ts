// src/app/api/my-schedule/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { GHL } from '@/lib/config';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  id: string;
  ghl_user_id: string | null;
  role_codes: string[];
};

type CoachOrMemberEvent = {
  id: string;
  calendarId: string;
  groupId: string | null;
  title: string | null;
  status: string | null;
  start: string; // ISO UTC
  end: string;   // ISO UTC
  contact: {
    id: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  location: string | null;
};

// GHL raw payloads are not stable; model only the fields we use.
type RawGhlEvent = {
  id?: string | number;
  _id?: string | number;
  calendarId?: string | number;
  groupId?: string | null;
  title?: string | null;
  name?: string | null;
  appointmentStatus?: string | null;
  status?: string | null;
  startTime?: number | string;
  start?: number | string;
  from?: number | string;
  endTime?: number | string;
  end?: number | string;
  to?: number | string;
  contactId?: string | null;
  contact?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  address?: string | null;
  meetingLocation?: string | null;
};

const COACH_ROLE_CODES = ['coach', 'implementation_coach'] as const;

function clampDays(n: number) {
  return n === 1 || n === 7 || n === 14 ? n : 14;
}

function isValidIana(tz: string) {
  return DateTime.local().setZone(tz).isValid;
}

function rangeToEpochMillis(days: number, tz: string) {
  const startLocal = DateTime.now().setZone(tz).startOf('day');
  const endLocal = startLocal.plus({ days });
  return { startMs: startLocal.toUTC().toMillis(), endMs: endLocal.toUTC().toMillis() };
}

function toIsoUtc(v: unknown): string | null {
  if (typeof v === 'number') return DateTime.fromMillis(v).toUTC().toISO();
  if (typeof v === 'string') {
    const d = DateTime.fromISO(v, { setZone: true });
    return d.isValid ? d.toUTC().toISO() : null;
  }
  return null;
}

async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {
          // App Router cookies are immutable per request
        },
        remove() {
          // no-op
        },
      },
    }
  );
}

async function getLoggedInUserId(): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

async function getProfileWithGhlAndRoles(userId: string): Promise<ProfileRow | null> {
  const supabase = await getSupabaseServerClient();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, ghl_user_id')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    throw new Error('DB error loading profile');
  }
  if (!profile) return null;

    // Roles: user_roles → roles.code
    const { data: rolesRows, error: rolesError } = await supabase
    .from('user_roles')
    .select('roles ( code )')
    .eq('user_id', userId);

  if (rolesError) {
    throw new Error('DB error loading roles');
  }

  // roles can be an object or an array depending on the join shape
  const role_codes: string[] = (rolesRows ?? [])
    .flatMap((row: {
      roles: { code: string | null } | { code: string | null }[] | null;
    }) => {
      const r = row.roles;
      if (!r) return [];
      return Array.isArray(r) ? r.map(x => x.code) : [r.code];
    })
    .filter((c): c is string => Boolean(c));


  return {
    id: profile.id as string,
    ghl_user_id: (profile.ghl_user_id as string | null) ?? null,
    role_codes,
  };
}

function normalizeEvents(events: RawGhlEvent[], excludeCalendarIds: Set<string>): CoachOrMemberEvent[] {
  return events
    .filter((e) => !excludeCalendarIds.has(String(e.calendarId ?? '')))
    .map<CoachOrMemberEvent | null>((e) => {
      const start = toIsoUtc(e.startTime ?? e.start ?? e.from);
      const end = toIsoUtc(e.endTime ?? e.end ?? e.to);
      if (!start || !end) return null;

      return {
        id: String(e.id ?? e._id ?? `${e.calendarId ?? 'cal'}-${start}`),
        calendarId: String(e.calendarId ?? ''),
        groupId: e.groupId ?? null,
        title: e.title ?? e.name ?? null,
        status: e.appointmentStatus ?? e.status ?? null,
        start,
        end,
        contact: {
          id: e.contactId ?? e.contact?.id ?? null,
          name: e.contact?.name ?? null,
          email: e.contact?.email ?? null,
          phone: e.contact?.phone ?? null,
        },
        location: e.address ?? e.meetingLocation ?? null,
      };
    })
    .filter((it): it is CoachOrMemberEvent => it !== null)
    .sort((a, b) => (a.start < b.start ? -1 : 1));
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const days = clampDays(Number(url.searchParams.get('days') ?? '14'));
    const tzParam = url.searchParams.get('tz') || 'UTC';
    const tz = isValidIana(tzParam) ? tzParam : 'UTC';

    // 1) Auth → user id
    const userId = await getLoggedInUserId();
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 2) Profile + roles → interpret ghl_user_id
    const profile = await getProfileWithGhlAndRoles(userId);
    if (!profile) {
      return NextResponse.json({ message: 'Profile not found' }, { status: 404 });
    }

    const { ghl_user_id, role_codes } = profile;
    const isCoach = role_codes.some((code) => COACH_ROLE_CODES.includes(code as typeof COACH_ROLE_CODES[number]));

    if (!ghl_user_id) {
      return NextResponse.json(
        {
          message: isCoach
            ? 'No GHL user id stored for this coach.'
            : 'No GHL contact id stored for this user.',
        },
        { status: 400 }
      );
    }

    const trimmedGhlId = ghl_user_id.trim();

    // 3) Date range in viewer tz → epoch ms
    const { startMs, endMs } = rangeToEpochMillis(days, tz);
    const locationId = GHL.LOCATION_ID;

    // 4) Build correct GHL URL depending on role
    let apiUrl: string;

    if (isCoach) {
      apiUrl =
        `${GHL.BASE}/calendars/events` +
        `?locationId=${encodeURIComponent(locationId)}` +
        `&userId=${encodeURIComponent(trimmedGhlId)}` +
        `&startTime=${startMs}&endTime=${endMs}`;
    } else {
      apiUrl = `${GHL.BASE}/contacts/${encodeURIComponent(trimmedGhlId)}/appointments`;
    }

    const res = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${GHL.TOKEN}`,
        Version: GHL.VERSION,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json(
        { message: `GHL error ${res.status}`, detail: detail.slice(0, 2000) },
        { status: 502 }
      );
    }

    const payload: unknown = await res.json();

    // calendars/events → { events: [...] }
    // contact appointments → { appointments: [...] } or bare array
    const events: RawGhlEvent[] = Array.isArray(payload)
      ? payload
      : (Array.isArray((payload as { events?: unknown }).events)
          ? (payload as { events: RawGhlEvent[] }).events
          : Array.isArray((payload as { appointments?: unknown }).appointments)
          ? (payload as { appointments: RawGhlEvent[] }).appointments
          : []) as RawGhlEvent[];

    const EXCLUDE = new Set<string>([
      // place calendar IDs to exclude here
    ]);

    let items = normalizeEvents(events, EXCLUDE);

    // For contact appointments, if endpoint ignores date range, filter manually
    if (!isCoach) {
      items = items.filter((it) => {
        const ms = DateTime.fromISO(it.start).toMillis();
        return ms >= startMs && ms < endMs;
      });
    }

    return NextResponse.json({ timezone: tz, items });
  } catch (err: unknown) {
    return NextResponse.json(
      { message: 'Unexpected error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
