import type { OnePageExtras } from './types';

/**
 * Additional placeholder content for the one-page variant. Same wiring plan as
 * `placeholderData.ts`: action steps come from coaching notes, episodes from the
 * podcast route, attendance from `getUserEngagementSummary`.
 */
export const onePageExtras: OnePageExtras = {
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
    { title: 'Christmas prospect drop-offs', dateLabel: 'Nov 2025' },
    { title: '90-day consistency streak', dateLabel: 'Jun 2026' },
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
