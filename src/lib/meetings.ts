// src/lib/meetings.ts

import { supabase } from '@/lib/supabaseClient';
import type {
  MeetingType,
  Meeting,
  MeetingAttendanceWithProfile,
  UserMeeting,
  UserEngagementSummary,
} from '@/types/meetings';

// Meeting types

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

  return (data ?? []) as unknown as MeetingType[];
}

// Meetings list for admin

type GetMeetingsParams = {
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  meetingTypeId?: number;
};

export async function getMeetings(params: GetMeetingsParams = {}): Promise<Meeting[]> {
  const { from, to, meetingTypeId } = params;

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

  if (from) {
    query = query.gte('date', from);
  }

  if (to) {
    query = query.lte('date', to);
  }

  if (typeof meetingTypeId === 'number') {
    query = query.eq('meeting_type_id', meetingTypeId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('getMeetings error', error);
    throw error;
  }

  const mapped: Meeting[] =
    ((data ?? []) as unknown as any[]).map((row) => ({
      id: row.id,
      meeting_type_id: row.meeting_type_id,
      date: row.date,
      created_by: row.created_by,
      title: row.title,
      created_at: row.created_at,
      updated_at: row.updated_at,
      meeting_type_code: row.meeting_types?.code ?? null,
      meeting_type_name: row.meeting_types?.name ?? null,
      meeting_type_counts_toward_engagement:
        row.meeting_types?.counts_toward_engagement ?? null,
    })) ?? [];

  return mapped;
}

// Create meeting (+ optional attendees)

export async function createMeetingWithAttendees(input: {
  meetingTypeCode: string;
  date: string; // YYYY-MM-DD
  attendeeIds: string[] | null;
  title?: string | null;
  createdBy?: string | null;
}) {
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

  return data;
}

// Attendance for one meeting

export async function getMeetingAttendance(
  meetingId: number
): Promise<MeetingAttendanceWithProfile[]> {
  const { data, error } = await supabase
    .from('meeting_attendance')
    .select(
      [
        'meeting_id',
        'user_id',
        'attended',
        'created_at',
        'updated_at',
        'profiles ( first_name, last_name )',
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
}) {
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

  return data;
}

// "My meetings" for a user (or auth.uid if userId is null/omitted)

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

// Engagement summary

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

  const expected = (data as any)?.expected_count ?? 0;
  const attended = (data as any)?.attended_count ?? 0;
  const ratio = expected > 0 ? attended / expected : 0;

  return {
    expected_count: expected,
    attended_count: attended,
    ratio,
  };
}

// Delete a meeting (attendance is cascaded via FK)

export async function deleteMeeting(meetingId: number): Promise<void> {
  const { error } = await supabase
    .from('meetings')
    .delete()
    .eq('id', meetingId);

  if (error) {
    console.error('deleteMeeting error', error);
    throw error;
  }
}

// Remove a single attendee from a meeting

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
    const { error } = await supabase
      .from('meetings')
      .update(updates)
      .eq('id', meetingId);
  
    if (error) {
      console.error('updateMeeting error', error);
      throw new Error(error.message || 'Failed to update meeting');
    }
  }