import type { CallStatus, HomeData } from './types';

/**
 * Placeholder content for design review. Nothing here is wired to Supabase or
 * GHL yet — real values will come from `/api/my-schedule`, the podcast episodes
 * route, course progress, and the KPI tables. Keeping it in one module means
 * wiring is a swap of this import, not a component refactor.
 */

const BASE: Omit<HomeData, 'callStatus' | 'nextCall' | 'lastCall'> = {
  memberFirstName: 'Dusan',

  bookingOptions: [
    { label: 'Momentum coach', coachName: 'your Momentum coach', href: '#' },
    { label: 'Implementation coach', coachName: 'your Implementation coach', href: '#' },
  ],

  roomOptions: [
    { label: 'Reboot coaching Zoom', href: '#' },
    { label: 'Assistant workroom', href: '#' },
  ],

  calendar: { label: 'Reboot calendar', href: '#' },

  continueItem: {
    title: 'Lead follow-up system',
    contextLabel: 'Part 3 of 6 · about 12 minutes left',
    href: '#',
    progressPct: 62,
    nextUpLabel: 'The seven-day cadence',
  },

  browseTiles: [
    { key: 'courses', label: 'Courses', href: '/courses' },
    { key: 'library', label: 'Library', href: '/library' },
    { key: 'podcast', label: 'Podcast', href: '#' },
    { key: 'explainers', label: 'Explainers', href: '#' },
  ],

  latestEpisode: {
    title: 'Turning a cold database into listing appointments',
    episodeLabel: 'Episode 48',
    durationLabel: '31 min',
    href: '#',
    isNew: true,
  },

  // The four Ben chose for the snapshot. Profit came out because the tracker
  // holds it and the snapshot is not the tracker; "days off" became holidays
  // taken, since a day here and there is not what a member is trying to book.
  metrics: [
    { label: 'Closed deals', value: '21', deltaPct: 8 },
    { label: 'Gross revenue', value: '$128,400', deltaPct: 12 },
    { label: '15/30 list', value: '38', deltaPct: 5 },
    { label: 'Holidays taken', value: '4', deltaPct: null },
  ],

  // The calendar has moved into the sticky bar's Calls menu; a schedule is a
  // calls question, not a utility link sitting beside the privacy policy.
  utilityLinks: [
    { label: 'Facebook group', href: '#' },
    { label: 'Refer an agent', href: '#' },
    { label: 'Find an agent to refer to', href: '#' },
    { label: 'Assistant onboarding', href: '#' },
    { label: 'Get help', href: '/support' },
  ],
};

/**
 * All three band states are reachable via `?state=` so the design can be
 * reviewed without waiting for a real appointment to fall into place.
 */
export function getPlaceholderHomeData(status: CallStatus = 'imminent'): HomeData {
  if (status === 'none') {
    return {
      ...BASE,
      callStatus: 'none',
      nextCall: null,
      lastCall: { relativeLabel: '3 weeks ago' },
    };
  }

  if (status === 'booked') {
    return {
      ...BASE,
      callStatus: 'booked',
      nextCall: {
        kind: 'Momentum call',
        coachName: null,
        whenLabel: 'Thursday 21 August, 10:00 am',
        relativeLabel: 'in 9 days',
        joinUrl: null,
        addToCalendarUrl: '#',
      },
      lastCall: null,
    };
  }

  return {
    ...BASE,
    callStatus: 'imminent',
    nextCall: {
      kind: 'Momentum call',
      coachName: 'your coach',
      whenLabel: 'Today at 2:00 pm',
      relativeLabel: 'starts in 12 minutes',
      joinUrl: '#',
      addToCalendarUrl: null,
    },
    lastCall: null,
  };
}

export function parseCallStatus(raw: string | undefined): CallStatus {
  return raw === 'none' || raw === 'booked' ? raw : 'imminent';
}
