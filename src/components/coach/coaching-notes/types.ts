import type { CoachingNote } from '@/types/coaching';

export type ContentNodeInfo = {
  title: string | null;
  slug: string | null;
  node_type: string | null;
};

export type MeetingSlotKey = 'm2' | 'impl1' | 'impl2' | 'impl3';

export type MeetingSlotConfig = {
  key: MeetingSlotKey;
  label: string;
};

export const MEETING_SLOTS: MeetingSlotConfig[] = [
  { key: 'm2', label: 'M2' },
  { key: 'impl1', label: 'Implementation 1' },
  { key: 'impl2', label: 'Implementation 2' },
  { key: 'impl3', label: 'Implementation 3' },
];

export type MeetingSlotState = {
  meetingId: number;
  date: string;
  attended: boolean;
  source: 'ghl' | 'manual';
};

export type MeetingSlotsState = Record<MeetingSlotKey, MeetingSlotState | null>;
export type MeetingDateInputs = Record<MeetingSlotKey, string>;

export type CoachingNoteWithM2 = CoachingNote & {
  m2_meeting_id?: number | null;
  m2_meeting?: { date: string } | null;
};

export function makeEmptyMeetingSlots(): MeetingSlotsState {
  return {
    m2: null,
    impl1: null,
    impl2: null,
    impl3: null,
  };
}

export function makeEmptyMeetingDateInputs(): MeetingDateInputs {
  return {
    m2: '',
    impl1: '',
    impl2: '',
    impl3: '',
  };
}
