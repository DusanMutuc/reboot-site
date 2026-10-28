import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getSupportConfig, handleSupportRequest, type SupportReservation } from '@/lib/supportServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handleSupportRequest(request, {
    config: getSupportConfig(),
    // Vercel overwrites this header. Other deployments conservatively share a
    // network quota rather than trusting a spoofable forwarding header.
    network: process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'unknown' : 'unknown',
    async identity() {
      const session = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} },
      });
      const { data: { user }, error } = await session.auth.getUser();
      if (error && error.name !== 'AuthSessionMissingError' && error.status !== 401 && error.status !== 403) throw new Error('Identity unavailable');
      if (!user) return null;
      if (!user.email) throw new Error('Reply email unavailable');
      const { data: profile } = await getAdminClient().from('profiles').select('first_name,last_name').eq('id', user.id).maybeSingle();
      return { id: user.id, email: user.email, name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null };
    },
    repository() {
      const admin = getAdminClient();
      return {
        async prepare(values) {
          const { data, error } = await admin.rpc('prepare_support_request', values);
          if (error || !data?.[0]) throw new Error('Support storage unavailable');
          return data[0] as SupportReservation;
        },
        async reserve(id, lease, payload) {
          const { data, error } = await admin.rpc('reserve_support_request', { _id: id, _lease: lease, _delivery_payload: payload });
          if (error) throw new Error('Support storage unavailable');
          return data === true;
        },
        async finish(id, lease, outcome, providerId = null) {
          const { data, error } = await admin.rpc('finish_support_request', { _id: id, _lease: lease, _outcome: outcome, _provider_id: providerId });
          if (error || data !== true) throw new Error('Support delivery status unavailable');
        },
      };
    },
  });
}
