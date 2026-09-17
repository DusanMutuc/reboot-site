import type {
  ContentItem,
  CurrentFocus,
  MeetingSlot,
  ProgrammeWeek,
  RequiredTraining,
  SearchItem,
  ProgrammeMonth,
} from './types';

/**
 * Placeholder content for the 90-day offer home.
 *
 * Nothing here is wired to Supabase yet. The shapes are the point: each one is
 * either a type the standard home already uses — so the module renders
 * unchanged — or a small new type whose backing table does not exist. Keeping
 * them in one module means wiring is a swap of this import.
 */

/* ---------------------------------------------------------- the meeting ---- */

const WEEK_CALL_ZOOM = process.env.NINETY_DAY_WEEKLY_CALL_URL?.trim() || null;

/**
 * The weekly group call, in the band's own shape.
 *
 * Almost a pure source swap: `MeetingBand` renders this array with the logic
 * it already had. What does not survive the swap is the band's premise. Its
 * three modes assume a meeting the member arranges, so the mode it spends the
 * most design on — dark textured field, "Nothing booked yet", a turquoise call
 * to action — exists to confront an empty slot as an omission. A cohort call
 * is on the calendar whether the member does anything or not. There is no
 * omission, so that mode never fires here.
 *
 * The same premise put a Reschedule button on the state that *does* fire, and
 * that one is not merely unused — it is a control offering something the
 * member cannot have. Hence `reschedulable`, and hence a booked band with no
 * action beside it. Reporting a fact is a legitimate thing for a band to do;
 * offering a move that does not exist is not.
 */
export function getWeeklyMeeting(scenario: 'imminent' | 'booked' = 'booked'): MeetingSlot[] {
  if (scenario === 'imminent') {
    return [
      {
        id: 'weekly_group',
        kind: 'weekly group call',
        startsAt: '2026-08-31T13:00:00',
        whenLabel: 'Today at 1:00 pm',
        relativeLabel: 'starts in 20 minutes',
        joinUrl: WEEK_CALL_ZOOM,
        bookUrl: WEEK_CALL_ZOOM ?? '#weekly-call',
        imminent: true,
        prepLabel: 'Week 3 — the 15/30 list.',
        prepHref: null,
        prepSubmitted: false,
        reschedulable: false,
      },
    ];
  }

  return [
    {
      id: 'weekly_group',
      kind: 'weekly group call',
      startsAt: '2026-09-03T13:00:00',
      whenLabel: 'Wednesday 3 September, 1:00 pm',
      relativeLabel: 'in 3 days',
      joinUrl: WEEK_CALL_ZOOM,
      bookUrl: WEEK_CALL_ZOOM ?? '#weekly-call',
      imminent: false,
      prepLabel: 'Week 3 — the 15/30 list.',
      prepHref: null,
      prepSubmitted: false,
      reschedulable: false,
    },
  ];
}

/* ------------------------------------------------------- the group's focus --- */

export const placeholderProgrammeWeek: ProgrammeWeek = {
  current: 3,
  total: 13,
};

export const placeholderCurrentFocus: CurrentFocus = {
  id: 'focus-w3',
  title: 'Build your 15/30 list and keep it active',
  /**
   * One clause, naming what the first move costs — the same sentence shape the
   * standard home's priorities use. It said more once, and what it added was
   * either a schedule the focus does not run on or prose the module does not
   * carry.
   */
  detail: 'The system takes about 14 minutes.',
  guideHref: '/library/crm-organized-and-managed',
};

/* -------------------------------------------------------- the one course --- */

export const placeholderCompassCourse: RequiredTraining = {
  heroUrl: null,
  title: 'Set Your Compass',
  href: '#',
  /**
   * No deadline. On the standard home this reads "Before Thursday's session",
   * because the course is set for one sixty-day period and the next review
   * replaces it. This one runs the whole ninety days, so a date here would
   * invent an urgency the programme does not have.
   */
  contextLabel: 'Runs the whole programme',
  parts: [
    {
      title: 'Where the business actually is',
      minutes: 12,
      description:
        'The four figures you need in front of you before any of the rest is worth doing, and where to find each one.',
      done: true,
    },
    {
      title: 'The number that decides everything else',
      minutes: 9,
      description:
        'Why picking the wrong headline number quietly sets the next ninety days against you, and how to tell which one yours is.',
      done: true,
    },
    {
      title: 'Choosing what you will not do',
      minutes: 11,
      description:
        'The half of a plan nobody writes down, and the reason most ninety-day pushes stall in week five.',
      done: false,
    },
    {
      title: 'Your ninety-day target, written down',
      minutes: 10,
      description:
        'Turning the number into something you can check on a Friday, in a form that survives a bad fortnight.',
      done: false,
    },
    {
      title: 'The weekly rhythm that holds it',
      minutes: 8,
      description:
        'What the ten minutes before the group call are for, and what to bring so the hour is worth an hour.',
      done: false,
    },
  ],
};

/* ------------------------------------------------------ the eight systems --- */

/**
 * One tile, resolved against the real library.
 *
 * Titles and slugs are the published `content_nodes` rows rather than the
 * programme's shorthand for them, and that is deliberate. These tiles link to
 * library pages: a member who clicks "Project Hire" and lands on a page headed
 * "Hiring Your First Assistant" has to stop and work out whether they got the
 * right thing. Identification only works when it is the same name in both
 * places — the same argument the required-training card makes for using the
 * course's own hero art rather than something commissioned for the slot.
 *
 * Durations are absent because nothing here knows them yet, and an invented
 * "12 min" on a real library item is a worse placeholder than none: it passes
 * review by looking finished. The card already handles an empty meta.
 */
const HERO_BUCKET = 'course-heroes';

/**
 * The library's own artwork, resolved the way the rest of the app resolves it.
 *
 * Built from `NEXT_PUBLIC_SUPABASE_URL` rather than by calling `getPublicUrl`,
 * because this module is imported by a server component and the client helper
 * in `components/library/shared.ts` is `'use client'`. The output is the same
 * string that helper produces — the public object endpoint, already trusted in
 * `next.config.ts`.
 *
 * Null when the variable is missing, which is a real state in a fresh clone
 * and the reason `thumbIndex` is still populated below: the grid falls back to
 * placeholder crops rather than rendering eight broken images.
 */
function heroUrl(path: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${HERO_BUCKET}/${path}`;
}

let cursor = 0;

function system(
  title: string,
  slug: string,
  /** The node's `hero_image` — the same file the library page shows. */
  heroPath: string,
  progressPct: number | null = null,
): ContentItem {
  cursor += 1;
  return {
    id: slug,
    title,
    /**
     * Every one of the eight is a system, so this is fixed rather than a
     * parameter. The grid reads it and drops the type kicker when the whole
     * set shares one — see `SystemsGrid`.
     */
    typeLabel: 'System',
    /** Filled from the node once wired. See the note above. */
    metaLabel: '',
    href: `/library/${slug}`,
    thumbnailUrl: heroUrl(heroPath),
    /**
     * Fallback only, for when the Supabase URL is not configured. The index
     * has to vary: `thumbFor` cycles a fixed set of crops, so a constant here
     * would draw the same photograph eight times and make the grid look broken
     * in review for a reason that has nothing to do with the design.
     */
    thumbIndex: cursor,
    /**
     * Carried because `ContentItem` requires it, and unused: the grid shows
     * all eight at once, so there is nothing for a category to filter down to.
     */
    categories: ['systems'],
    progressPct,
  };
}

/**
 * Exactly eight, which is the whole idea.
 *
 * The grid is four across at `lg` and two at `xs`, so eight fills it without a
 * short final row at any width. A set that lands flush reads as chosen; one
 * that strands two tiles of white space reads as a page that ran out.
 *
 * All eight resolve to published library nodes, which is worth stating because
 * an earlier draft of this list did not: the Foundations Systems Audit had no
 * published node behind it — the candidates were drafts, and the systems
 * scorecard itself is a coach-side tool rather than a lesson — and it has been
 * replaced by the Champagne Close System, which does. Every tile on the grid
 * now opens something.
 */
export const placeholderSystems: ContentItem[] = [
  system(
    'Hiring Your First Assistant',
    'hiring-your-first-assistant',
    'hiring-your-first-assistant-98/2d3877d3-bb24-41c0-8cfc-841893e8798c.jpg',
    40,
  ),
  system(
    'CRM Organized and Managed',
    'crm-organized-and-managed',
    'crm-organized-and-managed-105/e28827c4-078a-45ac-b951-b4809eec7c8f.jpg',
    100,
  ),
  system(
    'Re-Engagement Campaign',
    're-engagement-campaign',
    're-engagement-campaign-96/90d98314-1be6-4f7d-8b55-cc25a27de4eb.jpg',
  ),
  system(
    'Just Sold Listing Letter System',
    'just-sold-listing-letter-system',
    'just-sold-listing-letter-system-116/b74f29d1-a9d8-479e-aaec-e36127af92de.jpg',
  ),
  system(
    'The Birthday System',
    'the-birthday-system',
    'the-birthday-system-117/eb8d4bca-d117-4011-929d-1af6238e9df4.jpg',
    20,
  ),
  system(
    '90 Day Magnet',
    '90-day-magnet',
    '90-day-magnet-119/4387856f-4935-4ff8-832d-ce0b15515014.jpg',
  ),
  system(
    'Champagne Close System',
    'champagne-close-system',
    'champagne-close-system-120/79ab6a57-1c10-4610-8c99-bdd9a5607b7b.jpg',
  ),
  system(
    'Red Carpet System',
    'red-carpet-system',
    'red-carpet-system-121/cb46dbf8-ffd6-4119-849b-36973829cbf2.jpg',
  ),
];

/* ----------------------------------------------------------- the tracker --- */

/**
 * The programme's three months.
 *
 * Only the months are placeholder here — the figures are not, and cannot be.
 * `TrackerPanel` reads and writes the signed-in member's real KPI record
 * through the same RPCs the tracker page uses, so anything typed on the home
 * card is in the tracker the moment the field loses focus. Inventing values in
 * this module would put fiction into a control that saves.
 *
 * Hard-coded dates because there is no cohort table to derive a start from
 * yet. The real version takes the member's programme start and walks three
 * months from it, which is also what makes the year-straddling case in the
 * panel worth handling: a cohort starting in November runs into the next year.
 */
export const placeholderTrackerMonths: ProgrammeMonth[] = [
  { periodStart: '2026-08-01', label: 'August' },
  { periodStart: '2026-09-01', label: 'September' },
  { periodStart: '2026-10-01', label: 'October' },
];

/* ------------------------------------------------------------ the search --- */

/**
 * Search reaches the podcast, the eight systems and the course — nothing else.
 *
 * The filtering is the load-bearing part, and it has to happen server-side
 * against the member's entitlement rather than by handing the component a
 * shorter list. A result a member cannot open is worse than no result: it
 * proves the library is bigger than what they bought, at the exact moment they
 * were looking for help.
 */
export const placeholderNinetyDaySearchIndex: SearchItem[] = [
  ...placeholderSystems.map((item) => ({
    title: item.title,
    typeLabel: item.typeLabel,
    href: item.href,
  })),
  { title: 'Set Your Compass', typeLabel: 'Course', href: '#' },
  ...placeholderCompassCourse.parts.map((part) => ({
    title: part.title,
    typeLabel: 'Course part',
    href: '#',
  })),
  { title: 'Turning a cold database into listing appointments', typeLabel: 'Podcast', href: '#' },
  { title: 'The three-call follow-up sequence that closed 11 deals', typeLabel: 'Podcast', href: '#' },
  { title: 'Hiring your first assistant without losing control', typeLabel: 'Podcast', href: '#' },
  { title: 'Why your listing presentation is losing to a worse agent', typeLabel: 'Podcast', href: '#' },
  { title: 'Rebuilding momentum after a slow month', typeLabel: 'Podcast', href: '#' },
];
