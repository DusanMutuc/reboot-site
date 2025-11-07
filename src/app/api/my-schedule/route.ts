// app/api/my-schedule/route.ts
import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { GHL } from "@/lib/config";

export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  ghl_user_id: string | null;
};

function clampDays(n: number) {
  return n === 1 || n === 7 || n === 14 ? n : 14;
}

function isValidIana(tz: string) {
  return DateTime.local().setZone(tz).isValid;
}

function rangeToEpochMillis(days: number, tz: string) {
  const startLocal = DateTime.now().setZone(tz).startOf("day");
  const endLocal = startLocal.plus({ days });
  return { startMs: startLocal.toUTC().toMillis(), endMs: endLocal.toUTC().toMillis() };
}

function toIsoUtc(v: unknown): string | null {
  if (typeof v === "number") return DateTime.fromMillis(v).toUTC().toISO();
  if (typeof v === "string") {
    const d = DateTime.fromISO(v, { setZone: true });
    return d.isValid ? d.toUTC().toISO() : null;
  }
  return null;
}

async function getLoggedInUserId(): Promise<string | null> {
  // Supabase SSR client wired to Next.js cookies
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {
          // Next.js App Router cookies are immutable per request; no-op is fine here.
        },
        remove() {
          // no-op
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

async function getProfileWithGhlUserId(userId: string): Promise<ProfileRow | null> {
  // Query using the same SSR-style client (inherits RLS from the session)
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data, error } = await supabase
    .from("profiles")
    .select("id, ghl_user_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // Surface a friendly message but avoid leaking internals
    throw new Error(`DB error loading profile`);
  }
  return data;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const days = clampDays(Number(url.searchParams.get("days") ?? "14"));
    const tzParam = url.searchParams.get("tz") || "UTC";
    const tz = isValidIana(tzParam) ? tzParam : "UTC";

    // 1) Auth → user id
    const userId = await getLoggedInUserId();
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // 2) Profile → ghl_user_id (now from profiles, not coach_profiles)
    const profile = await getProfileWithGhlUserId(userId);
    const ghlUserId = profile?.ghl_user_id?.trim();
    if (!ghlUserId) {
      return NextResponse.json(
        { message: "No GHL user id stored for this user." },
        { status: 400 }
      );
    }

    // 3) Date range in the viewer's tz → epoch ms
    const { startMs, endMs } = rangeToEpochMillis(days, tz);

    // 4) Call GHL events by user
    const locationId = GHL.LOCATION_ID; // hardcoded via env
    const apiUrl =
      `${GHL.BASE}/calendars/events` +
      `?locationId=${encodeURIComponent(locationId)}` +
      `&userId=${encodeURIComponent(ghlUserId)}` +
      `&startTime=${startMs}&endTime=${endMs}`;

    const res = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${GHL.TOKEN}`,
        Version: GHL.VERSION,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { message: `GHL error ${res.status}`, detail: detail.slice(0, 2000) },
        { status: 502 }
      );
    }

    const payload = (await res.json()) as { events?: unknown[] } | unknown[];
    const events = Array.isArray(payload) ? payload : payload?.events ?? [];

    // 5) (Optional) exclude specific calendarIds here if desired
    const EXCLUDE = new Set<string>([
      // "Yt09j3xdpLgpyFl9y5Yx", // e.g., Bri's Assistant Onboarding
    ]);

    // 6) Normalize
    const items = (events as Record<string, unknown>[])
      .filter((e) => !EXCLUDE.has(String(e.calendarId ?? "")))
      .map((e) => {
        const start = toIsoUtc(e.startTime ?? e.start ?? e.from);
        const end = toIsoUtc(e.endTime ?? e.end ?? e.to);
        return {
          id: String(e.id ?? e._id ?? `${e.calendarId ?? "cal"}-${start ?? Date.now()}`),
          calendarId: String(e.calendarId ?? ""),
          groupId: e.groupId ?? null,
          title: e.title ?? e.name ?? null,
          status: (e as any).appointmentStatus ?? (e as any).status ?? null,
          start, // ISO UTC
          end,   // ISO UTC
          contact: {
            id: (e as any).contactId ?? null,
            name: (e as any).contact?.name ?? null,
            email: (e as any).contact?.email ?? null,
            phone: (e as any).contact?.phone ?? null,
          },
          location: (e as any).address ?? (e as any).meetingLocation ?? null, // Zoom link or other
        };
      })
      .filter((it) => it.start && it.end)
      .sort((a, b) => (a.start! < b.start! ? -1 : 1));

    // 7) Return viewer tz for consistent rendering client-side
    return NextResponse.json({ timezone: tz, items });
  } catch (err: unknown) {
    return NextResponse.json(
      { message: "Unexpected error", detail: String((err as Error)?.message ?? err) },
      { status: 500 }
    );
  }
}
