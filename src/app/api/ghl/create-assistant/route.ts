import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import type { User } from '@supabase/supabase-js';
import { getAdminClient } from '@/lib/supabaseAdmin';

const ROLE_CODE = 'assistant';
const DEFAULT_PASSWORD = 'reboot';
const ASSISTANT_TAGS = new Set(['assistant agreement', 'assistant workroom']);
const MAX_USER_PAGE_SIZE = 200;

type GhlWebhookPayload = {
  email?: unknown;
  phone?: unknown;
  first_name?: unknown;
  firstName?: unknown;
  last_name?: unknown;
  lastName?: unknown;
  full_name?: unknown;
  fullName?: unknown;
  name?: unknown;
  tags?: unknown;
  contact?: {
    email?: unknown;
    phone?: unknown;
    first_name?: unknown;
    firstName?: unknown;
    last_name?: unknown;
    lastName?: unknown;
    full_name?: unknown;
    fullName?: unknown;
    name?: unknown;
    tags?: unknown;
  } | null;
};

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.GHL_ASSISTANT_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error('[ghl:create-assistant] Missing GHL_ASSISTANT_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Webhook secret is not configured' }, { status: 500 });
  }

  const providedSecret = request.headers.get('x-ghl-secret') ?? '';
  if (!providedSecret || !secureCompare(providedSecret, expectedSecret)) {
    console.warn('[ghl:create-assistant] Invalid or missing x-ghl-secret header');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: GhlWebhookPayload;
  try {
    payload = (await request.json()) as GhlWebhookPayload;
  } catch (err) {
    console.error('[ghl:create-assistant] Failed to parse JSON payload', err);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const normalizedTags = normalizeTags(payload.tags ?? payload.contact?.tags);
  const matchedTag = findAssistantTag(normalizedTags);
  if (!matchedTag) {
    console.log('[ghl:create-assistant] Skipping payload without assistant tags');
    return NextResponse.json({ skipped: true, reason: 'Tag mismatch' }, { status: 202 });
  }

  const email = extractEmail(payload);
  if (!email) {
    return NextResponse.json({ error: 'Missing contact email' }, { status: 400 });
  }

  const { firstName, lastName } = deriveNames(payload);
  const phone = extractPhone(payload);

  const supa = getAdminClient();

  const { data: roleRow, error: roleErr } = await supa
    .from('roles')
    .select('id')
    .eq('code', ROLE_CODE)
    .maybeSingle();

  if (roleErr) {
    console.error('[ghl:create-assistant] Role lookup error', roleErr);
    return NextResponse.json({ error: roleErr.message }, { status: 400 });
  }
  if (!roleRow?.id) {
    console.error('[ghl:create-assistant] Role not configured', ROLE_CODE);
    return NextResponse.json({ error: 'Assistant role not configured' }, { status: 400 });
  }

  let userId: string | null = null;
  let created = false;

  const { data: createdUser, error: createErr } = await supa.auth.admin.createUser({
    email,
    password: DEFAULT_PASSWORD,
    phone: phone ?? undefined,
    email_confirm: true,
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      source: 'ghl-webhook',
    },
    app_metadata: {
      must_reset_password: true,
      created_by: 'ghl_webhook',
    },
  });

  if (createErr) {
    if (isDuplicateUserError(createErr.message)) {
      try {
        const existing = await findUserByEmail(supa, email);
        if (!existing) {
          return NextResponse.json({ error: 'User already exists with this email' }, { status: 409 });
        }
        userId = existing.id;
        console.log('[ghl:create-assistant] Reusing existing auth user', userId);
        await supa.auth.admin.updateUserById(userId, {
          phone: phone ?? undefined,
          user_metadata: {
            ...(existing.user_metadata || {}),
            first_name: firstName,
            last_name: lastName,
            source: 'ghl-webhook',
          },
          app_metadata: {
            ...(existing.app_metadata || {}),
            must_reset_password: true,
          },
        });
      } catch (lookupErr) {
        console.error('[ghl:create-assistant] Failed to resolve existing user after duplicate email', lookupErr);
        return NextResponse.json({ error: 'Duplicate email lookup failed' }, { status: 500 });
      }
    } else {
      console.error('[ghl:create-assistant] Auth create error', createErr);
      return NextResponse.json({ error: createErr.message }, { status: 400 });
    }
  } else {
    userId = createdUser?.user?.id ?? null;
    created = true;
  }

  if (!userId) {
    console.error('[ghl:create-assistant] User creation failed to return an id');
    return NextResponse.json({ error: 'User creation failed' }, { status: 500 });
  }

  const { error: profileErr } = await supa
    .from('profiles')
    .upsert({ id: userId, first_name: firstName, last_name: lastName }, { onConflict: 'id' });
  if (profileErr) {
    console.error('[ghl:create-assistant] Profile upsert error', profileErr);
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  const { error: linkErr } = await supa
    .from('user_roles')
    .upsert({ user_id: userId, role_id: roleRow.id }, { onConflict: 'user_id,role_id', ignoreDuplicates: true });
  if (linkErr) {
    console.error('[ghl:create-assistant] Role assignment error', linkErr);
    return NextResponse.json({ error: linkErr.message }, { status: 400 });
  }

  console.log('[ghl:create-assistant] Assistant ready', { userId, created, matchedTag });

  return NextResponse.json(
    {
      ok: true,
      user_id: userId,
      created,
      tag: matchedTag,
    },
    { status: created ? 201 : 200 }
  );
}

function secureCompare(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function normalizeTags(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((tag) => {
        if (typeof tag === 'string') return tag;
        if (tag && typeof tag === 'object' && 'name' in tag && typeof (tag as { name?: unknown }).name === 'string') {
          return (tag as { name: string }).name;
        }
        return null;
      })
      .filter((tag): tag is string => Boolean(tag))
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function findAssistantTag(tags: string[]): string | null {
  for (const tag of tags) {
    if (ASSISTANT_TAGS.has(tag)) return tag;
  }
  return null;
}

function extractEmail(payload: GhlWebhookPayload): string | null {
  const candidate = getString(payload.email) ?? getString(payload.contact?.email);
  if (!candidate) return null;
  const normalized = candidate.toLowerCase();
  return normalized.includes('@') ? normalized : null;
}

function extractPhone(payload: GhlWebhookPayload): string | null {
  const candidate = getString(payload.phone) ?? getString(payload.contact?.phone);
  if (!candidate) return null;
  return candidate;
}

function deriveNames(payload: GhlWebhookPayload): { firstName: string; lastName: string } {
  let first =
    getString(payload.first_name) ||
    getString(payload.firstName) ||
    getString(payload.contact?.first_name) ||
    getString(payload.contact?.firstName) ||
    '';
  let last =
    getString(payload.last_name) ||
    getString(payload.lastName) ||
    getString(payload.contact?.last_name) ||
    getString(payload.contact?.lastName) ||
    '';
  const full =
    getString(payload.full_name) ||
    getString(payload.fullName) ||
    getString(payload.name) ||
    getString(payload.contact?.full_name) ||
    getString(payload.contact?.fullName) ||
    getString(payload.contact?.name) ||
    '';

  if (full) {
    const parts = full.split(/\s+/).filter(Boolean);
    if (!first && parts.length) {
      first = parts[0];
    }
    if (!last && parts.length > 1) {
      last = parts.slice(1).join(' ');
    }
  }

  if (!first) first = 'Assistant';
  return { firstName: first, lastName: last };
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isDuplicateUserError(message?: string | null): boolean {
  if (!message) return false;
  return /already registered|duplicate/i.test(message);
}

async function findUserByEmail(client: ReturnType<typeof getAdminClient>, email: string): Promise<User | null> {
  const normalized = email.toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: MAX_USER_PAGE_SIZE });
    if (error) throw error;
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email || '').toLowerCase() === normalized);
    if (match) return match;
    if (users.length < MAX_USER_PAGE_SIZE) break;
    page += 1;
  }
  return null;
}
