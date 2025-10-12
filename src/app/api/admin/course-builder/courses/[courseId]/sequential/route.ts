import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/requireAdmin';
import { getSupabaseServiceClient } from '@/lib/supabaseServiceClient';

function parseCourseId(raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Invalid courseId');
  }
  return value;
}

function parseEnabledFlag(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Missing toggle payload');
  }

  const { on } = payload as { on?: unknown };
  if (typeof on !== 'boolean') {
    throw new Error('Invalid toggle payload');
  }

  return on;
}

export async function POST(request: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.res;
  }

  try {
    const { courseId: rawCourseId } = await context.params;
    const courseId = parseCourseId(rawCourseId);

    const body = await request.json();
    const enabled = parseEnabledFlag(body);

    const supabase = getSupabaseServiceClient();

    const { error } = await supabase.rpc('enforce_strict_sequence', {
      _root_id: courseId,
      _on: enabled,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update sequential unlock';
    const invalidRequest =
      error instanceof Error &&
      (error.message.includes('Invalid') || error.message === 'Missing toggle payload');
    const status = invalidRequest ? 400 : 500;
    return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
