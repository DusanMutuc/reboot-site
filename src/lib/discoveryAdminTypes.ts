export type DiscoveryTag = {
  id: number;
  name: string;
  tag_kind?: string;
  browse_category?: string | null;
  canonical_tag_id?: number | null;
  is_active?: boolean;
  resource_count?: number;
  node_count?: number;
  alias_count?: number;
};

export type DiscoveryAdminItem = {
  id: number;
  kind: 'resource' | 'guide';
  title: string;
  media_type: string;
  state: string;
  is_discoverable: boolean;
  is_browsable: boolean;
  discovery_open_mode: 'context' | 'direct';
  search_names: string[];
  tag_ids: number[];
  embedded: boolean;
  discovery_reviewed_at?: string | null;
  discovery_reviewed_by?: string | null;
  placements?: DiscoveryPlacement[];
  /** Containing node for an embedded resource. Null for guides and unplaced resources. */
  placement_title?: string | null;
  placement_type?: string | null;
  placement_count?: number;
};

export type DiscoveryPlacement = {
  node_id: number;
  node_title: string;
  node_type: string;
  node_state: string;
  block_position: number;
};

export type DiscoveryReviewStatus = 'pending' | 'context' | 'direct';

export const DISCOVERY_CATEGORY_LABELS: Record<string, string> = {
  marketing: 'Marketing & sales', systems: 'Systems & operations',
  hiring: 'Hiring & team', mindset: 'Mindset & leadership',
};

export const DISCOVERY_REVIEW_LABELS: Record<DiscoveryReviewStatus, string> = {
  pending: 'Needs review', context: 'Reviewed — keep within its guide', direct: 'Reviewed — suitable independently',
};

export function discoveryReviewStatus(item: DiscoveryAdminItem): DiscoveryReviewStatus {
  return item.discovery_reviewed_at ? item.discovery_open_mode : 'pending';
}

export function inheritedDiscoveryCategories(tags: DiscoveryTag[]): string[] {
  return [...new Set(tags.filter(tag => tag.tag_kind === 'topic' && tag.is_active !== false)
    .map(tag => tag.browse_category).filter((value): value is string => !!value))].sort();
}

export type DiscoveryProgress = {
  total: number;
  tagged: number;
  categorized: number;
  browseApproved: number;
  embedded: number;
  needsReview: number;
  hidden: number;
};

export function discoveryIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.length > 100 || value.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('Choose up to 100 valid item or tag IDs.');
  }
  return [...new Set(value as number[])];
}

export function discoveryNames(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 20 || value.some((name) =>
    typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 120)) {
    throw new Error('Use up to 20 nonempty alternate names, each at most 120 characters.');
  }
  const names = new Map<string, string>();
  value.forEach((name: string) => names.set(name.trim().toLowerCase(), name.trim()));
  return [...names.values()];
}

export function splitDiscoveryNames(value: string): string[] {
  return discoveryNames(value.split('\n').map((name) => name.trim()).filter(Boolean));
}
