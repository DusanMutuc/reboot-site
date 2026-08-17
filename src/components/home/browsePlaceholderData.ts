import type { BrowseItem, BrowseRow, CourseItem } from './types';

/**
 * Courses, surfaced as their own rail. Started courses lead, since a
 * part-finished sequence pulls harder than an untouched one.
 */
export const placeholderCourses: CourseItem[] = [
  {
    id: 'c1',
    title: 'Lead follow-up system',
    partCount: 6,
    completedParts: 2,
    durationLabel: 'about 1h 10m',
    href: '#',
    thumbIndex: 3,
  },
  {
    id: 'c2',
    title: 'Getting out of the paperwork',
    partCount: 4,
    completedParts: 1,
    durationLabel: 'about 45m',
    href: '#',
    thumbIndex: 7,
  },
  {
    id: 'c3',
    title: 'Database reactivation campaign',
    partCount: 5,
    completedParts: 0,
    durationLabel: 'about 40m',
    href: '#',
    thumbIndex: 11,
  },
  {
    id: 'c4',
    title: 'Open house conversion system',
    partCount: 4,
    completedParts: 0,
    durationLabel: 'about 55m',
    href: '#',
    thumbIndex: 1,
  },
  {
    id: 'c5',
    title: 'Building the 15/30 list from scratch',
    partCount: 3,
    completedParts: 0,
    durationLabel: 'about 30m',
    href: '#',
    thumbIndex: 5,
  },
  {
    id: 'c6',
    title: 'The listing presentation, start to finish',
    partCount: 7,
    completedParts: 0,
    durationLabel: 'about 1h 30m',
    href: '#',
    thumbIndex: 13,
  },
];

/**
 * Placeholder browse rows.
 *
 * Each row is a *framing* over the catalogue rather than a content type —
 * "under 15 minutes", "scripts for your next call" — because someone browsing
 * without a specific goal is deciding on time and problem, not on whether a
 * thing happens to be a course or a playbook.
 *
 * Real rows resolve through `search_resources`, which already accepts
 * `_tag_ids`, `_duration`, `_types` and `_sort`. Which framings appear is
 * expected to rotate so a finite library feels different between visits;
 * `getBrowseRows` fakes that with an offset.
 */

/**
 * Thumbnails are assigned by running counter rather than by hand, so items
 * spread across the whole placeholder set instead of cycling three images.
 */
let thumbCursor = 0;

function item(
  id: string,
  title: string,
  typeLabel: string,
  durationLabel: string,
  progressPct: number | null = null,
): BrowseItem {
  return {
    id,
    title,
    typeLabel,
    durationLabel,
    href: '#',
    thumbIndex: thumbCursor++,
    progressPct,
  };
}

const POOL: BrowseRow[] = [
  {
    id: 'quick',
    label: 'Quick wins · under 15 minutes',
    items: [
      item('q1', 'The three-line follow-up text that gets replies', 'Playbook', '6 min'),
      item('q2', 'Asking for the referral without being weird', 'Recording', '11 min'),
      item('q3', 'Setting up your 15/30 list in one sitting', 'Playbook', '14 min', 40),
      item('q4', 'What to say when they say "just looking"', 'Script', '8 min'),
      item('q5', 'Pricing the first conversation', 'Recording', '12 min'),
      item('q6', 'Cleaning your database in fifteen minutes', 'Playbook', '15 min'),
      item('q7', 'The one question that qualifies a seller', 'Script', '5 min'),
    ],
  },
  {
    id: 'scripts',
    label: 'Scripts for your next call',
    items: [
      item('s1', 'Listing presentation — the full script', 'Script', '22 min'),
      item('s2', 'Handling "we already have an agent"', 'Script', '9 min'),
      item('s3', 'The price reduction conversation', 'Recording', '18 min'),
      item('s4', 'First call with an internet lead', 'Script', '13 min'),
      item('s5', 'Following up after an open house', 'Playbook', '10 min'),
      item('s6', 'Asking a past client for an introduction', 'Script', '7 min'),
    ],
  },
  {
    id: 'systems',
    label: 'Systems to set up once',
    items: [
      item('y1', 'Lead follow-up system', 'Course', '6 parts', 62),
      item('y2', 'Database reactivation campaign', 'Course', '5 parts'),
      item('y3', 'Open house conversion system', 'Course', '4 parts'),
      item('y4', 'Transaction paperwork handover', 'Playbook', '19 min'),
      item('y5', 'Weekly numbers review, in ten minutes', 'Playbook', '10 min'),
      item('y6', 'Your listing launch checklist', 'Playbook', '12 min'),
    ],
  },
  {
    id: 'start',
    label: 'Start here if you are new',
    items: [
      item('n1', 'How Reboot works — the short version', 'Recording', '9 min'),
      item('n2', 'Setting your first 90-day target', 'Playbook', '16 min'),
      item('n3', 'The numbers we ask you to track, and why', 'Recording', '14 min'),
      item('n4', 'Your first coaching call — what to bring', 'Playbook', '6 min'),
      item('n5', 'Lead follow-up system', 'Course', '6 parts', 62),
      item('n6', 'Building the 15/30 list from scratch', 'Course', '3 parts'),
    ],
  },
  {
    id: 'phone',
    label: 'For when the phone is not ringing',
    items: [
      item('p1', 'Turning a cold database into appointments', 'Episode', '31 min'),
      item('p2', 'Where your last ten deals actually came from', 'Playbook', '17 min'),
      item('p3', 'The 40-call day, structured', 'Recording', '24 min'),
      item('p4', 'Reactivating leads you wrote off', 'Course', '5 parts'),
      item('p5', 'Door knocking that does not feel awful', 'Recording', '20 min'),
      item('p6', 'Rebuilding momentum after a slow month', 'Episode', '27 min'),
    ],
  },
  {
    id: 'time',
    label: 'Getting your time back',
    items: [
      item('t1', 'Hiring your first assistant', 'Episode', '34 min'),
      item('t2', 'What to delegate first, and what never to', 'Playbook', '13 min'),
      item('t3', 'Assistant onboarding checklist', 'Playbook', '11 min'),
      item('t4', 'Your week, blocked properly', 'Recording', '21 min'),
      item('t5', 'Getting out of the paperwork', 'Course', '4 parts', 25),
      item('t6', 'Saying no to the wrong listing', 'Recording', '15 min'),
    ],
  },
];

const VISIBLE_ROWS = 2;

/**
 * Two framings at a time, offset so the selection changes between visits.
 * The real version would seed this per member per day.
 */
export function getBrowseRows(offset = 0): BrowseRow[] {
  const start = ((offset % POOL.length) + POOL.length) % POOL.length;
  return Array.from({ length: VISIBLE_ROWS }, (_, i) => POOL[(start + i) % POOL.length]);
}

export function parseBrowseOffset(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const browseRowCount = POOL.length;
