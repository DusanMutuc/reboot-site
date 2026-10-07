export type CoachingHistoryNote = {
  id: string;
  source: 'business_review' | 'implementation' | 'coaching';
  body: string;
  commitments?: string;
  writtenAt: string | null;
  authorName: string | null;
  updatedAt?: string | null;
  updatedByName?: string | null;
  contextDate?: string | null;
  contextKind?: 'business_review' | 'm2' | 'legacy';
};

export type CoachingNotesResponse = { notes: CoachingHistoryNote[] };

export const COACHING_NOTE_MAX_LENGTH = 30000;
