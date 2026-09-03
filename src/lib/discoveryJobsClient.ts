import { readDiscoveryResponse } from './discoveryAdminClient';
import type {
  DiscoveryBeforeImage, DiscoveryItemRef, DiscoveryQuestion, DiscoveryQueueResponse,
  DiscoveryRepresentative,
} from './discoveryJobTypes';

const JOBS_URL = '/api/admin/discovery/jobs';

async function get<T>(params: Record<string, string | number | undefined>): Promise<T> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  let response;
  try { response = await fetch(`${JOBS_URL}?${search}`, { headers: { Accept: 'application/json' } }); }
  catch { throw new Error('The connection was interrupted. Reload this screen before making decisions.'); }
  return readDiscoveryResponse<T>(response);
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  let response;
  try {
    response = await fetch(JOBS_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch {
    throw new Error('The connection was interrupted. The decision could not be confirmed; reload before retrying.');
  }
  return readDiscoveryResponse<T>(response);
}

export type DiscoveryJobCounts = {
  topics: { needs: number; decided: number; population: number; resources: number; lessons: number; courses: number };
  topicsByFormat: Record<string, number>;
  placement: { needs: number; decided: number; population: number };
  placementByFormat: Record<string, number>;
  visibility: { needs: number; decided: number; population: number; lessons: number; resources: number };
  hiddenChaptersExcluded: number;
  browse: { approved: number; ready: number; blocked: number };
  categoryDiagnostic: { topicsTotal: number; topicsWithCategory: number; itemsWithoutCategory: number };
};

export const fetchJobCounts = () => get<DiscoveryJobCounts>({ view: 'counts' });

export const fetchQueue = (question: DiscoveryQuestion, options: { q?: string; format?: string; limit?: number } = {}) =>
  get<DiscoveryQueueResponse>({
    view: 'queue', question, q: options.q, format: options.format, limit: options.limit ?? 400,
  });

export type PlacementBlock = {
  blockId: number;
  position: number; type: string; text: string; label: string; isThis: boolean;
  resourceTitle: string | null; resourceType: string | null;
};
export type PlacementContext = {
  nodeId: number; nodeTitle: string; nodeType: string; nodeState: string; nodeDescription: string;
  position: number; blockCount: number; hasProse: boolean; blocks: PlacementBlock[];
};

export const fetchPlacementContext = (resourceId: number) =>
  get<{ placements: PlacementContext[] }>({ view: 'placement', id: resourceId });

export type PlacementResource = {
  id: number; blockId: number; position: number; title: string; mediaType: string; state: string;
  placementNodeId: number; placementNodeTitle: string;
  answer: string | null; token: string | null; stale: boolean; decided: boolean; needs: boolean;
  decidedLabel: string | null; decidedAt: string | null; placementCount: number;
};
export type PlacementGroup = {
  nodeId: number; nodeTitle: string; nodeType: string; nodeState: string;
  home: { editor: 'library' | 'course'; rootId: number | null };
  total: number; decided: number; needs: number; reopened: number;
  resources: PlacementResource[];
};
export type PlacementGroupsResponse = {
  groups: PlacementGroup[];
  progress: { decided: number; population: number; needs: number; reopened: number };
};
export const fetchPlacementGroups = () => get<PlacementGroupsResponse>({ view: 'placement-groups' });

export type ItemDecision = {
  kind: 'resource' | 'node'; id: number; question: string;
  answer: string | null; token: string | null; decidedAt: string | null; decidedLabel: string | null;
  stale: boolean;
  placements: { nodeId: number; nodeTitle: string; position: number }[];
};
export const fetchItemDecision = (kind: 'resource' | 'node', id: number, question: string) =>
  get<ItemDecision>({ view: 'item-decision', kind, id, question });

export const fetchRepresentatives = (q: string) =>
  get<{ items: DiscoveryRepresentative[] }>({ view: 'representatives', q });

export type BrowseItem = {
  kind: 'resource'; id: number; title: string; media_type: string; state: string;
  duration: number | null; has_thumbnail: boolean; embedded: boolean;
  blocker: string | null; categories: string[]; guide: string | null;
};
export type BrowseResponse = {
  items: BrowseItem[]; total: number; cantAppear: number; noCategory: number;
  coverage: Record<string, number>;
};
export const fetchBrowse = (q = '') => get<BrowseResponse>({ view: 'browse', q });

export type CandidateItem = {
  kind: 'resource'; id: number; title: string; media_type: string; state: string;
  duration: number | null; embedded: boolean; blocker: string | null; guide: string | null;
  createdAt: string | null;
};
export type CandidateSort = 'newest' | 'title';
export type CandidateResponse = {
  items: CandidateItem[]; total: number; readyTotal: number; blockedTotal: number;
  blockerCounts: Record<string, number>;
};
export const fetchCandidates = (section: 'ready' | 'blocked', q = '', sort: CandidateSort = 'newest') =>
  get<CandidateResponse>({ view: 'candidates', section, q, sort });

export type DecisionResult =
  | { ok: true; token: string; answer: string }
  | { ok: false; conflict: true; decidedBy: string | null; decidedAt: string | null; answer: string | null; removed?: boolean };

export const recordDecision = (input: {
  item: DiscoveryItemRef; question: DiscoveryQuestion; answer: string;
  tagIds?: number[] | null; token: string | null; force?: boolean;
}) => post<DecisionResult>({ operation: 'decide', ...input });

export type BulkResult = {
  ok: true;
  written: { kind: 'resource' | 'node'; id: number; token: string;
    previousAnswer: string | null; previousToken: string | null; previousTagIds: number[] }[];
  skipped: { kind: string; id: number; reason: string }[];
  topicCount: number;
};

export const bulkTopics = (input: {
  items: DiscoveryItemRef[]; tagIds: number[];
  tokens: { kind: string; id: number; token: string | null }[];
}) => post<BulkResult>({ operation: 'bulk_topics', ...input });

export type UndoResult = {
  ok: true;
  restored: { kind: string; id: number; question: string; token: string | null }[];
  skipped: { kind: string; id: number; question: string; reason: string }[];
};

export const undoDecisions = (entries: DiscoveryBeforeImage[]) =>
  post<UndoResult>({ operation: 'undo', entries });

export type BrowseWriteResult =
  | { ok: true; approved: boolean; title: string }
  | { ok: false; blocker: string; title: string };

export const setBrowseApproval = (item: DiscoveryItemRef, approved: boolean) =>
  post<BrowseWriteResult>({ operation: 'set_browse', item, approved });
