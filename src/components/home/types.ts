/** Shape of everything the member home renders. */

export type CallStatus = 'imminent' | 'booked' | 'none';

export type NextCall = {
  /** e.g. "Momentum call" */
  kind: string;
  coachName: string | null;
  /** Pre-formatted for display; the server owns timezone conversion. */
  whenLabel: string;
  /** e.g. "starts in 12 minutes" or "in 9 days" */
  relativeLabel: string;
  joinUrl: string | null;
  addToCalendarUrl: string | null;
};
export type LastCall = {
  /** e.g. "3 weeks ago". Optional so the nudge degrades if history is absent. */
  relativeLabel: string;
};

export type BookingOption = {
  label: string;
  coachName: string | null;
  href: string | null;
};

export type RoomOption = {
  label: string;
  href: string | null;
};

/**
 * The published schedule of group sessions.
 *
 * Sits with the call actions rather than in the footer: "when is the next
 * group thing" is a calls question, and filing it under utility links put it
 * beside privacy policy. Intended to be replaced by an upcoming-sessions
 * module on the page, so the member reads the next few without opening
 * anything — this is the interim home, not the intended one.
 */
export type CalendarLink = {
  label: string;
  href: string | null;
};

export type ContinueItem = {
  title: string;
  contextLabel: string;
  href: string;
  progressPct: number;
  /** The specific part they land on — naming it beats a generic "continue". */
  nextUpLabel: string | null;
};

export type BrowseTile = {
  key: 'courses' | 'library' | 'podcast' | 'explainers';
  label: string;
  href: string;
};

export type LatestEpisode = {
  title: string;
  episodeLabel: string;
  durationLabel: string;
  href: string;
  isNew: boolean;
};

export type Metric = {
  label: string;
  value: string;
  deltaPct: number | null;
};

export type UtilityLink = {
  label: string;
  href: string;
};

export type ActionStep = {
  id: string;
  label: string;
  status: 'not_started' | 'in_progress' | 'complete';
  href: string | null;
};

export type Episode = {
  title: string;
  episodeLabel: string;
  durationLabel: string;
  publishedLabel: string;
  href: string;
  isNew: boolean;
  /** Transistor's `summary`. Shown on the featured episode only. */
  summary: string | null;
};

export type Win = {
  text: string;
  dateLabel: string;
};

export type Achievement = {
  title: string;
  dateLabel: string;
  /** Square art from the `achievements` storage bucket. */
  imageUrl: string | null;
};

export type Attendance = {
  attendedCount: number;
  totalCount: number;
  periodLabel: string;
  streakLabel: string | null;
  /**
   * The last eight meetings, oldest first — true where the member attended.
   * A ratio says how many; this says which, and when.
   */
  recent: boolean[];
};

/**
 * One line of the coaching attendance card.
 *
 * The denominator and markers come from the member's actual attendance-backed
 * meeting records for the active cycle. They are not programme quotas.
 *
 * The business review is deliberately absent — the band at the top of the page
 * already owns it, and one-per-period is not a figure worth a row.
 */
export type AttendanceRow = {
  label: string;
  attended: number;
  total: number;
  /** Oldest first. Present on live data; legacy design fixtures omit it. */
  meetings?: Array<{
    id: string;
    dateLabel: string;
    attended: boolean;
  }>;
};

export type CoachingAttendance = {
  /** e.g. "Last 60 days". */
  periodLabel: string;
  rows: AttendanceRow[];
};

export type HelpStep = {
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
};

/**
 * One browsable item. Deliberately carries a thumbnail and a duration, because
 * both are what let someone decide without reading — the whole point of
 * browsing rather than searching.
 */
export type BrowseItem = {
  id: string;
  title: string;
  typeLabel: string;
  durationLabel: string;
  href: string;
  /** Index into the placeholder thumbnail set; real items use `hero_image`. */
  thumbIndex: number;
  /** Shown only when already started, so a part-finished item stands out. */
  progressPct: number | null;
};

/**
 * The four browsing categories agreed in review. An item can sit in several,
 * the way a film appears under several genres — which is what keeps a finite
 * catalogue from feeling small.
 */
export type ContentCategory = 'marketing' | 'systems' | 'hiring' | 'mindset';

export type ContentItem = {
  id: string;
  containerTitle?: string | null;
  containerHref?: string | null;
  /** Present for resource cards that support explicit discovery feedback. */
  resourceId?: number | null;
  title: string;
  /** Video, Playbook, Recording, Script, Training. */
  typeLabel: string;
  /** Duration for a single item, part count for training. */
  metaLabel: string;
  href: string;
  thumbIndex: number;
  /** Live catalogue artwork. Placeholder variants continue to use thumbIndex. */
  thumbnailUrl?: string | null;
  categories: ContentCategory[];
  progressPct: number | null;
};

export type BrowseDiscoverySelection = ContentCategory | 'all' | 'for-you';

/**
 * Identifies the immutable ordered response behind one browser view. Item
 * positions are keyed by ContentItem.id so the client can attribute a view or
 * open without exposing ranking scores or recommendation reasons.
 */
export type DiscoveryResultSetRef = {
  /** Null only when analytics recording was unavailable; the delivered order remains usable. */
  id: string | null;
  context: 'catalogue' | 'category' | 'recommendation';
  contextKey: string | null;
  itemPositions: Record<string, number>;
};

export type HomeDiscoveryResultSets = Partial<
  Record<BrowseDiscoverySelection, DiscoveryResultSetRef>
>;

/**
 * A course is a container, not an item: sequential, multi-part, and carrying
 * position. Its card is deliberately a different object from a resource card.
 */
export type CourseItem = {
  id: string;
  title: string;
  partCount: number;
  completedParts: number;
  durationLabel: string;
  href: string;
  thumbIndex: number;
};

/**
 * A framing over the catalogue. The same item can appear under several of
 * these — that is what makes a finite library feel larger. Which framings show
 * is expected to rotate, so returning feels different without new content.
 */
export type BrowseRow = {
  id: string;
  label: string;
  items: BrowseItem[];
};

/** Flattened index backing the inline search demo. */
export type SearchItem = {
  containerTitle?: string | null;
  containerHref?: string | null;
  title: string;
  typeLabel: string;
  href: string;
  rankingTier?: 'strict' | 'related';
  resultSetId?: string | null;
  logicalSearchId?: string | null;
  position?: number;
};

/**
 * One of the three action steps a coach set from the systems scorecard.
 *
 * All three are visible, but only the selected one shows its detail and its
 * guide — so the member sees the whole sprint without being handed a menu.
 *
 * The guide is the step's actual content, and it is the only content that
 * belongs here. Algorithmically related videos live in the content zone: they
 * resemble the step rather than being attached to it, and listing them beside
 * the guide claims an authorship they do not have.
 */
export type Priority = {
  id: string;
  title: string;
  /** What the first move costs. Empty when there is no guide behind it. */
  detail: string;
  status: 'done' | 'current' | 'todo';
  /** Null when the action step has no library item; the CTA is then omitted. */
  guideHref: string | null;
};

/**
 * A meeting the programme requires to always be on the calendar. Both a
 * business review and an implementation session are expected at all times, so
 * an unbooked one is a state worth surfacing rather than an empty slot.
 */
export type MeetingSlot = {
  id: 'business_review' | 'implementation' | 'weekly_group';
  kind: string;
  /** ISO start, used for ordering. Null when nothing is booked. */
  startsAt: string | null;
  /** Null when nothing is booked. */
  whenLabel: string | null;
  relativeLabel: string | null;
  joinUrl: string | null;
  bookUrl: string;
  /** Inside the join window — 30 minutes before start. */
  imminent: boolean;
  /** Neutral context, never pressure. Null when there is nothing to say. */
  prepLabel: string | null;
  /** Present only for a real upcoming Business Review that can accept prep. */
  prepHref: string | null;
  /** Changes the prep action from a task into a review/update action. */
  prepSubmitted: boolean;
  /**
   * Whether this meeting is the member's to move. Optional, defaulting to
   * true, because for every meeting the standard home shows it is.
   *
   * A cohort call is not: it runs at a fixed hour for everyone on the
   * programme, and the band's secondary action — Reschedule — is the one
   * control on the page that cannot do what it says. An offer that does
   * nothing is worse than an absent one, so the band drops it and the booked
   * state becomes what it already was for these members: a statement.
   */
  reschedulable?: boolean;
};

/**
 * The training assigned for the current period. Semantically close to a
 * priority, but it comes from a different place and is a single item, so it
 * keeps its own card rather than competing inside the sprint list.
 */
/**
 * One video inside a course. Courses are sequential, so array order is the
 * running order and `done` is only ever true from the front.
 */
export type TrainingPart = {
  title: string;
  /**
   * Runtime in minutes, as a number rather than a label. The card needs to
   * total what is left as well as show one part's length, and a string can
   * only do the second without being parsed back.
   */
  minutes: number;
  /**
   * One line on what the part actually covers. Only ever rendered for the
   * next part — the one the member is about to open — but modelled per part,
   * because that is where the fact belongs.
   */
  description: string;
  done: boolean;
};

/**
 * The course a coach assigned. Modelled as the container it is: a percentage
 * was the wrong instrument for something discrete and ordered — what a member
 * needs is which part is next, by name.
 */
export type RequiredTraining = {
  title: string;
  href: string;
  /**
   * The course's own artwork, resolved from `hero_image` — the same file the
   * library shows, deliberately.
   *
   * It is drawn small here, and that is the whole design. Cover art earns its
   * place in a catalogue by helping someone choose; in this block there is
   * nothing to choose, because the course is assigned and there is one of
   * them. What art can still do is identify — this is the object you saw in
   * the library — and identification only works if it is the same picture in
   * both places, which rules out anything commissioned for this slot alone.
   *
   * That also disposes of the title collision. These heroes are title cards,
   * with the course name set into the picture, which reads as a duplicate of
   * the heading beside it only while the lettering is large enough to read.
   * Around 128px it stops being read as type, the way album art does.
   *
   * Null falls back to a plain tile. The block must not depend on a picture
   * existing: a course with no hero is a normal state, not a broken one.
   */
  heroUrl: string | null;
  /**
   * In running order. Counts, the next part and the time remaining are all
   * derived, never stored — total runtime used to be a field here and it
   * described the whole course, which is the one figure a member part-way
   * through has no use for.
   */
  parts: TrainingPart[];
  /** e.g. "Before Thursday's session" — stated, not pressed. */
  contextLabel: string | null;
};

/**
 * What the training slot shows when no course is assigned.
 *
 * Deliberately a report on the member rather than a recommendation: the top
 * zone only carries things attached to them, and suggesting a course here
 * would make the same offer as the browse grid below.
 */
export type TrainingStanding = {
  /** How many courses the member has finished in total. */
  completedCount: number;
  /** The most recent finish, for a single line of closure. */
  lastCompleted: { title: string; completedLabel: string } | null;
  /** The one route out of this card. */
  browseHref: string;
};

/**
 * The single thing the hub asks a member to do. Exactly one is shown, chosen by
 * a priority order, so the member never has to decide *what* to do — only
 * whether to do it. Calls are excluded: the band above already owns those.
 */
/**
 * Course progress is deliberately absent: it lives permanently in the tier
 * below the hero, so it is never promoted up here and never duplicated.
 */
export type NextStepKind = 'action_step' | 'numbers' | 'browse';

export type NextStep = {
  kind: NextStepKind;
  /** Framing above the title, e.g. "Pick up where you left off". */
  eyebrow: string;
  title: string;
  /** Stating the cost is what lowers resistance: "Part 3 of 6 · about 12 min". */
  detail: string;
  /** Partial progress pulls harder than none or complete. Null when N/A. */
  progressPct: number | null;
  /** Position in a sequence, rendered as segments. Null when not sequential. */
  stepIndex: number | null;
  stepTotal: number | null;
  ctaLabel: string;
  href: string;
  /** Escape hatch, so the single recommendation never feels coercive. */
  altLabel: string | null;
  altHref: string | null;
  /**
   * The parts this step breaks into. Shows the member the work is finite, and
   * gives the hero a second column so it fills its width instead of stranding
   * empty space on the right.
   */
  subSteps: SubStep[];
  subStepsLabel: string;
};

export type SubStep = {
  label: string;
  state: 'done' | 'current' | 'todo';
};

export type OnePageExtras = {
  actionSteps: ActionStep[];
  episodes: Episode[];
  wins: Win[];
  achievements: Achievement[];
  attendance: Attendance;
  /** The rebuilt, named-row attendance. `attendance` still serves the older shells. */
  coachingAttendance: CoachingAttendance;
  helpSteps: HelpStep[];
  searchIndex: SearchItem[];
};

export type HomeData = {
  memberFirstName: string;
  callStatus: CallStatus;
  nextCall: NextCall | null;
  lastCall: LastCall | null;
  bookingOptions: BookingOption[];
  roomOptions: RoomOption[];
  calendar: CalendarLink | null;
  continueItem: ContinueItem | null;
  browseTiles: BrowseTile[];
  latestEpisode: LatestEpisode | null;
  metrics: Metric[];
  utilityLinks: UtilityLink[];
};

/* ------------------------------------------------- 90-day offer members ---- */

/**
 * The one thing every member on the 90-day offer is working on this week.
 *
 * Shaped like a `Priority` and deliberately not one. A priority is personal —
 * a coach set it for this member at their business review, and the layout says
 * so. This is set once for the whole cohort and rotates weekly, which is a
 * different promise, and a page that renders the two identically is making a
 * claim about personalisation it cannot keep. The difference is carried by the
 * module rather than the type: one focus, no list to choose from, and a line
 * on the surface naming it as shared.
 *
 * There is no `status`. Three priorities need one because the member is
 * tracking a set; a single item that expires on Monday either got done or did
 * not, and a done-state on it would suggest the next one arrives early.
 */
export type CurrentFocus = {
  id: string;
  title: string;
  /** What the first move costs. Empty when there is no system behind it. */
  detail: string;
  /** Null when the focus has no library item; the CTA is then omitted. */
  guideHref: string | null;
};

/**
 * Where the member is in the ninety days.
 *
 * The offer's product *is* the time — thirteen weeks, then it ends — so the
 * page can report progress from the calendar alone, without waiting on KPI
 * history a three-week-old member does not have yet. It is also the frame that
 * makes a rotating focus legible: a member who can see week three of thirteen
 * reads this week's item as one of a series rather than as the whole
 * programme.
 */
export type ProgrammeWeek = {
  /** 1-based, and allowed to exceed `total` on an over-running cohort. */
  current: number;
  total: number;
};

/**
 * One month of the 90-day programme, as the tracker keys it.
 *
 * Only the identity of the month travels: the figures are read and written
 * live against the member's own KPI record, so there is nothing to pass in and
 * nothing that can go stale between render and edit. `periodStart` is the
 * `period_start_date` the RPCs already use rather than a prettier id, so the
 * card never has to convert between two ways of naming the same month.
 *
 * Ninety days is three months, which is why this cohort gets the whole tracker
 * and a picker rather than the four-figure year snapshot the standard home
 * shows. A year-to-date total summarises a period longer than the membership;
 * three months is not a summary of anything, it is just the record.
 */
export type ProgrammeMonth = {
  /** First of the month, e.g. "2026-08-01". */
  periodStart: string;
  /** e.g. "August". */
  label: string;
};
