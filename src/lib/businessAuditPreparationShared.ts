export const BUSINESS_AUDIT_RATING_OPTIONS = [1, 2, 3, 4, 6, 8, 9, 10] as const;

export const BUSINESS_AUDIT_TEXT_FIELDS = [
  'businessForwardWins', 'personalForwardWins', 'greatestBusinessChallenge',
  'greatestPersonalChallenge', 'desiredCallOutcome', 'topicsToDiscuss',
] as const;
export type BusinessAuditPreparationInput = Record<(typeof BUSINESS_AUDIT_TEXT_FIELDS)[number], string> & {
  businessRating: number | null;
  personalRating: number | null;
};
export const EMPTY_PREPARATION: BusinessAuditPreparationInput = {
  businessForwardWins: '', personalForwardWins: '', greatestBusinessChallenge: '',
  greatestPersonalChallenge: '', desiredCallOutcome: '', topicsToDiscuss: '',
  businessRating: null, personalRating: null,
};

export function validatePreparation(input: unknown, submit: boolean): Record<string, string> {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const errors: Record<string, string> = {};
  for (const field of BUSINESS_AUDIT_TEXT_FIELDS) {
    if (typeof value[field] !== 'string') errors[field] = 'Enter a text answer.';
    else if (value[field].length > 10_000) errors[field] = 'Keep this answer under 10,000 characters.';
    else if (submit && !value[field].trim()) errors[field] = 'This answer is required.';
  }
  for (const field of ['businessRating', 'personalRating'] as const) {
    const rating = value[field];
    if (rating === null && !submit) continue;
    if (typeof rating !== 'number' || !(BUSINESS_AUDIT_RATING_OPTIONS as readonly number[]).includes(rating)) {
      errors[field] = 'Choose a rating from 1–10. Ratings 5 and 7 are not available.';
    }
  }
  return errors;
}

export function preparationInput(value: BusinessAuditPreparationInput | null): BusinessAuditPreparationInput {
  return Object.fromEntries(Object.keys(EMPTY_PREPARATION).map((field) => [
    field, value?.[field as keyof BusinessAuditPreparationInput] ?? EMPTY_PREPARATION[field as keyof BusinessAuditPreparationInput],
  ])) as BusinessAuditPreparationInput;
}

export function preparationProgress(value: BusinessAuditPreparationInput): number {
  return BUSINESS_AUDIT_TEXT_FIELDS.filter((field) => value[field].trim()).length
    + Number(value.businessRating !== null) + Number(value.personalRating !== null);
}

export type BusinessAuditPreparationDraft = {
  values: BusinessAuditPreparationInput;
  revision: number;
  submittedRevision: number | null;
  updatedAt: string;
  lastRequestId: string;
};

export type BusinessAuditPreparationSaveResult = {
  businessReviewId: number;
  answers: BusinessAuditPreparationAnswers | null;
  draft: BusinessAuditPreparationDraft;
};

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
  userId: string;
  audit: BusinessAuditPreparationAudit;
  answers: BusinessAuditPreparationAnswers | null;
  draft: BusinessAuditPreparationDraft | null;
};
