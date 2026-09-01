import NinetyDayShell from '@/components/home/NinetyDayShell';
import NinetyDaySetupPending from '@/components/home/NinetyDaySetupPending';
import { getOnePageExtras } from '@/components/home/onePagePlaceholderData';
import type { HomeData } from '@/components/home/types';
import { loadNinetyDayProgramme } from '@/lib/ninetyDayProgramme';
import { getSupabaseServer } from '@/lib/supabaseServer';
import {
  fetchUserRoleCodes,
  hasRoleCode,
  resolveHomePathForRoleCodes,
} from '@/lib/userRoles';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Role-gated home backed by the member's active 90-day cycle.
 */
export default async function NinetyDayHomePage() {
  const supabase = getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const roleCodes = await fetchUserRoleCodes(supabase, user.id);
  if (!hasRoleCode(roleCodes, 'ninety-day-user')) {
    redirect(resolveHomePathForRoleCodes(roleCodes));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name')
    .eq('id', user.id)
    .maybeSingle();

  const memberFirstName =
    profile?.first_name?.trim() ||
    (typeof user.user_metadata?.first_name === 'string'
      ? user.user_metadata.first_name.trim()
      : '') ||
    user.email?.split('@')[0]?.trim() ||
    'Member';

  const programme = await loadNinetyDayProgramme(user.id);
  if (!programme) {
    return <NinetyDaySetupPending memberFirstName={memberFirstName} />;
  }

  const nextMeeting = programme.meetings[0] ?? null;

  const data: HomeData = {
    memberFirstName,
    callStatus: nextMeeting ? (nextMeeting.imminent ? 'imminent' : 'booked') : 'none',
    nextCall: nextMeeting
      ? {
          kind: nextMeeting.kind,
          coachName: null,
          whenLabel: nextMeeting.whenLabel ?? 'Upcoming',
          relativeLabel: nextMeeting.relativeLabel ?? '',
          joinUrl: nextMeeting.joinUrl,
          addToCalendarUrl: null,
        }
      : null,
    lastCall: null,
    bookingOptions: [],
    roomOptions: [],
    calendar: null,
    continueItem: null,
    browseTiles: [],
    latestEpisode: null,
    metrics: [],
    utilityLinks: [{ label: 'Get help', href: '/support' }],
  };
  const extras = {
    ...getOnePageExtras('typical'),
    helpSteps: [
      {
        title: 'Something is broken',
        detail: 'Login trouble, a missing training, or numbers that look wrong.',
        actionLabel: 'Contact support',
        href: '/support',
      },
    ],
    searchIndex: programme.searchIndex,
  };

  return (
    <NinetyDayShell
      data={data}
      extras={extras}
      meetings={programme.meetings}
      focus={programme.focus}
      week={programme.week}
      course={programme.course}
      systems={programme.systems}
      trackerMonths={programme.trackerMonths}
    />
  );
}
