import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { hasVerifiedSetupSession, requiresAccountSetup } from '@/lib/accountSetup';

// Keep the existing URL for clients. Completion now sets the password and clears
// the flag together after verifying the recovery session.
export async function POST(request: NextRequest) {
  const guard = await requireUser(request, { allowPastMember: true, allowPendingSetup: true });
  if (!guard.ok) return guard.res;
  if (!requiresAccountSetup(guard.user)) {
    return NextResponse.json({ error: 'Password setup is already complete. Use the password reset form to change your password.' }, { status: 409 });
  }
  try {
    const body: unknown = await request.json();
    const password = body && typeof body === 'object' && 'password' in body ? body.password : null;
    if (typeof password !== 'string' || password.length < 8 || password.length > 1024) {
      return NextResponse.json({ error: 'Choose a password between 8 and 1024 characters.' }, { status: 400 });
    }
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    const { data, error: claimsError } = await guard.supabase.auth.getClaims(token);
    if (!claimsError && data?.claims && guard.user.factors?.some((factor) => factor.status === 'verified') && data.claims.aal !== 'aal2') {
      return NextResponse.json({ error: 'Complete multi-factor authentication before choosing your password.', code: 'ACCOUNT_SETUP_MFA_REQUIRED' }, { status: 403 });
    }
    if (claimsError || !data?.claims || !hasVerifiedSetupSession(data.claims, guard.user)) {
      return NextResponse.json({ error: 'Open a fresh password setup link from your email before choosing your password.' }, { status: 403 });
    }
    const { error } = await getAdminClient().auth.admin.updateUserById(guard.user.id, {
      password,
      app_metadata: { ...guard.user.app_metadata, must_reset_password: false, setup_completed_at: new Date().toISOString() },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Password setup could not be completed. Please try again.' }, { status: 400 });
  }
}
