/**
 * Discovery job types.
 *
 * `resources` and `content_nodes` have independent id sequences, so the same integer names two
 * different items — 35 rows in the current catalogue collide. A discovery item is therefore
 * ALWAYS identified by kind and id together, in React keys, selection sets, request payloads,
 * undo before-images and cached state alike. `refKey` exists so a bare id can never be used by
 * accident: anything that needs a string key goes through it.
 */
export type DiscoveryItemKind = 'resource' | 'node';

export type DiscoveryItemRef = {
  kind: DiscoveryItemKind;
  id: number;
};

export type DiscoveryQuestion = 'topics' | 'placement' | 'visibility';

/** The stable string form of a composite identity. Never `String(id)`. */
export function refKey(ref: DiscoveryItemRef): string {
  return `${ref.kind}:${ref.id}`;
}

export function sameRef(left: DiscoveryItemRef, right: DiscoveryItemRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

export function parseRefKey(key: string): DiscoveryItemRef {
  const [kind, raw] = key.split(':');
  const id = Number(raw);
  if ((kind !== 'resource' && kind !== 'node') || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`Not a discovery item reference: ${key}`);
  }
  return { kind, id };
}

/** Both answers to a question. Neither is "unfinished"; skip is not among them. */
export const DISCOVERY_ANSWERS: Record<DiscoveryQuestion, [string, string]> = {
  topics: ['assigned', 'none_needed'],
  placement: ['direct', 'context'],
  visibility: ['allowed', 'excluded'],
};

export const DISCOVERY_ANSWER_LABELS: Record<string, string> = {
  assigned: 'Topics saved',
  none_needed: 'No topic needed',
  direct: 'Suitable independently',
  context: 'Keep within its guide',
  allowed: 'Allow in search',
  excluded: 'Keep out of search',
};

export type DiscoveryTopicRef = { id: number; name: string; category: string | null };

export type DiscoveryPlacementRef = {
  nodeId: number;
  nodeTitle: string;
  nodeType: string;
  nodeState: string;
  position: number;
};

export type DiscoveryQueueItem = {
  kind: DiscoveryItemKind;
  id: number;
  title: string;
  description: string;
  media_type: string;
  state: string;
  is_discoverable: boolean;
  is_browsable: boolean;
  discovery_open_mode: string;
  duration: number | null;
  has_thumbnail: boolean;
  embedded: boolean;
  /** Null until someone has answered this question for this item. */
  answer: string | null;
  /** Opaque concurrency token; send back exactly what was loaded. */
  token: string | null;
  decided_at: string | null;
  decided_label: string | null;
  /** Server-computed. The client never determines staleness. */
  stale: boolean;
  needs: boolean;
  decided: boolean;
  topics: DiscoveryTopicRef[];
  placements: DiscoveryPlacementRef[];
};

export type DiscoveryQueueProgress = {
  decided: number;
  population: number;
  needs: number;
  reopened: number;
};

export type DiscoveryQueueResponse = {
  items: DiscoveryQueueItem[];
  total: number;
  progress: DiscoveryQueueProgress;
  formats: Record<string, number>;
};

export type DiscoveryRepresentative = {
  kind: DiscoveryItemKind;
  id: number;
  title: string;
  media_type: string;
  guide: string | null;
  topics: { id: number; name: string }[];
};

/**
 * A before-image. Undo restores the exact prior state, not merely the absence of a decision:
 * if topics were [hiring, interviewing] and were replaced, undo restores those two.
 */
export type DiscoveryBeforeImage = {
  kind: DiscoveryItemKind;
  id: number;
  question: DiscoveryQuestion;
  /** The answer that was recorded before, or null if there was none. */
  answer: string | null;
  /** The exact topic set to restore (topics question only). */
  tagIds: number[] | null;
  /** The token the client last saw. A mismatch means someone else moved it; that entry is skipped. */
  token: string | null;
};

/** One undo entry. A bulk write is ONE entry covering every item it touched. */
export type DiscoveryUndoEntry = {
  label: string;
  itemLabel: string;
  entries: DiscoveryBeforeImage[];
};

/**
 * Why a resource cannot go on the homepage, and where to sort it out. The wording is deliberately
 * neutral: a resource kept within its guide is a finished, valid decision, not unfinished work, so
 * it offers "View" rather than a nudge to overturn it.
 */
export const DISCOVERY_BROWSE_BLOCKERS: Record<string, { label: string; action: string; tone: 'warn' | 'info' }> = {
  context_not_reviewed: { label: 'Not yet checked for standalone use', action: 'Check it now', tone: 'warn' },
  kept_within_guide: { label: 'Kept with its lesson', action: 'See why', tone: 'info' },
  unpublished: { label: 'Not published', action: 'Open in Resource Library', tone: 'warn' },
  hidden: { label: 'Hidden from search', action: 'Review hidden content', tone: 'warn' },
};

export const DISCOVERY_FORMAT_LABELS: Record<string, string> = {
  course: 'Course', lesson: 'Lesson', document: 'Document', image: 'Image',
  link: 'Link', pdf: 'PDF', podcast: 'Podcast', video: 'Video',
};

export function formatLabel(value: string): string {
  return DISCOVERY_FORMAT_LABELS[value] ?? value;
}

/**
 * In the content model, `lesson` is also used for course internals. A node can only reach the
 * discovery jobs when it is a direct child of the Library collection, so name that product object
 * for the administrator instead of leaking the overloaded database type.
 */
export function discoveryJobFormatLabel(item: { kind: DiscoveryItemKind; media_type: string }): string {
  if (item.kind === 'node' && item.media_type === 'lesson') return 'Library guide';
  return formatLabel(item.media_type);
}

/**
 * Real titles run past 140 characters and end in a bracketed marker — "[Coaching Replay with
 * Gerry]", "[Intensive Replay]". Splitting the marker off lets a row dim it so the subject reads
 * first; without that, a list of 121 podcasts is unscannable.
 */
export function splitTitleMarker(title: string): { subject: string; marker: string } {
  const match = /^(.*?)(\s*\[[^\]]*\])\s*$/.exec(title);
  return match ? { subject: match[1], marker: match[2] } : { subject: title, marker: '' };
}

export function durationLabel(seconds: number | null): string | null {
  if (!seconds) return null;
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes} min`;
}
