import type { DiscoveryTag } from './discoveryAdminTypes';

/**
 * Spelling-variant detection for the closed vocabulary.
 *
 * This catches typos and formatting variants (`p&l` / `p and l` / `pnl`,
 * `refferal` / `referral`, `taging` / `tagging`). It deliberately does not attempt
 * semantic synonyms — `profit and loss` will not group with `p&l`, because deciding
 * those are the same subject is a curator's call, not a string comparison.
 *
 * Only tags that can legally merge are grouped: `admin_merge_discovery_tags` requires the
 * same kind and the same browse category, so grouping across either would offer a merge
 * the database will reject.
 */

const NOISE_TOKENS = new Set(['and', 'n', 'of', 'the', 'a', 'to', 'for']);

/** Lowercase, expand `&`, drop punctuation and filler words, then close up the spaces. */
export function normalizeTagName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^\s*pnl\s*$/, 'p and l')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token && !NOISE_TOKENS.has(token))
    .join('');
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

/** Two normalized names look like variants of one term. */
export function looksLikeVariant(left: string, right: string): boolean {
  if (!left || !right || left === right) return left === right && !!left;
  const shortest = Math.min(left.length, right.length);
  if (shortest < 3) return false;
  // A differing first letter is almost always a different word rather than a typo —
  // without this, `blow` and `flow` are one edit apart and get offered as duplicates.
  if (left[0] !== right[0]) return false;
  const tolerance = shortest >= 8 ? 2 : 1;
  // A shared prefix is not enough: price/price reduction and social/social tagging
  // are different scopes, not alternative spellings. Curators can still merge manually.
  return editDistance(left, right) <= tolerance;
}

export type DuplicateGroup = {
  key: string;
  signature: string;
  tags: DiscoveryTag[];
  /** Highest-usage member, offered as the default tag to keep. */
  suggestedKeepId: number;
};

function usageOf(tag: DiscoveryTag): number {
  return (tag.resource_count ?? 0) + (tag.node_count ?? 0);
}

export function findDuplicateGroups(tags: DiscoveryTag[]): DuplicateGroup[] {
  // Only mergeable rows: the merge RPC rejects aliases and browse categories.
  const candidates = tags.filter(
    (tag) => tag.tag_kind === 'topic' && tag.is_active !== false,
  ).sort((left, right) => left.id - right.id);
  const parent = new Map<number, number>();
  candidates.forEach((tag) => parent.set(tag.id, tag.id));

  const find = (id: number): number => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as number;
    let walk = id;
    while (parent.get(walk) !== root) {
      const next = parent.get(walk) as number;
      parent.set(walk, root);
      walk = next;
    }
    return root;
  };
  const union = (left: number, right: number) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(a, b);
  };

  const normalized = new Map<number, string>();
  candidates.forEach((tag) => normalized.set(tag.id, normalizeTagName(tag.name)));

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const left = candidates[i];
      const right = candidates[j];
      // A merge the database would refuse is not a suggestion worth showing.
      if (left.tag_kind !== right.tag_kind) continue;
      if ((left.browse_category ?? null) !== (right.browse_category ?? null)) continue;
      // All members must be mutually similar; a chain of near-matches must not
      // pull unrelated endpoints into the same bulk-merge suggestion.
      const leftGroup = candidates.filter(tag => find(tag.id) === find(left.id));
      const rightGroup = candidates.filter(tag => find(tag.id) === find(right.id));
      if (leftGroup.every(a => rightGroup.every(b => looksLikeVariant(normalized.get(a.id) ?? '', normalized.get(b.id) ?? '')))) {
        union(left.id, right.id);
      }
    }
  }

  const grouped = new Map<number, DiscoveryTag[]>();
  candidates.forEach((tag) => {
    const root = find(tag.id);
    grouped.set(root, [...(grouped.get(root) ?? []), tag]);
  });

  return [...grouped.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const ordered = [...group].sort(
        (left, right) => usageOf(right) - usageOf(left) || left.name.localeCompare(right.name),
      );
      return { key: [...ordered].map(tag => tag.id).sort((a, b) => a - b).join('-'),
        signature: JSON.stringify([...ordered].sort((a, b) => a.id - b.id).map(tag => [tag.id, tag.name, tag.browse_category ?? null])),
        tags: ordered, suggestedKeepId: ordered[0].id };
    })
    .sort((left, right) => right.tags.length - left.tags.length || left.tags[0].name.localeCompare(right.tags[0].name));
}
