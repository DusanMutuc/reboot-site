import type { CoachHomeMeeting, CoachHomePriority } from '@/types/coachHome';
import type { BookingFollowUpMember, BookingFollowUpResponse } from '@/types/bookingFollowUp';

export function isUpcomingCoachMeeting(meeting: CoachHomeMeeting, now: number) {
  return Date.parse(meeting.end ?? meeting.start) >= now;
}

export type WeeklyPriority = CoachHomePriority & { memberIds: string[]; meetingIds: string[] };

/** The preparation list covers the whole selected week, independent of day filters. */
export function weeklyPriorities(meetings: CoachHomeMeeting[]): WeeklyPriority[] {
  const priorities = new Map<number, WeeklyPriority>();
  for (const meeting of meetings) {
    if (!meeting.member || meeting.prioritiesState !== 'ready') continue;
    for (const priority of meeting.priorities) {
      const entry = priorities.get(priority.id) ?? { ...priority, memberIds: [], meetingIds: [] };
      if (!entry.memberIds.includes(meeting.member.id)) entry.memberIds.push(meeting.member.id);
      if (!entry.meetingIds.includes(meeting.id)) entry.meetingIds.push(meeting.id);
      priorities.set(priority.id, entry);
    }
  }
  return [...priorities.values()].sort((a, b) => b.memberIds.length - a.memberIds.length || a.label.localeCompare(b.label));
}

export function memberFormHref(meeting: CoachHomeMeeting): string | null {
  if (meeting.kind !== 'business_review' || meeting.prepSubmitted !== true) return null;
  const [pathname, query] = meeting.workspaceHref.split('?');
  const params = new URLSearchParams(query);
  if (pathname !== '/coach/students-overview' || !meeting.member || params.get('userId') !== meeting.member.id
    || !/^[1-9]\d*$/.test(params.get('reviewId') ?? '')) return null;
  params.set('section', 'member-form');
  return `${pathname}?${params}`;
}

export function bookingFollowUpQueue(report: BookingFollowUpResponse, businessReviewOnly = false): BookingFollowUpMember[] {
  const members = new Map<string, BookingFollowUpMember>();
  for (const group of report.groups) {
    if (!group.dataComplete) continue;
    for (const member of group.members) {
      const needsBooking = businessReviewOnly
        ? member.relationshipTypes.includes('primary') && !member.upcomingM2
        : member.isNewMember || member.needsImplementation || member.needsM2;
      if (member.pauseStartedAt || !member.dataComplete || !needsBooking) continue;
      // A shared business can have several accounts but needs one booking prompt.
      const key = [...(member.memberIds.length ? member.memberIds : [member.userId])].sort().join(':');
      members.set(key, member);
    }
  }
  return [...members.values()].sort((a, b) => Number(b.isNewMember) - Number(a.isNewMember) || a.name.localeCompare(b.name));
}

export function followUpReason(member: BookingFollowUpMember, businessReviewOnly = false): string {
  if (businessReviewOnly) return 'Business Review booking missing';
  if (member.isNewMember) return 'New member · No meetings booked';
  if (member.needsImplementation && member.needsM2) return 'Implementation and Business Review bookings missing';
  return member.needsImplementation ? 'Implementation booking missing' : 'Business Review booking missing';
}
