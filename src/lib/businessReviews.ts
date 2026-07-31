import type { SupabaseClient } from '@supabase/supabase-js';

import { hasRoleCode } from '@/lib/userRoles';

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
  user_id: string;
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

  const { data, error } = await client
    .from('user_coaches')
    .select('id')
    .eq('coach_id', actorId)
    .eq('user_id', studentId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function loadBusinessReviews(
  client: SupabaseClient,
  studentId: string,
): Promise<BusinessReviewsPayload> {
  const [
    { data: dimensionRows, error: dimensionError },
    { data: reviewRows, error: reviewError },
  ] = await Promise.all([
    client
      .from('focus_finder_dimensions')
      .select('id, key, group_key, group_label, label, subtitle, position')
      .eq('template_key', FOCUS_FINDER_TEMPLATE_KEY)
      .order('position', { ascending: true }),
    client
      .from('business_reviews')
      .select(
        'id, user_id, coach_id, coaching_note_id, focus_finder_template_key, system_scorecard_template_key, review_date, status, completed_at, created_at, updated_at',
      )
      .eq('user_id', studentId)
      .order('review_date', { ascending: false })
      .order('id', { ascending: false }),
  ]);

  if (dimensionError) {
    throw new Error(dimensionError.message);
  }

  if (reviewError) {
    throw new Error(reviewError.message);
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

  const rows = (reviewRows ?? []) as BusinessReviewRow[];
  const reviewIds = rows.map((row) => Number(row.id));
  const scorecardTemplateKeys = Array.from(
    new Set(
      rows
        .map((row) => row.system_scorecard_template_key)
        .filter((key): key is string => Boolean(key)),
    ),
  );
  let focusValueRows: BusinessReviewFocusValueRow[] = [];
  let ratingRows: BusinessReviewSystemRatingRow[] = [];
  let priorityRows: BusinessReviewSystemPriorityRow[] = [];
  let templateRows: SystemScorecardTemplateRow[] = [];
  let categoryRows: SystemScorecardCategoryRow[] = [];
  let systemRows: SystemScorecardSystemRow[] = [];
  let lastReviewRows: UserSystemScorecardLastReviewRow[] = [];

  if (reviewIds.length > 0) {
    const [focusResult, ratingResult, priorityResult] = await Promise.all([
      client
        .from('business_review_focus_values')
        .select('business_review_id, dimension_id, value, updated_at')
        .in('business_review_id', reviewIds),
      client
        .from('business_review_system_ratings')
        .select(
          'business_review_id, system_id, status, reviewed_at, reviewed_by, updated_at',
        )
        .in('business_review_id', reviewIds),
      client
        .from('business_review_system_priorities')
        .select(
          'business_review_id, system_id, position, action_step_id, starting_status, selected_at, selected_by',
        )
        .in('business_review_id', reviewIds),
    ]);

    if (focusResult.error) {
      throw new Error(focusResult.error.message);
    }

    if (ratingResult.error) {
      throw new Error(ratingResult.error.message);
    }

    if (priorityResult.error) {
      throw new Error(priorityResult.error.message);
    }

    focusValueRows = (focusResult.data ?? []) as BusinessReviewFocusValueRow[];
    ratingRows = (ratingResult.data ?? []) as BusinessReviewSystemRatingRow[];
    priorityRows = (priorityResult.data ?? []) as BusinessReviewSystemPriorityRow[];
  }

  if (scorecardTemplateKeys.length > 0) {
    const [templateResult, categoryResult, systemResult, lastReviewResult] =
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
        client
          .from('user_system_scorecard_last_reviews')
          .select(
            'user_id, audience, system_key, last_reviewed_at, review_due_at, review_overdue',
          )
          .eq('user_id', studentId),
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

    if (lastReviewResult.error) {
      throw new Error(lastReviewResult.error.message);
    }

    templateRows = (templateResult.data ?? []) as SystemScorecardTemplateRow[];
    categoryRows = (categoryResult.data ?? []) as SystemScorecardCategoryRow[];
    systemRows = (systemResult.data ?? []) as SystemScorecardSystemRow[];
    lastReviewRows = (lastReviewResult.data ?? []) as UserSystemScorecardLastReviewRow[];
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
  const lastReviewsByAudienceAndSystem = new Map(
    lastReviewRows.map((row) => [`${row.audience}:${row.system_key}`, row]),
  );

  const reviews = rows.map((row) => ({
    ...mapBusinessReviewRow(
      row,
      focusValuesByReviewId,
      templatesByKey,
      categoryRows,
      systemRows,
      ratingsByReviewAndSystem,
      prioritiesByReviewAndSystem,
      lastReviewsByAudienceAndSystem,
    ),
  }));

  return { dimensions, reviews };
}

function mapBusinessReviewRow(
  row: BusinessReviewRow,
  focusValuesByReviewId: Map<number, BusinessReviewFocusValue[]>,
  templatesByKey: Map<string, SystemScorecardTemplateRow>,
  categoryRows: SystemScorecardCategoryRow[],
  systemRows: SystemScorecardSystemRow[],
  ratingsByReviewAndSystem: Map<string, BusinessReviewSystemRatingRow>,
  prioritiesByReviewAndSystem: Map<string, BusinessReviewSystemPriorityRow>,
  lastReviewsByAudienceAndSystem: Map<string, UserSystemScorecardLastReviewRow>,
): BusinessReview {
  const reviewId = Number(row.id);
  const scorecardTemplate = row.system_scorecard_template_key
    ? templatesByKey.get(row.system_scorecard_template_key)
    : null;

  const systemScorecard: BusinessReviewSystemScorecard | null = scorecardTemplate
    ? {
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
      }
    : null;

  return {
    id: reviewId,
    userId: row.user_id,
    coachId: row.coach_id,
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
  };
}
