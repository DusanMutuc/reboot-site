export type CoachHomeSource = {
  status: 'ready' | 'partial' | 'unavailable';
  message?: string;
};

export type CoachHomePriority = {
  id: number;
  label: string;
  guideHref: string | null;
};

export type CoachHomeMeeting = {
  id: string;
  kind: 'implementation' | 'business_review';
  title: string;
  start: string;
  end: string | null;
  joinUrl: string | null;
  member: { id: string; name: string } | null;
  workspaceHref: string;
  priorities: CoachHomePriority[];
  prioritiesState: 'ready' | 'unavailable';
  prepSubmitted: boolean | null;
};

export type CoachHomeGroupSession = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  joinUrl: string | null;
  audience: string;
  detailsUrl?: string;
};

export type CoachHomeResponse = {
  timezone: string;
  /** Local Monday, inclusive, and the following Monday, exclusive. */
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  coach: {
    id: string;
    name: string;
    responsibilities: Array<'primary' | 'implementation'>;
  };
  meetings: CoachHomeMeeting[];
  groupSessions: CoachHomeGroupSession[];
  groupCalendarUrl: string;
  sources: {
    schedule: CoachHomeSource;
    priorities: CoachHomeSource;
    groups: CoachHomeSource;
  };
};
