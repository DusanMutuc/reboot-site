import type { CallStatus, MeetingSlot, Priority, RequiredTraining } from './types';

/**
 * Placeholder content for the modules added after the review meeting.
 *
 * Priorities are the three action steps a coach sets from the systems
 * scorecard; every action step is expected to have a library item behind it,
 * and the CTA is simply omitted when one is missing.
 */

export const placeholderPriorities: Priority[] = [
  {
    id: 'p1',
    title: 'Build your 15/30 list and keep it active',
    detail: 'The guide takes about 8 minutes.',
    status: 'current',
    guideHref: '#',
  },
  {
    id: 'p2',
    title: 'Review your monthly profit and loss',
    detail: 'The guide takes about 12 minutes.',
    status: 'todo',
    guideHref: '#',
  },
  {
    id: 'p3',
    title: 'Book two weeks off before the end of the quarter',
    // Not everything a coach assigns has a library item behind it.
    detail: '',
    status: 'todo',
    guideHref: null,
  },
];

export const placeholderRequiredTraining: RequiredTraining = {
  title: 'Pricing conversations that hold',
  detail: '4 short videos · about 35 minutes',
  href: '#',
  progressPct: 25,
  contextLabel: 'Before your session on Thursday',
};

const BOOK_REVIEW = '#book-review';
const BOOK_IMPL = '#book-implementation';

/**
 * Both meetings are required to be on the calendar, so the scenarios worth
 * previewing are: one starting shortly, both booked, and one missing.
 */
export function getMeetings(scenario: CallStatus): MeetingSlot[] {
  const implementationBooked: MeetingSlot = {
    id: 'implementation',
    kind: 'Implementation Session',
    startsAt: '2026-08-21T10:00:00',
    whenLabel: 'Thursday 21 August, 10:00 am',
    relativeLabel: 'in 9 days',
    joinUrl: '#',
    bookUrl: BOOK_IMPL,
    imminent: false,
    prepLabel: null,
  };

  if (scenario === 'imminent') {
    return [
      {
        id: 'business_review',
        kind: '60-day Business Review',
        startsAt: '2026-08-14T14:00:00',
        whenLabel: 'Today at 2:00 pm',
        relativeLabel: 'starts in 12 minutes',
        joinUrl: '#',
        bookUrl: BOOK_REVIEW,
        imminent: true,
        prepLabel: null,
      },
      implementationBooked,
    ];
  }

  if (scenario === 'none') {
    return [
      {
        id: 'business_review',
        kind: '60-day Business Review',
        startsAt: null,
        whenLabel: null,
        relativeLabel: null,
        joinUrl: null,
        bookUrl: BOOK_REVIEW,
        imminent: false,
        prepLabel: null,
      },
      implementationBooked,
    ];
  }

  return [
    {
      id: 'business_review',
      kind: '60-day Business Review',
      startsAt: '2026-09-02T09:30:00',
      whenLabel: 'Tuesday 2 September, 9:30 am',
      relativeLabel: 'in 3 weeks',
      joinUrl: '#',
      bookUrl: BOOK_REVIEW,
      imminent: false,
      prepLabel: 'Bring your numbers for July and August.',
    },
    implementationBooked,
  ];
}
