import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';

const fields = new Set(['name', 'shared_kpis', 'shared_attendance', 'shared_notes', 'is_active', 'user_ids']);

export function validatePartnershipChanges(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Partnership changes must be an object.';
  const changes = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(changes)) {
    if (!fields.has(key)) return 'Unsupported partnership field.';
    if (key === 'name') {
      if (item !== null && typeof item !== 'string') return 'Partnership name must be text or null.';
    } else if (key === 'user_ids') {
      if (!Array.isArray(item) || item.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
        return 'Partnership members must be an array of account IDs.';
      }
    } else if (typeof item !== 'boolean') return 'Partnership sharing and active settings must be booleans.';
  }
  return null;
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function savePartnership(
  client: ReturnType<typeof getAdminClient>,
  id: string | null,
  changes: unknown,
): Promise<{ ok: true; data: unknown } | { ok: false; response: NextResponse }> {
  const validation = validatePartnershipChanges(changes);
  if (validation || (id !== null && !UUID_PATTERN.test(id))) {
    return { ok: false, response: NextResponse.json({ error: validation || 'Invalid partnership ID.' }, { status: 400 }) };
  }
  const { data, error } = await client.rpc('save_partnership_admin', { _id: id, _changes: changes });
  if (error) {
    const status = error.code === 'P0002' ? 404
      : ['23514', '23505', '23503', '22023', '22P02'].includes(error.code) ? 400
        : error.code === '42501' ? 409
          : ['40001', '40P01'].includes(error.code) ? 409 : 500;
    const message = ['40001', '40P01'].includes(error.code)
      ? 'Another partnership edit happened at the same time. Reload and try again.'
      : status === 500 ? 'Failed to save partnership.' : error.message;
    console.error('partnership mutation failed', { code: error.code });
    return { ok: false, response: NextResponse.json({ error: message }, { status }) };
  }
  if (!data || typeof data !== 'object' || typeof data.id !== 'string' || !Array.isArray(data.members)) {
    return { ok: false, response: NextResponse.json({ error: 'Partnership save returned an invalid response.' }, { status: 500 }) };
  }
  return { ok: true, data };
}
