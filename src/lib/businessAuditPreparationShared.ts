export const BUSINESS_AUDIT_RATING_OPTIONS = [1, 2, 3, 4, 6, 8, 9, 10] as const;

export type BusinessAuditPreparationAnswers = {
  businessForwardWins: string;
  personalForwardWins: string;
  greatestBusinessChallenge: string;
  greatestPersonalChallenge: string;
  desiredCallOutcome: string;
  topicsToDiscuss: string;
  businessRating: number;
  personalRating: number;
  submittedAt: string;
  updatedAt: string;
};

export type BusinessAuditPreparationAudit = {
  id: number;
  reviewDate: string;
  status: 'draft' | 'completed';
  meetingId: number;
  appointmentId: string | null;
  title: string | null;
  startsAt: string | null;
  timezone: string;
  timing: 'upcoming' | 'past';
};

export type BusinessAuditPreparationPayload = {
  audit: BusinessAuditPreparationAudit;
  answers: BusinessAuditPreparationAnswers | null;
};
