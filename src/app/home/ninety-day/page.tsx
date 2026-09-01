import { redirect } from 'next/navigation';

import NinetyDayDashboard from '@/components/ninetyDay/NinetyDayDashboard';
import NinetyDaySetupPending from '@/components/ninetyDay/NinetyDaySetupPending';
import { loadNinetyDayProgramme } from '@/lib/ninetyDayProgramme';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { fetchUserRoleCodes, NINETY_DAY_HOME_PATH, resolveHomePathForRoleCodes } from '@/lib/userRoles';

export const dynamic = 'force-dynamic';

export default async function NinetyDayHomePage() {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const roleCodes = await fetchUserRoleCodes(supabase, user.id);
  const homePath = resolveHomePathForRoleCodes(roleCodes);
  if (homePath !== NINETY_DAY_HOME_PATH) redirect(homePath);

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name')
    .eq('id', user.id)
    .maybeSingle();
  const memberFirstName =
    profile?.first_name?.trim() ||
    (typeof user.user_metadata?.first_name === 'string' ? user.user_metadata.first_name.trim() : '') ||
    user.email?.split('@')[0]?.trim() ||
    'Member';

  const programme = await loadNinetyDayProgramme(user.id);
  if (!programme) return <NinetyDaySetupPending memberFirstName={memberFirstName} />;

  return <NinetyDayDashboard memberFirstName={memberFirstName} programme={programme} />;
}
