/** Discovery placement is independent of publication and member access. */
export type DiscoveryVisibility = 'hidden' | 'search_only' | 'browse';

export type DiscoveryVisibilityFlags = {
  is_discoverable: boolean;
  is_browsable: boolean;
};

export const DISCOVERY_VISIBILITY_LABELS: Record<DiscoveryVisibility, string> = {
  hidden: 'Hidden from discovery',
  search_only: 'Search only',
  browse: 'Search and homepage browse',
};

export function discoveryVisibility(
  flags: Partial<DiscoveryVisibilityFlags> | null | undefined,
): DiscoveryVisibility {
  if (!flags?.is_discoverable) return 'hidden';
  return flags.is_browsable ? 'browse' : 'search_only';
}

export function discoveryVisibilityFlags(value: DiscoveryVisibility): DiscoveryVisibilityFlags {
  return {
    is_discoverable: value !== 'hidden',
    is_browsable: value === 'browse',
  };
}
