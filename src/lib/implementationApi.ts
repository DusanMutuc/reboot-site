import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { RequireUserSuccess } from './requireUser';

// requireUser validates bearer tokens, but its bearer client does not attach
// that token to subsequent database requests. RPCs must receive the actor JWT.
export function implementationActorClient(request: NextRequest, guard: RequireUserSuccess) {
  const authorization = request.headers.get('authorization');
  return authorization?.toLowerCase().startsWith('bearer ')
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    }) : guard.supabase;
}

export function implementationError(error: unknown) {
  const db = error as { code?: string; message?: string };
  const unavailable = ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(db?.code ?? '');
  const status = unavailable ? 503 : db?.code === '40001' ? 409 : db?.code === '42501' ? 403
    : ['22023', '22P02', '23503', '23514'].includes(db?.code ?? '') ? 400 : 500;
  if (status === 500) console.error('Implementation workspace request failed:', error);
  return NextResponse.json({ error: unavailable ? 'The implementation database update has not been applied yet.'
    : status === 500 ? 'Could not complete this request. Please try again.' : db.message }, { status });
}

export function isImplementationAdmin(roles: readonly string[]) {
  return roles.includes('admin') || roles.includes('superadmin');
}

export function invalidImplementationRequest(message: string): never {
  throw Object.assign(new Error(message), { code: '22023' });
}
