import 'server-only';

import { adminClient } from '@/lib/courseBuilder';
import type {
  ScorecardLibraryAdminPayload,
  ScorecardLibraryAudience,
  ScorecardLibraryCategory,
  ScorecardLibraryMappingUpdate,
  ScorecardLibraryOption,
  ScorecardLibrarySource,
  ScorecardLibrarySystem,
  ScorecardLibraryTemplate,
  ScorecardDraftCategoryInput,
  ScorecardTemplateState,
  ScorecardVersionPublishPreview,
  ScorecardVersionPublishResult,
  ScorecardVersionReviewConflict,
  ScorecardVersionReviewResolution,
  ScorecardVersionTargetSystem,
} from '@/types/systemScorecardLibrary';

const MAIN_LIBRARY_SLUG = 'library';
const LEGENDS_LIBRARY_SLUG = 'legends-library';

type TemplateRow = {
  key: string;
  audience: ScorecardLibraryAudience;
  name: string;
  version: number;
  is_active: boolean;
};

type CategoryRow = {
  id: number;
  template_key: string;
  key: string;
  label: string;
  position: number;
};

type SystemRow = {
  id: number;
  template_key: string;
  category_id: number;
  key: string;
  label: string;
  position: number;
  library_item_id: number | null;
};

type ReviewVersionRow = {
  id: number;
  user_id: string;
  system_scorecard_template_key: string | null;
  status: 'draft' | 'completed';
  review_date: string;
};

type PriorityVersionRow = {
  business_review_id: number;
  system_id: number;
  action_step_id: number;
};

type RatingVersionRow = {
  business_review_id: number;
  system_id: number;
  reviewed_at: string;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type ContentNodeRow = {
  id: number;
  title: string | null;
  description: string | null;
  slug: string | null;
  node_type: string;
  state: string | null;
};

type NodeChildRow = {
  parent_id: number;
  child_id: number;
  position: number;
};

type LibraryRoot = {
  id: number;
  source: ScorecardLibrarySource;
};

export class SystemScorecardLibraryError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'SystemScorecardLibraryError';
    this.status = status;
    this.details = details;
  }
}

async function loadLibraryRoots(): Promise<LibraryRoot[]> {
  const { data, error } = await adminClient
    .from('content_nodes')
    .select('id, slug')
    .in('slug', [MAIN_LIBRARY_SLUG, LEGENDS_LIBRARY_SLUG]);

  if (error) {
    throw new SystemScorecardLibraryError(`Failed to load library roots: ${error.message}`, 500);
  }

  const rows = (data ?? []) as Array<{ id: number; slug: string | null }>;
  const mainRoot = rows.find((row) => row.slug === MAIN_LIBRARY_SLUG);
  const legendsRoot = rows.find((row) => row.slug === LEGENDS_LIBRARY_SLUG);

  if (!mainRoot) {
    throw new SystemScorecardLibraryError('Main Library collection not found.', 404);
  }

  return [
    { id: Number(mainRoot.id), source: 'main' },
    ...(legendsRoot && Number(legendsRoot.id) !== Number(mainRoot.id)
      ? [{ id: Number(legendsRoot.id), source: 'legend' as const }]
      : []),
  ];
}

async function loadLibraryGraph(roots: LibraryRoot[]) {
  const rootIds = new Set(roots.map((root) => root.id));
  const discoveredIds = new Set(rootIds);
  const edges: NodeChildRow[] = [];
  let frontier = [...rootIds];

  while (frontier.length > 0) {
    const { data, error } = await adminClient
      .from('node_children')
      .select('parent_id, child_id, position')
      .in('parent_id', frontier)
      .order('position', { ascending: true });

    if (error) {
      throw new SystemScorecardLibraryError(`Failed to load library structure: ${error.message}`, 500);
    }

    const nextFrontier: number[] = [];
    for (const row of (data ?? []) as NodeChildRow[]) {
      edges.push({
        parent_id: Number(row.parent_id),
        child_id: Number(row.child_id),
        position: Number(row.position),
      });
      if (!discoveredIds.has(Number(row.child_id))) {
        discoveredIds.add(Number(row.child_id));
        nextFrontier.push(Number(row.child_id));
      }
    }

    frontier = nextFrontier;
  }

  const contentIds = [...discoveredIds].filter((id) => !rootIds.has(id));
  if (contentIds.length === 0) {
    return { edges, nodes: new Map<number, ContentNodeRow>() };
  }

  const { data: nodeRows, error: nodeError } = await adminClient
    .from('content_nodes')
    .select('id, title, description, slug, node_type, state')
    .in('id', contentIds);

  if (nodeError) {
    throw new SystemScorecardLibraryError(`Failed to load library items: ${nodeError.message}`, 500);
  }

  return {
    edges,
    nodes: new Map(
      ((nodeRows ?? []) as ContentNodeRow[]).map((node) => [Number(node.id), node]),
    ),
  };
}

export async function loadScorecardLibraryOptions(): Promise<ScorecardLibraryOption[]> {
  const roots = await loadLibraryRoots();
  const { edges, nodes } = await loadLibraryGraph(roots);
  const childrenByParent = new Map<number, NodeChildRow[]>();

  edges.forEach((edge) => {
    const children = childrenByParent.get(edge.parent_id) ?? [];
    children.push(edge);
    childrenByParent.set(edge.parent_id, children);
  });
  childrenByParent.forEach((children) => children.sort((a, b) => a.position - b.position));

  const options: ScorecardLibraryOption[] = [];
  const includedIds = new Set<number>();

  const visit = (
    parentId: number,
    source: ScorecardLibrarySource,
    ancestorTitles: string[],
    pathIds: ReadonlySet<number>,
  ) => {
    for (const edge of childrenByParent.get(parentId) ?? []) {
      if (pathIds.has(edge.child_id)) continue;
      const node = nodes.get(edge.child_id);
      if (!node) continue;

      const title = node.title?.trim() || 'Untitled';
      const nextAncestorTitles = [...ancestorTitles, title];
      const nextPathIds = new Set(pathIds);
      nextPathIds.add(edge.child_id);

      if (!includedIds.has(edge.child_id)) {
        includedIds.add(edge.child_id);
        options.push({
          id: Number(node.id),
          title,
          description: node.description ?? null,
          slug: node.slug ?? null,
          nodeType: node.node_type,
          state: node.state ?? null,
          source,
          breadcrumb: nextAncestorTitles.join(' / '),
        });
      }

      visit(edge.child_id, source, nextAncestorTitles, nextPathIds);
    }
  };

  for (const root of roots) {
    visit(root.id, root.source, [], new Set([root.id]));
  }

  return options;
}

async function loadAllReviewVersionRows(): Promise<ReviewVersionRow[]> {
  const rows: ReviewVersionRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await adminClient
      .from('business_reviews')
      .select('id, user_id, system_scorecard_template_key, status, review_date')
      .not('system_scorecard_template_key', 'is', null)
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new SystemScorecardLibraryError(`Failed to load scorecard usage: ${error.message}`, 500);
    }

    const page = (data ?? []) as ReviewVersionRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

async function loadScorecardRows() {
  const [templateResult, categoryResult, systemResult, reviews, libraryOptions] = await Promise.all([
    adminClient
      .from('system_scorecard_templates')
      .select('key, audience, name, version, is_active')
      .order('audience', { ascending: true })
      .order('version', { ascending: false }),
    adminClient
      .from('system_scorecard_categories')
      .select('id, template_key, key, label, position')
      .order('position', { ascending: true }),
    adminClient
      .from('system_scorecard_systems')
      .select('id, template_key, category_id, key, label, position, library_item_id')
      .order('position', { ascending: true }),
    loadAllReviewVersionRows(),
    loadScorecardLibraryOptions(),
  ]);

  if (templateResult.error) {
    throw new SystemScorecardLibraryError(`Failed to load scorecard templates: ${templateResult.error.message}`, 500);
  }
  if (categoryResult.error) {
    throw new SystemScorecardLibraryError(`Failed to load scorecard categories: ${categoryResult.error.message}`, 500);
  }
  if (systemResult.error) {
    throw new SystemScorecardLibraryError(`Failed to load scorecard systems: ${systemResult.error.message}`, 500);
  }
  return {
    templates: (templateResult.data ?? []) as TemplateRow[],
    categories: (categoryResult.data ?? []) as CategoryRow[],
    systems: (systemResult.data ?? []) as SystemRow[],
    reviews,
    libraryOptions,
  };
}

export async function loadSystemScorecardLibraryAdmin(): Promise<ScorecardLibraryAdminPayload> {
  const { templates, categories, systems, reviews, libraryOptions } = await loadScorecardRows();
  const optionById = new Map(libraryOptions.map((option) => [option.id, option]));
  const audienceByTemplateKey = new Map(templates.map((template) => [template.key, template.audience]));

  const mappedTemplates: ScorecardLibraryTemplate[] = templates.map((template) => {
    const reviewCount = reviews.filter(
      (review) => review.system_scorecard_template_key === template.key,
    ).length;
    const draftReviewCount = reviews.filter(
      (review) =>
        review.system_scorecard_template_key === template.key && review.status === 'draft',
    ).length;
    const state: ScorecardTemplateState = template.is_active
      ? 'active'
      : reviewCount === 0
        ? 'draft'
        : 'archived';
    const upgradeCandidateCount = template.is_active
      ? reviews.filter(
          (review) =>
            review.status === 'draft' &&
            review.system_scorecard_template_key !== template.key &&
            review.system_scorecard_template_key != null &&
            audienceByTemplateKey.get(review.system_scorecard_template_key) === template.audience,
        ).length
      : 0;

    return {
      key: template.key,
      audience: template.audience,
      name: template.name,
      version: Number(template.version),
      isActive: Boolean(template.is_active),
      state,
      reviewCount,
      draftReviewCount,
      upgradeCandidateCount,
      categories: categories
      .filter((category) => category.template_key === template.key)
      .map<ScorecardLibraryCategory>((category) => ({
        id: Number(category.id),
        key: category.key,
        label: category.label,
        position: Number(category.position),
        systems: systems
          .filter(
            (system) =>
              system.template_key === template.key &&
              Number(system.category_id) === Number(category.id),
          )
          .map<ScorecardLibrarySystem>((system) => ({
            id: Number(system.id),
            key: system.key,
            label: system.label,
            position: Number(system.position),
            libraryItemId:
              system.library_item_id == null ? null : Number(system.library_item_id),
            mappedItem:
              system.library_item_id == null
                ? null
                : (optionById.get(Number(system.library_item_id)) ?? null),
          })),
      })),
    };
  });

  return { templates: mappedTemplates, libraryOptions };
}

async function loadSystemAndAudience(systemId: number) {
  const { data: system, error: systemError } = await adminClient
    .from('system_scorecard_systems')
    .select('id, template_key, library_item_id')
    .eq('id', systemId)
    .maybeSingle();

  if (systemError) {
    throw new SystemScorecardLibraryError(`Failed to load scorecard system: ${systemError.message}`, 500);
  }
  if (!system) {
    throw new SystemScorecardLibraryError('Scorecard system not found.', 404);
  }

  const { data: template, error: templateError } = await adminClient
    .from('system_scorecard_templates')
    .select('audience')
    .eq('key', system.template_key)
    .maybeSingle();

  if (templateError) {
    throw new SystemScorecardLibraryError(`Failed to load scorecard audience: ${templateError.message}`, 500);
  }
  if (!template) {
    throw new SystemScorecardLibraryError('Scorecard template not found.', 404);
  }

  return {
    system,
    audience: template.audience as ScorecardLibraryAudience,
  };
}

export async function updateSystemScorecardLibraryMapping(
  systemId: number,
  libraryItemId: number | null,
): Promise<ScorecardLibraryMappingUpdate> {
  const [{ system, audience }, libraryOptions] = await Promise.all([
    loadSystemAndAudience(systemId),
    loadScorecardLibraryOptions(),
  ]);
  const option =
    libraryItemId == null
      ? null
      : (libraryOptions.find((candidate) => candidate.id === libraryItemId) ?? null);

  if (libraryItemId != null && !option) {
    throw new SystemScorecardLibraryError('Select an item from the Library.', 400);
  }

  if (option?.source === 'legend' && audience !== 'legends') {
    throw new SystemScorecardLibraryError(
      'Foundation systems can only link to Main Library items.',
      400,
    );
  }

  const { error: updateError } = await adminClient
    .from('system_scorecard_systems')
    .update({ library_item_id: libraryItemId, updated_at: new Date().toISOString() })
    .eq('id', system.id);

  if (updateError) {
    throw new SystemScorecardLibraryError(`Failed to save library mapping: ${updateError.message}`, 500);
  }

  const { data: priorityRows, error: priorityError } = await adminClient
    .from('business_review_system_priorities')
    .select('action_step_id')
    .eq('system_id', system.id);

  if (priorityError) {
    throw new SystemScorecardLibraryError(
      `The system mapping was saved, but existing action steps could not be synchronized: ${priorityError.message}`,
      500,
    );
  }

  const actionStepIds = (priorityRows ?? [])
    .map((row) => Number(row.action_step_id))
    .filter((id) => Number.isSafeInteger(id) && id > 0);

  if (actionStepIds.length > 0) {
    const { error: actionStepError } = await adminClient
      .from('coaching_note_action_steps')
      .update({ library_item_id: libraryItemId, updated_at: new Date().toISOString() })
      .in('id', actionStepIds);

    if (actionStepError) {
      throw new SystemScorecardLibraryError(
        `The system mapping was saved, but existing action steps could not be synchronized: ${actionStepError.message}`,
        500,
      );
    }
  }

  return {
    systemId: Number(system.id),
    libraryItemId,
    mappedItem: option,
  };
}

const STABLE_KEY_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

function throwRpcError(
  error: { code?: string; message: string },
  fallbackMessage: string,
): never {
  const missingFunction =
    error.code === 'PGRST202' || error.message.toLowerCase().includes('schema cache');
  throw new SystemScorecardLibraryError(
    missingFunction
      ? 'Scorecard version management is not installed in the database yet.'
      : error.message || fallbackMessage,
    missingFunction ? 503 : 400,
  );
}

function validateDraftCategories(
  categories: ScorecardDraftCategoryInput[],
  audience: ScorecardLibraryAudience,
  libraryOptions: ScorecardLibraryOption[],
) {
  if (categories.length === 0 || categories.length > 30) {
    throw new SystemScorecardLibraryError('Use between 1 and 30 scorecard categories.');
  }

  const categoryKeys = new Set<string>();
  const systemKeys = new Set<string>();
  const optionsById = new Map(libraryOptions.map((option) => [option.id, option]));
  let systemCount = 0;

  categories.forEach((category) => {
    const categoryKey = category.key.trim();
    const categoryLabel = category.label.trim();
    if (!STABLE_KEY_PATTERN.test(categoryKey) || categoryKey.length > 100) {
      throw new SystemScorecardLibraryError(
        `“${category.key || 'Untitled category'}” needs a lowercase stable key using letters, numbers, and underscores.`,
      );
    }
    if (!categoryLabel || categoryLabel.length > 160) {
      throw new SystemScorecardLibraryError('Every category needs a label under 160 characters.');
    }
    if (categoryKeys.has(categoryKey)) {
      throw new SystemScorecardLibraryError(`Category key “${categoryKey}” is duplicated.`);
    }
    categoryKeys.add(categoryKey);

    if (!Array.isArray(category.systems) || category.systems.length === 0) {
      throw new SystemScorecardLibraryError(`“${categoryLabel}” needs at least one system.`);
    }

    category.systems.forEach((system) => {
      systemCount += 1;
      const systemKey = system.key.trim();
      const systemLabel = system.label.trim();
      if (!STABLE_KEY_PATTERN.test(systemKey) || systemKey.length > 120) {
        throw new SystemScorecardLibraryError(
          `“${system.label || 'Untitled system'}” needs a lowercase stable key using letters, numbers, and underscores.`,
        );
      }
      if (!systemLabel || systemLabel.length > 180) {
        throw new SystemScorecardLibraryError('Every system needs a label under 180 characters.');
      }
      if (systemKeys.has(systemKey)) {
        throw new SystemScorecardLibraryError(`System key “${systemKey}” is duplicated.`);
      }
      systemKeys.add(systemKey);

      if (system.libraryItemId != null) {
        const option = optionsById.get(system.libraryItemId);
        if (!option) {
          throw new SystemScorecardLibraryError(
            `The library item connected to “${systemLabel}” is no longer available.`,
          );
        }
        if (audience === 'foundation' && option.source === 'legend') {
          throw new SystemScorecardLibraryError(
            'Foundation systems can only link to Main Library items.',
          );
        }
      }
    });
  });

  if (systemCount > 200) {
    throw new SystemScorecardLibraryError('A scorecard version can contain up to 200 systems.');
  }
}

export async function cloneSystemScorecardVersion(
  sourceTemplateKey: string,
  actorId: string,
): Promise<string> {
  const { data, error } = await adminClient.rpc('admin_clone_system_scorecard_version', {
    _source_template_key: sourceTemplateKey,
    _actor_id: actorId,
  });

  if (error) throwRpcError(error, 'Failed to create a new scorecard version.');
  if (typeof data !== 'string' || !data) {
    throw new SystemScorecardLibraryError('The new scorecard version was not returned.', 500);
  }
  return data;
}

export async function saveSystemScorecardDraft(
  templateKey: string,
  name: string,
  categories: ScorecardDraftCategoryInput[],
  actorId: string,
): Promise<string> {
  const [{ data: template, error: templateError }, libraryOptions] = await Promise.all([
    adminClient
      .from('system_scorecard_templates')
      .select('key, audience, is_active')
      .eq('key', templateKey)
      .maybeSingle(),
    loadScorecardLibraryOptions(),
  ]);

  if (templateError) {
    throw new SystemScorecardLibraryError(`Failed to load scorecard draft: ${templateError.message}`, 500);
  }
  if (!template) {
    throw new SystemScorecardLibraryError('Scorecard draft not found.', 404);
  }
  if (template.is_active) {
    throw new SystemScorecardLibraryError('Published scorecard versions are immutable.', 409);
  }
  if (!name.trim() || name.trim().length > 180) {
    throw new SystemScorecardLibraryError('Enter a scorecard name under 180 characters.');
  }

  validateDraftCategories(
    categories,
    template.audience as ScorecardLibraryAudience,
    libraryOptions,
  );

  const normalizedCategories = categories.map((category) => ({
    key: category.key.trim(),
    label: category.label.trim(),
    systems: category.systems.map((system) => ({
      key: system.key.trim(),
      label: system.label.trim(),
      libraryItemId: system.libraryItemId,
    })),
  }));

  const { data, error } = await adminClient.rpc('admin_replace_system_scorecard_draft', {
    _template_key: templateKey,
    _name: name.trim(),
    _categories: normalizedCategories,
    _actor_id: actorId,
  });

  if (error) throwRpcError(error, 'Failed to save the scorecard draft.');
  return typeof data === 'string' && data ? data : templateKey;
}

export async function discardSystemScorecardDraft(
  templateKey: string,
  actorId: string,
): Promise<void> {
  const { error } = await adminClient.rpc('admin_discard_system_scorecard_draft', {
    _template_key: templateKey,
    _actor_id: actorId,
  });
  if (error) throwRpcError(error, 'Failed to discard the scorecard draft.');
}

function buildTargetSystems(
  target: TemplateRow,
  categories: CategoryRow[],
  systems: SystemRow[],
): ScorecardVersionTargetSystem[] {
  const categoryById = new Map(
    categories
      .filter((category) => category.template_key === target.key)
      .map((category) => [Number(category.id), category]),
  );

  return systems
    .filter((system) => system.template_key === target.key)
    .sort((left, right) => {
      const leftCategory = categoryById.get(Number(left.category_id));
      const rightCategory = categoryById.get(Number(right.category_id));
      return (
        Number(leftCategory?.position ?? 0) - Number(rightCategory?.position ?? 0) ||
        Number(left.position) - Number(right.position)
      );
    })
    .map((system) => ({
      key: system.key,
      label: system.label,
      categoryLabel: categoryById.get(Number(system.category_id))?.label ?? 'Uncategorized',
      libraryItemId:
        system.library_item_id == null ? null : Number(system.library_item_id),
    }));
}

function chunkValues<T>(values: T[], size = 200): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export async function previewSystemScorecardPublish(
  templateKey: string,
): Promise<ScorecardVersionPublishPreview> {
  const { templates, categories, systems, reviews } = await loadScorecardRows();
  const target = templates.find((template) => template.key === templateKey);
  if (!target) {
    throw new SystemScorecardLibraryError('Scorecard version not found.', 404);
  }

  const targetSystems = buildTargetSystems(target, categories, systems);
  if (targetSystems.length === 0) {
    throw new SystemScorecardLibraryError(
      'Add at least one system before publishing this version.',
    );
  }

  const targetKeys = new Set(targetSystems.map((system) => system.key));
  const sameAudienceTemplates = templates.filter(
    (template) => template.audience === target.audience,
  );
  const templateByKey = new Map(sameAudienceTemplates.map((template) => [template.key, template]));
  const eligibleReviews = reviews.filter(
    (review) =>
      review.status === 'draft' &&
      review.system_scorecard_template_key !== target.key &&
      review.system_scorecard_template_key != null &&
      templateByKey.has(review.system_scorecard_template_key),
  );
  const reviewIds = eligibleReviews.map((review) => Number(review.id));

  let priorities: PriorityVersionRow[] = [];
  let reviewedRatings: RatingVersionRow[] = [];
  if (reviewIds.length > 0) {
    const inspectionPages = await Promise.all(
      chunkValues(reviewIds).map(async (ids) => {
        const [priorityResult, ratingResult] = await Promise.all([
          adminClient
            .from('business_review_system_priorities')
            .select('business_review_id, system_id, action_step_id')
            .in('business_review_id', ids),
          adminClient
            .from('business_review_system_ratings')
            .select('business_review_id, system_id, reviewed_at')
            .in('business_review_id', ids)
            .not('reviewed_at', 'is', null),
        ]);

        if (priorityResult.error) {
          throw new SystemScorecardLibraryError(`Failed to inspect priorities: ${priorityResult.error.message}`, 500);
        }
        if (ratingResult.error) {
          throw new SystemScorecardLibraryError(`Failed to inspect reviewed systems: ${ratingResult.error.message}`, 500);
        }
        return {
          priorities: (priorityResult.data ?? []) as PriorityVersionRow[],
          ratings: (ratingResult.data ?? []) as RatingVersionRow[],
        };
      }),
    );
    priorities = inspectionPages.flatMap((page) => page.priorities);
    reviewedRatings = inspectionPages.flatMap((page) => page.ratings);
  }

  const profileIds = Array.from(new Set(eligibleReviews.map((review) => review.user_id)));
  let profiles: ProfileRow[] = [];
  if (profileIds.length > 0) {
    const profilePages = await Promise.all(
      chunkValues(profileIds).map(async (ids) => {
        const { data, error } = await adminClient
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', ids);
        if (error) {
          throw new SystemScorecardLibraryError(`Failed to load affected members: ${error.message}`, 500);
        }
        return (data ?? []) as ProfileRow[];
      }),
    );
    profiles = profilePages.flat();
  }

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const systemById = new Map(systems.map((system) => [Number(system.id), system]));
  const conflicts: ScorecardVersionReviewConflict[] = [];

  eligibleReviews.forEach((review) => {
    const reviewPriorities = priorities.filter(
      (priority) => Number(priority.business_review_id) === Number(review.id),
    );
    const removedPriorities = reviewPriorities.flatMap((priority) => {
      const system = systemById.get(Number(priority.system_id));
      if (!system || targetKeys.has(system.key)) return [];
      return [{
        systemKey: system.key,
        systemLabel: system.label,
        actionStepId: Number(priority.action_step_id),
      }];
    });
    const retainedPriorityKeys = reviewPriorities.flatMap((priority) => {
      const system = systemById.get(Number(priority.system_id));
      return system && targetKeys.has(system.key) ? [system.key] : [];
    });
    const removedReviewedSystems = reviewedRatings
      .filter((rating) => Number(rating.business_review_id) === Number(review.id))
      .flatMap((rating) => {
        const system = systemById.get(Number(rating.system_id));
        if (!system || targetKeys.has(system.key)) return [];
        return [{
          systemKey: system.key,
          systemLabel: system.label,
          reviewedAt: rating.reviewed_at,
        }];
      });

    if (removedPriorities.length === 0 && removedReviewedSystems.length === 0) return;
    const profile = profileById.get(review.user_id);
    const memberName = [profile?.first_name, profile?.last_name]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ') || 'Unnamed member';
    const fromTemplate = review.system_scorecard_template_key
      ? templateByKey.get(review.system_scorecard_template_key)
      : null;

    conflicts.push({
      reviewId: Number(review.id),
      userId: review.user_id,
      memberName,
      reviewDate: review.review_date,
      fromTemplateKey: review.system_scorecard_template_key ?? '',
      fromVersion: Number(fromTemplate?.version ?? 0),
      retainedPriorityKeys,
      priorities: removedPriorities,
      reviewedSystems: removedReviewedSystems,
    });
  });

  const comparisonTemplate = sameAudienceTemplates
    .filter((template) => template.key !== target.key)
    .sort(
      (left, right) =>
        Number(right.is_active) - Number(left.is_active) || right.version - left.version,
    )[0];
  const comparisonSystems = comparisonTemplate
    ? systems.filter((system) => system.template_key === comparisonTemplate.key)
    : [];
  const comparisonKeys = new Set(comparisonSystems.map((system) => system.key));

  return {
    templateKey: target.key,
    audience: target.audience,
    version: Number(target.version),
    isActive: Boolean(target.is_active),
    eligibleReviewCount: eligibleReviews.length,
    automaticReviewCount: eligibleReviews.length - conflicts.length,
    conflictReviewCount: conflicts.length,
    addedSystems: targetSystems.filter((system) => !comparisonKeys.has(system.key)),
    removedSystems: comparisonSystems
      .filter((system) => !targetKeys.has(system.key))
      .map((system) => ({ key: system.key, label: system.label })),
    targetSystems,
    conflicts,
  };
}

export async function publishSystemScorecardVersion(
  templateKey: string,
  resolutions: ScorecardVersionReviewResolution[],
  actorId: string,
): Promise<ScorecardVersionPublishResult> {
  const preview = await previewSystemScorecardPublish(templateKey);
  const resolutionByReviewId = new Map(
    resolutions.map((resolution) => [resolution.reviewId, resolution]),
  );
  const targetKeys = new Set(preview.targetSystems.map((system) => system.key));

  preview.conflicts.forEach((conflict) => {
    const resolution = resolutionByReviewId.get(conflict.reviewId);
    if (!resolution) {
      throw new SystemScorecardLibraryError(
        'Resolve every affected Business Review before continuing.',
        409,
        preview,
      );
    }
    if (resolution.action === 'skip') return;

    if (conflict.reviewedSystems.length > 0 && !resolution.confirmReviewedRemoval) {
      throw new SystemScorecardLibraryError(
        `Confirm the reviewed systems being removed from ${conflict.memberName}’s review.`,
        409,
        preview,
      );
    }

    const mappedKeys = new Set(conflict.retainedPriorityKeys);
    conflict.priorities.forEach((priority) => {
      if (!Object.prototype.hasOwnProperty.call(resolution.priorityReplacements, priority.systemKey)) {
        throw new SystemScorecardLibraryError(
          `Choose what happens to ${conflict.memberName}’s “${priority.systemLabel}” priority.`,
          409,
          preview,
        );
      }
      const replacementKey = resolution.priorityReplacements[priority.systemKey];
      if (replacementKey == null) return;
      if (!targetKeys.has(replacementKey)) {
        throw new SystemScorecardLibraryError('A selected replacement is not in the new scorecard.', 409, preview);
      }
      if (mappedKeys.has(replacementKey)) {
        throw new SystemScorecardLibraryError(
          `${conflict.memberName} would have the same priority more than once.`,
          409,
          preview,
        );
      }
      mappedKeys.add(replacementKey);
    });
  });

  const { data, error } = await adminClient.rpc('admin_publish_system_scorecard_version', {
    _template_key: templateKey,
    _actor_id: actorId,
    _resolutions: resolutions,
  });

  if (error) throwRpcError(error, 'Failed to publish the scorecard version.');
  if (!data || typeof data !== 'object') {
    throw new SystemScorecardLibraryError('The publish result was not returned.', 500);
  }

  const result = data as Record<string, unknown>;
  return {
    templateKey: String(result.templateKey ?? templateKey),
    published: Boolean(result.published),
    eligibleReviewCount: Number(result.eligibleReviewCount ?? 0),
    migratedReviewCount: Number(result.migratedReviewCount ?? 0),
    skippedReviewCount: Number(result.skippedReviewCount ?? 0),
  };
}
