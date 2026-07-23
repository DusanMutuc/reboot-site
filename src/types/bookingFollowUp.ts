export type CoachingRelationship = 'primary' | 'implementation';

export type BookingMeetingSummary = {
  id: string;
  title: string;
  start: string;
  status: string | null;
  coachId: string;
  coachName: string;
  daysAgo: number | null;
};

export type BookingFollowUpPerson = {
  userId: string;
  name: string;
  email: string | null;
};

export type BookingFollowUpMember = {
  userId: string;
  memberIds: string[];
  people: BookingFollowUpPerson[];
  name: string;
  email: string | null;
  relationshipTypes: CoachingRelationship[];
  assignedAt: string | null;
  dataComplete: boolean;
  dataWarning: string | null;
  isNewMember: boolean;
  needsImplementation: boolean;
  needsM2: boolean;
  implementationCycleComplete: boolean;
  implementationsSinceLastM2: number;
  lastImplementation: BookingMeetingSummary | null;
  lastM2: BookingMeetingSummary | null;
  upcomingImplementation: BookingMeetingSummary | null;
  upcomingM2: BookingMeetingSummary | null;
};

export type BookingFollowUpGroup = {
  coachId: string;
  coachName: string;
  coachEmail: string | null;
  dataComplete: boolean;
  dataWarning: string | null;
  members: BookingFollowUpMember[];
};

export type BookingFollowUpResponse = {
  generatedAt: string;
  groups: BookingFollowUpGroup[];
};
