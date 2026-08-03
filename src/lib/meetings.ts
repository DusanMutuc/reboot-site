// src/lib/meetings.ts

import { supabase } from '@/lib/supabaseClient';
import type {
  MeetingType,
  Meeting,
  MeetingAttendanceWithProfile,
  UserMeeting,
  UserEngagementSummary,
} from '@/types/meetings';

// ---------- Helpers (row types / guards) ----------

type MeetingTypeRow = {
  id: number;
  name: string;
  code: string;
  counts_toward_engagement: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type MeetingTypesJoin = {
  code: string | null;
  name: string | null;
  counts_toward_engagement: boolean | null;
} | null;

type MeetingRow = {
  id: number;
  meeting_type_id: number;
  date: string; // YYYY-MM-DD
  created_by: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
  meeting_types: MeetingTypesJoin;
};

type MeetingAttendanceFilterRow = {
  meeting_id: number;
  attended: boolean | null;
};

function isMeetingRow(v: unknown): v is MeetingRow {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'number' &&
    typeof o.meeting_type_id === 'number' &&
    typeof o.date === 'string' &&
    ('created_by' in o) &&
    ('title' in o) &&
    typeof o.created_at === 'string' &&
    typeof o.updated_at === 'string'
  );
}

type RpcCreateMeetingResult = { id: number };

type RpcEngagement = {
  expected_count: number | null;
  attended_count: number | null;
} | null;

// ---------- Meeting types ----------

export async function getMeetingTypes(): Promise<MeetingType[]> {
  const { data, error } = await supabase
    .from('meeting_types')
    .select(
      [
        'id',
        'name',
        'code',
        'counts_toward_engagement',
        'is_active',
        'created_at',
        'updated_at',
      ].join(', ')
    )
    .eq('is_active', true)
    .order('id', { ascending: true });

  if (error) {
    console.error('getMeetingTypes error', error);
    throw error;
  }

  // Shapes line up with your MeetingType; no `any` needed.
  return (data ?? []) as unknown as MeetingType[];
}

// ---------- Meetings list for admin ----------

type GetMeetingsParams = {
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  meetingTypeId?: number;
  memberUserId?: string;
  memberAttended?: boolean | 'all';
};

export async function getMeetings(params: GetMeetingsParams = {}): Promise<Meeting[]> {
  const { from, to, meetingTypeId, memberUserId, memberAttended } = params;

  let filteredMeetingIds: number[] | null = null;
  const attendanceByMeetingId = new Map<number, boolean | null>();

  if (memberUserId) {
    let attendanceQuery = supabase
      .from('meeting_attendance_base')
      .select('meeting_id, attended')
      .eq('user_id', memberUserId);

    if (typeof memberAttended === 'boolean') {
      attendanceQuery = attendanceQuery.eq('attended', memberAttended);
    }

    const { data: attendanceRows, error: attendanceError } = await attendanceQuery;

    if (attendanceError) {
      console.error('getMeetings attendance filter error', attendanceError);
      throw attendanceError;
    }

    const typedAttendanceRows = (attendanceRows ?? []) as MeetingAttendanceFilterRow[];

    filteredMeetingIds = Array.from(
      new Set(
        typedAttendanceRows.map((row) => row.meeting_id)
      )
    );

    typedAttendanceRows.forEach((row) => {
      attendanceByMeetingId.set(row.meeting_id, row.attended);
    });

    if (filteredMeetingIds.length === 0) {
      return [];
    }
  }

  let query = supabase
    .from('meetings')
    .select(
      [
        'id',
        'meeting_type_id',
        'date',
        'created_by',
        'title',
        'created_at',
        'updated_at',
        'meeting_types ( code, name, counts_toward_engagement )',
      ].join(', ')
    )
    .order('date', { ascending: false })
    .order('id', { ascending: false });

  if (from) query = query.gte('date', from);
  if (to) query = query.lte('date', to);
  if (typeof meetingTypeId === 'number') query = query.eq('meeting_type_id', meetingTypeId);
  if (filteredMeetingIds) query = query.in('id', filteredMeetingIds);

  const { data, error } = await query;

  if (error) {
    console.error('getMeetings error', error);
    throw error;
  }

  const rows = (data ?? []) as unknown[];

  const mapped: Meeting[] = rows
    .filter(isMeetingRow)
    .map((row) => ({
      id: row.id,
      meeting_type_id: row.meeting_type_id,
      date: row.date,
      created_by: row.created_by,
      title: row.title,
      member_attended: memberUserId ? (attendanceByMeetingId.get(row.id) ?? null) : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      meeting_type_code: row.meeting_types?.code ?? null,
      meeting_type_name: row.meeting_types?.name ?? null,
      meeting_type_counts_toward_engagement:
        row.meeting_types?.counts_toward_engagement ?? null,
    }));

  return mapped;
}

// ---------- Create meeting (+ optional attendees) ----------

export async function createMeetingWithAttendees(input: {
  meetingTypeCode: string;
  date: string; // YYYY-MM-DD
  attendeeIds: string[] | null;
  title?: string | null;
  createdBy?: string | null;
}): Promise<RpcCreateMeetingResult> {
  const { meetingTypeCode, date, attendeeIds, title, createdBy } = input;

  const { data, error } = await supabase.rpc('create_meeting_with_attendees', {
    _meeting_type_code: meetingTypeCode,
    _date: date,
    _user_ids: attendeeIds && attendeeIds.length > 0 ? attendeeIds : null,
    _title: title ?? null,
    _created_by: createdBy ?? null,
  });

  if (error) {
    console.error('create_meeting_with_attendees error', error);
    throw error;
  }

  // Ensure shape has an id
  const result = data as unknown as RpcCreateMeetingResult | null;
  if (!result || typeof result.id !== 'number') {
    throw new Error('Unexpected RPC response for create_meeting_with_attendees');
    }
  return result;
}

// ---------- Attendance for one meeting ----------

// lib/meetings.ts

export async function getMeetingAttendance(
  meetingId: number
): Promise<MeetingAttendanceWithProfile[]> {
  const { data, error } = await supabase
    .from('meeting_attendance_base') // ⬅️ base table, not the view
    .select(
      [
        'meeting_id',
        'user_id',
        'attended',
        'created_at',
        'updated_at',
        'profiles ( first_name, last_name, introduced_at )', // FK works on the base table
      ].join(', ')
    )
    .eq('meeting_id', meetingId)
    .order('user_id', { ascending: true });

  if (error) {
    console.error('getMeetingAttendance error', error);
    throw error;
  }

  return (data ?? []) as unknown as MeetingAttendanceWithProfile[];
}


export async function upsertMeetingAttendance(input: {
  meetingId: number;
  userId: string;
  attended: boolean;
}): Promise<unknown> {
  const { meetingId, userId, attended } = input;

  const { data, error } = await supabase.rpc('upsert_meeting_attendance', {
    _meeting_id: meetingId,
    _user_id: userId,
    _attended: attended,
  });

  if (error) {
    console.error('upsert_meeting_attendance error', error);
    throw error;
  }

  return data as unknown;
}

// ---------- "My meetings" for a user ----------

export async function getUserMeetings(input?: {
  userId?: string | null;
  from?: string;
  to?: string;
}): Promise<UserMeeting[]> {
  const { userId, from, to } = input ?? {};

  const { data, error } = await supabase.rpc('get_user_meetings', {
    _user_id: userId ?? null,
    _from: from ?? null,
    _to: to ?? null,
  });

  if (error) {
    console.error('get_user_meetings error', error);
    throw error;
  }

  return (data ?? []) as unknown as UserMeeting[];
}

export async function getMeetingSyncSources(
  meetingIds: number[],
): Promise<Map<number, 'ghl' | 'manual'>> {
  const uniqueIds = Array.from(new Set(meetingIds));
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('meetings')
    .select('id, ghl_appointment_id')
    .in('id', uniqueIds);

  if (error) {
    console.error('getMeetingSyncSources error', error);
    throw error;
  }

  return new Map(
    (data ?? []).map((row) => [
      Number(row.id),
      row.ghl_appointment_id ? ('ghl' as const) : ('manual' as const),
    ]),
  );
}

// ---------- Engagement summary ----------

export async function getUserEngagementSummary(input: {
  userId?: string | null;
  from?: string;
  to?: string;
}): Promise<UserEngagementSummary> {
  const { userId, from, to } = input;

  const { data, error } = await supabase.rpc('get_user_engagement_summary', {
    _user_id: userId ?? null,
    _from: from ?? null,
    _to: to ?? null,
  });

  if (error) {
    console.error('get_user_engagement_summary error', error);
    throw error;
  }

  const d = (data as unknown) as RpcEngagement;
  const expected = d?.expected_count ?? 0;
  const attended = d?.attended_count ?? 0;
  const ratio = expected > 0 ? attended / expected : 0;

  return {
    expected_count: expected,
    attended_count: attended,
    ratio,
  };
}

// ---------- Delete / Remove / Update ----------

export async function deleteMeeting(meetingId: number): Promise<void> {
  const { error } = await supabase.from('meetings').delete().eq('id', meetingId);
  if (error) {
    console.error('deleteMeeting error', error);
    throw error;
  }
}

export async function removeMeetingAttendance(
  meetingId: number,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('meeting_attendance')
    .delete()
    .eq('meeting_id', meetingId)
    .eq('user_id', userId);

  if (error) {
    console.error('removeMeetingAttendance error', error);
    throw error;
  }
}

export async function updateMeeting(
  meetingId: number,
  updates: { date?: string; title?: string | null }
): Promise<void> {
  const { error } = await supabase.from('meetings').update(updates).eq('id', meetingId);
  if (error) {
    console.error('updateMeeting error', error);
    throw new Error(error.message || 'Failed to update meeting');
  }
}
