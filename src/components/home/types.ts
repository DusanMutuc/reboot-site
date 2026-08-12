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

export type ContinueItem = {
  title: string;
  contextLabel: string;
  href: string;
  progressPct: number;
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

/** Flattened index backing the inline search demo. */
export type SearchItem = {
  title: string;
  typeLabel: string;
  href: string;
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
  continueItem: ContinueItem | null;
  browseTiles: BrowseTile[];
  latestEpisode: LatestEpisode | null;
  metrics: Metric[];
  utilityLinks: UtilityLink[];
};
