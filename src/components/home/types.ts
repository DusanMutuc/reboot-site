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
  title: string;
  /** Video, Playbook, Recording, Script, Training. */
  typeLabel: string;
  /** Duration for a single item, part count for training. */
  metaLabel: string;
  href: string;
  thumbIndex: number;
  categories: ContentCategory[];
  progressPct: number | null;
};

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
  title: string;
  typeLabel: string;
  href: string;
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
  id: 'business_review' | 'implementation';
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
};

/**
 * The training assigned for the current period. Semantically close to a
 * priority, but it comes from a different place and is a single item, so it
 * keeps its own card rather than competing inside the sprint list.
 */
export type RequiredTraining = {
  title: string;
  detail: string;
  href: string;
  progressPct: number | null;
  /** e.g. "Before your session on Thursday" — stated, not pressed. */
  contextLabel: string | null;
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
