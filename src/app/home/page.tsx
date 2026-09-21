import MomentumShell from '@/components/home/MomentumShell';
import { getMomentumHomeData } from '@/lib/momentumHomeData';
import { getSupabaseServer } from '@/lib/supabaseServer';
import {
  fetchUserRoleCodes,
  NINETY_DAY_HOME_PATH,
  resolveHomePathForRoleCodes,
} from '@/lib/userRoles';
import { redirect } from 'next/navigation';
import { isMemberDiscoveryEnabled } from '@/lib/discoveryFlags';

export const dynamic = 'force-dynamic';

/** The approved Momentum layout backed by the signed-in member's live data. */
export default async function HomePage() {
  const memberDiscoveryEnabled = isMemberDiscoveryEnabled();
  const supabase = getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const roleCodes = await fetchUserRoleCodes(supabase, user.id);
  if (resolveHomePathForRoleCodes(roleCodes) === NINETY_DAY_HOME_PATH) {
    redirect(NINETY_DAY_HOME_PATH);
  }

  const payload = await getMomentumHomeData({ memberDiscoveryEnabled });

  return (
    <MomentumShell
      data={payload.data}
      extras={payload.extras}
      meetings={payload.meetings}
      priorities={payload.priorities}
      requiredTraining={payload.requiredTraining}
      trainingStanding={payload.trainingStanding}
      recommended={payload.recommended}
      content={payload.content}
      discoveryResultSets={payload.discoveryResultSets}
      memberDiscoveryEnabled={memberDiscoveryEnabled}
      legendAccess={payload.isLegend ? 'legend' : 'standard'}
      year={payload.year}
    />
  );
}
