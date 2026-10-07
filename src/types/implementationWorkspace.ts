import type { CoachingCyclesPayload } from '@/lib/coachingCycles';
import type { ActionStepStatus } from '@/types/coaching';
import type { ImplementationGuideAudience, ImplementationGuideStep } from './implementationGuides';

export type ImplementationAction = {
  actionStepId: number;
  label: string;
  status: ActionStepStatus;
  libraryItemId?: number | null;
  libraryItemTitle?: string | null;
  libraryItemHref?: string | null;
  priorityPosition: number | null;
  systemKey: string | null;
  audience: ImplementationGuideAudience | null;
  guideRevision: number | null;
  steps: ImplementationGuideStep[];
  progress: Record<string, { completed: boolean; completedAt: string | null; meetingId: number | null }>;
};

export type ImplementationSession = {
  id: string;
  noteId: number;
  meetingId: number;
  status: 'open' | 'completed';
  revision: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  notes: string;
  commitments: string;
  nextMeetingBooked: boolean;
  actions: ImplementationAction[];
};

export type ImplementationMeeting = {
  id: number;
  date: string;
  title: string | null;
  startsAt: string | null;
  timezone: string;
  attended: boolean;
  cancelled: boolean;
  isToday: boolean;
  isFuture: boolean;
  session: ImplementationSession | null;
};

export type UpcomingBusinessReview = {
  reviewId: number;
  meetingId: number | null;
  date: string;
  startsAt: string | null;
  timezone: string;
  title: string | null;
  isToday: boolean;
};

export type BookingCoach = {
  coachId: string;
  name: string;
  url: string | null;
};

export type ImplementationBookingCoaches = {
  implementation: BookingCoach | null;
  businessReview: BookingCoach | null;
};

export type ImplementationWorkspaceResponse = CoachingCyclesPayload & {
  selectedNoteId: number | null;
  cycleEndDate: string | null;
  meetings: ImplementationMeeting[];
  upcomingBusinessReview: UpcomingBusinessReview | null;
  bookingCoaches: ImplementationBookingCoaches;
  suggestedMeetingId: number | null;
  latestSessionId: string | null;
  actions: ImplementationAction[];
  stepNotes: { id: string; sessionId: string; actionStepId: number; stepId: string; body: string; createdAt: string; authorId: string | null }[];
  resources: { id: number; title: string; type: string }[];
};

export type ImplementationOperation = 'start' | 'save_notes' | 'toggle_step' | 'add_step_note' | 'complete_meeting' | 'reopen_meeting' | 'set_attendance' | 'set_action_status' | 'set_next_meeting_booked';
