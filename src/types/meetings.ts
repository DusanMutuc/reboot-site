// src/types/meetings.ts

export type MeetingType = {
    id: number; // bigint in DB
    name: string;
    code: string;
    counts_toward_engagement: boolean;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
  };
  
  export type Meeting = {
    id: number;
    meeting_type_id: number;
    date: string; // date in ISO format (YYYY-MM-DD)
    created_by: string | null;
    title: string | null;
    meeting_type_code?: string | null;
    meeting_type_name?: string | null;
    meeting_type_counts_toward_engagement?: boolean | null;
    created_at?: string;
    updated_at?: string;
  };
  
  export type MeetingAttendance = {
    meeting_id: number;
    user_id: string;
    attended: boolean;
    created_at?: string;
    updated_at?: string;
  };
  
export type MeetingAttendanceWithProfile = MeetingAttendance & {
  profiles?: {
    first_name?: string | null;
    last_name?: string | null;
    introduced_at?: string | null;
  } | null;
};
  
  export type UserMeeting = {
    meeting_id: number;
    meeting_date: string; // date
    meeting_type_code: string;
    meeting_type_name: string;
    title: string | null;
    attended: boolean;
    counts_toward_engagement: boolean;
  };
  
  export type UserEngagementSummary = {
    expected_count: number;
    attended_count: number;
    ratio: number; // 0–1
  };
  
