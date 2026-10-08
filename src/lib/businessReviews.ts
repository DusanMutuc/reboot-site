import type { SupabaseClient } from '@supabase/supabase-js';

import type { BusinessAuditPreparationAnswers } from '@/lib/businessAuditPreparationShared';
import { hasRoleCode } from '@/lib/userRoles';
import { getNotesScopeUserIds, loadVisibleCoachingNotes, readRowsForIds } from '@/lib/partnershipScope';

export const FOCUS_FINDER_TEMPLATE_KEY = 'focus_finder_v1';

export type BusinessReviewStatus = 'draft' | 'completed';
export type SystemScorecardAudience = 'foundation' | 'legends';
export type SystemScorecardStatus =
  | 'not_started'
  | 'started'
  | 'complete'
  | 'consistent';

export type FocusFinderDimension = {
  id: number;
  key: string;
  groupKey: string;
  groupLabel: string;
  label: string;
  subtitle: string;
  position: number;
};

export type BusinessReviewFocusValue = {
  dimensionId: number;
  value: number;
  updatedAt: string;
};

export type BusinessReviewSystemRating = {
  systemId: number;
  status: SystemScorecardStatus;
  reviewedAt: string | null;
  reviewedBy: string | null;
  updatedAt: string | null;
  lastReviewedAt: string | null;
  reviewDueAt: string | null;
  reviewOverdue: boolean;
};

export type BusinessReviewSystemPriority = {
  position: number;
  actionStepId: number;
  startingStatus: SystemScorecardStatus;
  selectedAt: string;
  selectedBy: string | null;
};

export type SystemScorecardSystem = {
  id: number;
  key: string;
  label: string;
  position: number;
  libraryItemId: number | null;
  rating: BusinessReviewSystemRating;
  priority: BusinessReviewSystemPriority | null;
};

export type SystemScorecardCategory = {
  id: number;
  key: string;
  label: string;
  position: number;
  systems: SystemScorecardSystem[];
};

export type BusinessReviewSystemScorecard = {
  templateKey: string;
  audience: SystemScorecardAudience;
  name: string;
  version: number;
  categories: SystemScorecardCategory[];
};

export type BusinessReview = {
  id: number;
  userId: string;
  coachId: string | null;
  meetingId: number | null;
  meetingStatus: string | null;
  meetingCancelled: boolean;
  coachingNoteId: number;
  templateKey: string;
  systemScorecardTemplateKey: string | null;
  reviewDate: string;
  status: BusinessReviewStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  focusValues: BusinessReviewFocusValue[];
  systemScorecard: BusinessReviewSystemScorecard | null;
  additionalScorecards: BusinessReviewSystemScorecard[];
  preparation: BusinessAuditPreparationAnswers | null;
};

export type BusinessReviewsPayload = {
  dimensions: FocusFinderDimension[];
  reviews: BusinessReview[];
};

type FocusFinderDimensionRow = {
  id: number;
  key: string;
  group_key: string;
  group_label: string;
  label: string;
  subtitle: string;
  position: number;
};

type BusinessReviewRow = {
  id: number;
  user_id: string;
  coach_id: string | null;
  meeting_id: number | null;
  archived_meeting_id: number | null;
  coaching_note_id: number;
  focus_finder_template_key: string;
  system_scorecard_template_key: string | null;
  review_date: string;
  status: BusinessReviewStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type SystemScorecardTemplateRow = {
  key: string;
  audience: SystemScorecardAudience;
  name: string;
  version: number;
};

export function getBusinessReviewScorecards(
  review: BusinessReview | null,
): BusinessReviewSystemScorecard[] {
  if (!review) return [];
  return [
    ...(review.systemScorecard ? [review.systemScorecard] : []),
    ...review.additionalScorecards,
  ];
}

type AdditionalScorecardRow = {
  business_review_id: number;
  template_key: string;
};

type SystemScorecardCategoryRow = {
  id: number;
  template_key: string;
  key: string;
  label: string;
  position: number;
};

type SystemScorecardSystemRow = {
  id: number;
  template_key: string;
  category_id: number;
  key: string;
  label: string;
  position: number;
  library_item_id: number | null;
};

type BusinessReviewSystemRatingRow = {
  business_review_id: number;
  system_id: number;
  status: SystemScorecardStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  updated_at: string;
};

type BusinessReviewSystemPriorityRow = {
  business_review_id: number;
  system_id: number;
  position: number;
  action_step_id: number;
  starting_status: SystemScorecardStatus;
  selected_at: string;
  selected_by: string | null;
};

type UserSystemScorecardLastReviewRow = {
  audience: SystemScorecardAudience;
  system_key: string;
  last_reviewed_at: string | null;
  review_due_at: string | null;
  review_overdue: boolean;
};

type BusinessReviewFocusValueRow = {
  business_review_id: number;
  dimension_id: number;
  value: number;
  updated_at: string;
};

type BusinessReviewMeetingRow = {
  id: number;
  ghl_status: string | null;
};

type BusinessReviewPreparationRow = {
  business_review_id: number;
  business_forward_wins: string;
  personal_forward_wins: string;
  greatest_business_challenge: string;
  greatest_personal_challenge: string;
  desired_call_outcome: string;
  topics_to_discuss: string;
  business_rating: number;
  personal_rating: number;
  submitted_at: string;
  updated_at: string;
};

async function loadReviewRatings(client: SupabaseClient, reviewIds: number[]): Promise<BusinessReviewSystemRatingRow[]> {
  const rows: BusinessReviewSystemRatingRow[] = [];
  for (let offset = 0; offset < reviewIds.length; offset += 100) {
    const batch = reviewIds.slice(offset, offset + 100);
    let start = 0;
    while (true) {
      const result = await client.from('business_review_system_ratings')
        .select('business_review_id,system_id,status,reviewed_at,reviewed_by,updated_at')
        .in('business_review_id', batch).order('business_review_id').order('system_id').range(start, start + 199);
      if (result.error) throw result.error;
      if (!result.data?.length) break;
      rows.push(...result.data as BusinessReviewSystemRatingRow[]);
      start += result.data.length;
    }
  }
  return rows;
}

function shiftUtcYear(date: Date, years: number): Date {
  const result = new Date(date);
  result.setUTCFullYear(date.getUTCFullYear() + years);
  // Match PostgreSQL's calendar-year interval for leap-day review dates.
  if (result.getUTCMonth() !== date.getUTCMonth()) result.setUTCDate(0);
  return result;
}

export function getBusinessReviewDueAt(reviewedAt: string): string {
  return shiftUtcYear(new Date(reviewedAt), 1).toISOString();
}

export function isCancelledGhlStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase().replace(/[\s_-]+/g, '');
  return ['cancelled', 'canceled', 'deleted', 'invalid', 'noshow'].includes(normalized);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function parsePositiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export async function canManageBusinessReviews(
  client: SupabaseClient,
  actorId: string,
  roleCodes: readonly string[],
  studentId: string,
): Promise<boolean> {
  if (hasRoleCode(roleCodes, 'admin')) {
    return true;
  }

  if (!hasRoleCode(roleCodes, 'coach')) {
    return false;
  }

  const memberIds = await getNotesScopeUserIds(client, studentId);
  if (!memberIds.length) return false;

  for (let offset = 0; offset < memberIds.length; offset += 100) {
    const { data, error } = await client
      .from('user_coaches').select('id').eq('coach_id', actorId)
      .in('user_id', memberIds.slice(offset, offset + 100)).eq('is_active', true)
      .or(`ended_at.is.null,ended_at.gt.${new Date().toISOString()}`).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return true;
  }
  return false;
}

export async function canManageBusinessReviewRecord(
  client: SupabaseClient, actorId: string, roleCodes: readonly string[], coachingNoteId: number,
): Promise<boolean> {
  const note = await client.from('coaching_notes_base').select('user_id')
    .eq('id', coachingNoteId).is('deleted_at', null).maybeSingle();
  if (note.error) throw note.error;
  if (!note.data) return false;
  return canManageBusinessReviews(client, actorId, roleCodes, note.data.user_id);
}

export async function loadBusinessReviews(
  client: SupabaseClient,
  studentId: string,
): Promise<BusinessReviewsPayload> {
  const notes = await loadVisibleCoachingNotes(client, studentId);
  const [
    { data: dimensionRows, error: dimensionError },
    reviewRows,
  ] = await Promise.all([
    client
      .from('focus_finder_dimensions')
      .select('id, key, group_key, group_label, label, subtitle, position')
      .eq('template_key', FOCUS_FINDER_TEMPLATE_KEY)
      .order('position', { ascending: true }),
    readRowsForIds<BusinessReviewRow>(client, 'business_reviews',
      'id, user_id, coach_id, meeting_id, archived_meeting_id, coaching_note_id, focus_finder_template_key, system_scorecard_template_key, review_date, status, completed_at, created_at, updated_at',
      'coaching_note_id', notes.map((note) => note.id)),
  ]);

  if (dimensionError) {
    throw new Error(dimensionError.message);
  }

  const dimensions = ((dimensionRows ?? []) as FocusFinderDimensionRow[]).map((row) => ({
    id: Number(row.id),
    key: row.key,
    groupKey: row.group_key,
    groupLabel: row.group_label,
    label: row.label,
    subtitle: row.subtitle,
    position: row.position,
  }));

  const rows = reviewRows.sort((left, right) => right.review_date.localeCompare(left.review_date) || Number(right.id) - Number(left.id));
  const reviewIds = rows.map((row) => Number(row.id));
  let additionalScorecardRows: AdditionalScorecardRow[] = [];
  let focusValueRows: BusinessReviewFocusValueRow[] = [];
  let ratingRows: BusinessReviewSystemRatingRow[] = [];
  let priorityRows: BusinessReviewSystemPriorityRow[] = [];
  let templateRows: SystemScorecardTemplateRow[] = [];
  let categoryRows: SystemScorecardCategoryRow[] = [];
  let systemRows: SystemScorecardSystemRow[] = [];
  let meetingRows: BusinessReviewMeetingRow[] = [];
  let preparationRows: BusinessReviewPreparationRow[] = [];

  if (reviewIds.length > 0) {
    const { data: assignedScorecards, error: assignedScorecardsError } = await client
      .from('business_review_additional_scorecards')
      .select('business_review_id, template_key')
      .in('business_review_id', reviewIds);
    if (assignedScorecardsError) throw new Error(assignedScorecardsError.message);
    additionalScorecardRows = (assignedScorecards ?? []) as AdditionalScorecardRow[];

    const meetingIds = rows
      .map((row) => row.meeting_id ?? row.archived_meeting_id)
      .filter((meetingId): meetingId is number => meetingId != null);
    const [focusResult, ratingResult, priorityResult, preparationResult, meetingResult] =
      await Promise.all([
      client
        .from('business_review_focus_values')
        .select('business_review_id, dimension_id, value, updated_at')
        .in('business_review_id', reviewIds),
      loadReviewRatings(client, reviewIds),
      client
        .from('business_review_system_priorities')
        .select(
          'business_review_id, system_id, position, action_step_id, starting_status, selected_at, selected_by',
        )
        .in('business_review_id', reviewIds),
      client
        .from('business_review_preparation_responses')
        .select(
          'business_review_id, business_forward_wins, personal_forward_wins, greatest_business_challenge, greatest_personal_challenge, desired_call_outcome, topics_to_discuss, business_rating, personal_rating, submitted_at, updated_at',
        )
        .in('business_review_id', reviewIds),
      meetingIds.length > 0
        ? client.from('meetings').select('id, ghl_status').in('id', meetingIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (focusResult.error) {
      throw new Error(focusResult.error.message);
    }

    if (priorityResult.error) {
      throw new Error(priorityResult.error.message);
    }

    if (preparationResult.error) {
      throw new Error(preparationResult.error.message);
    }

    if (meetingResult.error) {
      throw new Error(meetingResult.error.message);
    }

    focusValueRows = (focusResult.data ?? []) as BusinessReviewFocusValueRow[];
    ratingRows = ratingResult;
    priorityRows = (priorityResult.data ?? []) as BusinessReviewSystemPriorityRow[];
    preparationRows = (preparationResult.data ?? []) as BusinessReviewPreparationRow[];
    meetingRows = (meetingResult.data ?? []) as BusinessReviewMeetingRow[];
  }

  const scorecardTemplateKeys = Array.from(
    new Set(
      [
        ...rows.map((row) => row.system_scorecard_template_key),
        ...additionalScorecardRows.map((row) => row.template_key),
      ].filter((key): key is string => Boolean(key)),
    ),
  );

  if (scorecardTemplateKeys.length > 0) {
    const [templateResult, categoryResult, systemResult] =
      await Promise.all([
        client
          .from('system_scorecard_templates')
          .select('key, audience, name, version')
          .in('key', scorecardTemplateKeys),
        client
          .from('system_scorecard_categories')
          .select('id, template_key, key, label, position')
          .in('template_key', scorecardTemplateKeys)
          .order('position', { ascending: true }),
        client
          .from('system_scorecard_systems')
          .select('id, template_key, category_id, key, label, position, library_item_id')
          .in('template_key', scorecardTemplateKeys)
          .order('position', { ascending: true }),
      ]);

    if (templateResult.error) {
      throw new Error(templateResult.error.message);
    }

    if (categoryResult.error) {
      throw new Error(categoryResult.error.message);
    }

    if (systemResult.error) {
      throw new Error(systemResult.error.message);
    }

    templateRows = (templateResult.data ?? []) as SystemScorecardTemplateRow[];
    categoryRows = (categoryResult.data ?? []) as SystemScorecardCategoryRow[];
    systemRows = (systemResult.data ?? []) as SystemScorecardSystemRow[];
  }

  const focusValuesByReviewId = new Map<number, BusinessReviewFocusValue[]>();

  focusValueRows.forEach((row) => {
    const reviewId = Number(row.business_review_id);
    const values = focusValuesByReviewId.get(reviewId) ?? [];

    values.push({
      dimensionId: Number(row.dimension_id),
      value: Number(row.value),
      updatedAt: row.updated_at,
    });
    focusValuesByReviewId.set(reviewId, values);
  });

  const templatesByKey = new Map(templateRows.map((row) => [row.key, row]));
  const ratingsByReviewAndSystem = new Map(
    ratingRows.map((row) => [
      `${Number(row.business_review_id)}:${Number(row.system_id)}`,
      row,
    ]),
  );
  const prioritiesByReviewAndSystem = new Map(
    priorityRows.map((row) => [
      `${Number(row.business_review_id)}:${Number(row.system_id)}`,
      row,
    ]),
  );
  const lastReviewsByAudienceAndSystem = new Map<string, UserSystemScorecardLastReviewRow>();
  const systemById = new Map(systemRows.map((row) => [Number(row.id), row]));
  const overdueBefore = shiftUtcYear(new Date(), -1).getTime();
  // Aggregate only reviews attached to this member's visible notes. Review
  // user_id can differ from note ownership after a partnership stops sharing.
  for (const row of ratingRows) {
    if (!row.reviewed_at) continue;
    const system = systemById.get(Number(row.system_id));
    const template = system ? templatesByKey.get(system.template_key) : null;
    if (!system || !template) continue;
    const key = `${template.audience}:${system.key}`;
    const previous = lastReviewsByAudienceAndSystem.get(key);
    if (!previous || Date.parse(row.reviewed_at) > Date.parse(previous.last_reviewed_at ?? '')) {
      const reviewedAt = new Date(row.reviewed_at);
      lastReviewsByAudienceAndSystem.set(key, {
        audience: template.audience, system_key: system.key, last_reviewed_at: row.reviewed_at,
        review_due_at: getBusinessReviewDueAt(row.reviewed_at), review_overdue: reviewedAt.getTime() < overdueBefore,
      });
    }
  }
  const meetingStatusById = new Map(
    meetingRows.map((row) => [Number(row.id), row.ghl_status]),
  );
  const preparationByReviewId = new Map(
    preparationRows.map((row) => [Number(row.business_review_id), row]),
  );

  const reviews = rows.map((row) => ({
    ...mapBusinessReviewRow(
      row,
      additionalScorecardRows,
      focusValuesByReviewId,
      templatesByKey,
      categoryRows,
      systemRows,
      ratingsByReviewAndSystem,
      prioritiesByReviewAndSystem,
      lastReviewsByAudienceAndSystem,
      meetingStatusById,
      preparationByReviewId,
    ),
  }));

  return { dimensions, reviews };
}

function mapBusinessReviewRow(
  row: BusinessReviewRow,
  additionalScorecardRows: AdditionalScorecardRow[],
  focusValuesByReviewId: Map<number, BusinessReviewFocusValue[]>,
  templatesByKey: Map<string, SystemScorecardTemplateRow>,
  categoryRows: SystemScorecardCategoryRow[],
  systemRows: SystemScorecardSystemRow[],
  ratingsByReviewAndSystem: Map<string, BusinessReviewSystemRatingRow>,
  prioritiesByReviewAndSystem: Map<string, BusinessReviewSystemPriorityRow>,
  lastReviewsByAudienceAndSystem: Map<string, UserSystemScorecardLastReviewRow>,
  meetingStatusById: Map<number, string | null>,
  preparationByReviewId: Map<number, BusinessReviewPreparationRow>,
): BusinessReview {
  const reviewId = Number(row.id);
  const storedMeetingId = row.meeting_id ?? row.archived_meeting_id;
  const meetingId = storedMeetingId == null ? null : Number(storedMeetingId);
  const meetingStatus = meetingId == null ? null : (meetingStatusById.get(meetingId) ?? null);
  const preparation = preparationByReviewId.get(reviewId);
  const buildScorecard = (templateKey: string): BusinessReviewSystemScorecard | null => {
    const scorecardTemplate = templatesByKey.get(templateKey);
    return scorecardTemplate ? {
        templateKey: scorecardTemplate.key,
        audience: scorecardTemplate.audience,
        name: scorecardTemplate.name,
        version: scorecardTemplate.version,
        categories: categoryRows
          .filter((category) => category.template_key === scorecardTemplate.key)
          .map((category) => ({
            id: Number(category.id),
            key: category.key,
            label: category.label,
            position: Number(category.position),
            systems: systemRows
              .filter(
                (system) =>
                  system.template_key === scorecardTemplate.key &&
                  Number(system.category_id) === Number(category.id),
              )
              .map((system) => {
                const systemId = Number(system.id);
                const rating = ratingsByReviewAndSystem.get(`${reviewId}:${systemId}`);
                const priority = prioritiesByReviewAndSystem.get(`${reviewId}:${systemId}`);
                const latestReview = lastReviewsByAudienceAndSystem.get(
                  `${scorecardTemplate.audience}:${system.key}`,
                );

                return {
                  id: systemId,
                  key: system.key,
                  label: system.label,
                  position: Number(system.position),
                  libraryItemId:
                    system.library_item_id == null ? null : Number(system.library_item_id),
                  rating: {
                    systemId,
                    status: rating?.status ?? 'not_started',
                    reviewedAt: rating?.reviewed_at ?? null,
                    reviewedBy: rating?.reviewed_by ?? null,
                    updatedAt: rating?.updated_at ?? null,
                    lastReviewedAt: latestReview?.last_reviewed_at ?? null,
                    reviewDueAt: latestReview?.review_due_at ?? null,
                    reviewOverdue: latestReview?.review_overdue ?? true,
                  },
                  priority: priority
                    ? {
                        position: Number(priority.position),
                        actionStepId: Number(priority.action_step_id),
                        startingStatus: priority.starting_status,
                        selectedAt: priority.selected_at,
                        selectedBy: priority.selected_by,
                      }
                    : null,
                };
              }),
          })),
    } : null;
  };
  const systemScorecard = row.system_scorecard_template_key
    ? buildScorecard(row.system_scorecard_template_key)
    : null;
  const additionalScorecards = additionalScorecardRows
    .filter((assignment) => Number(assignment.business_review_id) === reviewId)
    .map((assignment) => buildScorecard(assignment.template_key))
    .filter((scorecard): scorecard is BusinessReviewSystemScorecard => scorecard !== null);

  return {
    id: reviewId,
    userId: row.user_id,
    coachId: row.coach_id,
    meetingId,
    meetingStatus,
    meetingCancelled: isCancelledGhlStatus(meetingStatus),
    coachingNoteId: Number(row.coaching_note_id),
    templateKey: row.focus_finder_template_key,
    systemScorecardTemplateKey: row.system_scorecard_template_key,
    reviewDate: row.review_date,
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    focusValues: focusValuesByReviewId.get(reviewId) ?? [],
    systemScorecard,
    additionalScorecards,
    preparation: preparation
      ? {
          businessForwardWins: preparation.business_forward_wins,
          personalForwardWins: preparation.personal_forward_wins,
          greatestBusinessChallenge: preparation.greatest_business_challenge,
          greatestPersonalChallenge: preparation.greatest_personal_challenge,
          desiredCallOutcome: preparation.desired_call_outcome,
          topicsToDiscuss: preparation.topics_to_discuss,
          businessRating: Number(preparation.business_rating),
          personalRating: Number(preparation.personal_rating),
          submittedAt: preparation.submitted_at,
          updatedAt: preparation.updated_at,
        }
      : null,
  };
}
