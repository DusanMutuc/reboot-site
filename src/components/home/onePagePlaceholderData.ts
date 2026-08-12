import type { ActionStep, Episode, OnePageExtras } from './types';

/** Content volume, so the layout can be reviewed under stress and when empty. */
export type ContentVolume = 'typical' | 'heavy' | 'empty';

export function parseVolume(raw: string | undefined): ContentVolume {
  return raw === 'heavy' || raw === 'empty' ? raw : 'typical';
}

/**
 * Additional placeholder content for the one-page variant. Same wiring plan as
 * `placeholderData.ts`: action steps come from coaching notes, episodes from the
 * podcast route, attendance from `getUserEngagementSummary`.
 */
const TYPICAL: OnePageExtras = {
  actionSteps: [
    { id: 'a1', label: '15/30 list built and active', status: 'in_progress', href: '#' },
    { id: 'a2', label: 'Monthly profit and loss reviewed', status: 'not_started', href: '#' },
    { id: 'a3', label: 'Paperwork fully delegated', status: 'complete', href: '#' },
  ],

  episodes: [
    {
      title: 'Turning a cold database into listing appointments',
      episodeLabel: 'Episode 48',
      durationLabel: '31 min',
      publishedLabel: '4 days ago',
      href: '#',
      isNew: true,
    },
    {
      title: 'The three-call follow-up sequence that closed 11 deals',
      episodeLabel: 'Episode 47',
      durationLabel: '27 min',
      publishedLabel: '2 weeks ago',
      href: '#',
      isNew: false,
    },
    {
      title: 'Hiring your first assistant without losing control',
      episodeLabel: 'Episode 46',
      durationLabel: '34 min',
      publishedLabel: '3 weeks ago',
      href: '#',
      isNew: false,
    },
    {
      title: 'Why your listing presentation is losing to a worse agent',
      episodeLabel: 'Episode 45',
      durationLabel: '22 min',
      publishedLabel: 'last month',
      href: '#',
      isNew: false,
    },
    {
      title: 'Pricing conversations that do not end in a reduction',
      episodeLabel: 'Episode 44',
      durationLabel: '29 min',
      publishedLabel: 'last month',
      href: '#',
      isNew: false,
    },
  ],

  wins: [
    { text: 'Closed the Harrison listing at full asking', dateLabel: '3 days ago' },
    { text: 'Delegated all contract paperwork to my assistant', dateLabel: '2 weeks ago' },
  ],

  achievements: [
    { title: 'Christmas prospect drop-offs', dateLabel: 'Nov 2025', imageUrl: null },
    { title: '90-day consistency streak', dateLabel: 'Jun 2026', imageUrl: null },
  ],

  attendance: {
    attendedCount: 7,
    totalCount: 8,
    periodLabel: 'last 8 weeks',
    streakLabel: '5 in a row',
  },

  helpSteps: [
    {
      title: 'Ask your coach',
      detail: 'Fastest route for anything about your business or your numbers.',
      actionLabel: 'Book a call',
      href: '#calls',
    },
    {
      title: 'Ask the group',
      detail: 'Other Reboot agents have almost certainly hit the same wall.',
      actionLabel: 'Open Facebook group',
      href: '#',
    },
    {
      title: 'Something is broken',
      detail: 'Login trouble, a missing course, numbers that look wrong.',
      actionLabel: 'Contact support',
      href: '/support',
    },
  ],

  searchIndex: [
    { title: 'Lead follow-up system', typeLabel: 'Course', href: '#' },
    { title: '15/30 list playbook', typeLabel: 'Playbook', href: '#' },
    { title: 'Listing presentation script', typeLabel: 'Playbook', href: '#' },
    { title: 'Monthly profit and loss template', typeLabel: 'Worksheet', href: '#' },
    { title: 'Assistant onboarding checklist', typeLabel: 'Worksheet', href: '#' },
    { title: 'Database reactivation campaign', typeLabel: 'Course', href: '#' },
    { title: 'Pricing conversation framework', typeLabel: 'Playbook', href: '#' },
    { title: 'Delegating contract paperwork', typeLabel: 'Recording', href: '#' },
    { title: 'Open house conversion system', typeLabel: 'Course', href: '#' },
    { title: 'Referral request scripts', typeLabel: 'Playbook', href: '#' },
  ],
};

/** Twenty action steps and forty episodes: does the page still hold together? */
const HEAVY: OnePageExtras = {
  ...TYPICAL,
  actionSteps: Array.from({ length: 20 }, (_, i): ActionStep => ({
    id: `h${i}`,
    label: [
      'Build the 15/30 list and keep it active',
      'Review monthly profit and loss with your coach',
      'Delegate all contract paperwork',
      'Run the database reactivation campaign',
      'Script and rehearse the listing presentation',
    ][i % 5] + ` (week ${i + 1})`,
    status: (['not_started', 'in_progress', 'complete'] as const)[i % 3],
    href: '#',
  })),
  episodes: Array.from({ length: 40 }, (_, i): Episode => ({
    title: [
      'Turning a cold database into listing appointments',
      'The three-call follow-up sequence that closed 11 deals',
      'Hiring your first assistant without losing control',
      'Why your listing presentation is losing to a worse agent',
    ][i % 4],
    episodeLabel: `Episode ${48 - i}`,
    durationLabel: `${22 + (i % 15)} min`,
    publishedLabel: i === 0 ? '4 days ago' : `${i} weeks ago`,
    href: '#',
    isNew: i === 0,
  })),
  wins: Array.from({ length: 12 }, (_, i) => ({
    text: `Win number ${i + 1} that a member logged after a coaching call`,
    dateLabel: `${i + 1} weeks ago`,
  })),
  achievements: Array.from({ length: 9 }, (_, i) => ({
    title: `Achievement ${i + 1}`,
    dateLabel: 'Jun 2026',
    imageUrl: null,
  })),
};

/** A brand-new member: every section is empty. */
const EMPTY: OnePageExtras = {
  ...TYPICAL,
  actionSteps: [],
  episodes: [],
  wins: [],
  achievements: [],
  attendance: { attendedCount: 0, totalCount: 0, periodLabel: 'last 8 weeks', streakLabel: null },
};

export function getOnePageExtras(volume: ContentVolume = 'typical'): OnePageExtras {
  if (volume === 'heavy') return HEAVY;
  if (volume === 'empty') return EMPTY;
  return TYPICAL;
}

export const onePageExtras = TYPICAL;
