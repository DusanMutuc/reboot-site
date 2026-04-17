import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { buildMobileHandoffRedirectUrl } from '@/lib/mobileHandoff';
import { requireUser } from '@/lib/requireUser';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;

  const email = guard.user.email?.trim();
  if (!email) {
    return NextResponse.json(
      { error: 'Unable to create handoff link for an account without email auth.' },
      { status: 400 },
    );
  }

  const redirectTo = buildMobileHandoffRedirectUrl(
    request.nextUrl.origin,
    request.nextUrl.searchParams.get('next'),
  );

  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo,
    },
  });

  if (error) {
    return NextResponse.json(
      { error: 'Unable to create handoff link.', details: error.message },
      { status: 500 },
    );
  }

  const url = data.properties?.action_link;
  if (!url) {
    return NextResponse.json({ error: 'Unable to create handoff link.' }, { status: 500 });
  }

  return NextResponse.json({ url });
}
