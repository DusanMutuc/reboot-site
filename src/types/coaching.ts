// src/types/coaching.ts

export type ActionStepStatus = 'not_started' | 'in_progress' | 'complete';

export interface CoachingNote {
  id: number;
  user_id: string;
  coach_id: string;
  created_at: string;
  updated_at: string;
  m2_meeting_id: number | null; 
}

export interface CoachingNoteActionStep {
  id: number;
  coaching_note_id: number;
  label: string;
  library_item_id: number | null;
  status: ActionStepStatus;
  created_at: string;
  updated_at: string;
}

export interface CoachingNoteComment {
  id: number;
  coaching_note_id: number;
  author_id: string;
  body: string;
  created_at: string;
}

export interface Win {
  id: number;
  user_id: string;
  added_by: string;
  body: string;
  created_at: string;
}


// Status values coming from DB enum user_attention_status
export type UserStatus = 'green' | 'yellow' | 'red';

export type UserStatusSource = 'manual' | 'auto';

export interface UserStatusInfo {
  userId: string;
  status: UserStatus;               // effective status (manual or auto)
  source: UserStatusSource;         // 'manual' | 'auto'
  manualReason?: string | null;
  manualUpdatedBy?: string | null;
  manualUpdatedAt?: string | null;
}