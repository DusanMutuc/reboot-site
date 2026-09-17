import type { DiscoveryItemKind, DiscoveryQuestion } from './discoveryJobTypes';

export type FindContentPlacement = {
  blockId: number;
  nodeId: number;
  nodeTitle: string;
  nodeType: string;
  position: number;
  editor: 'library' | 'course';
  rootId: number | null;
};

export type FindContentResult = {
  kind: DiscoveryItemKind;
  id: number;
  title: string;
  description: string;
  mediaType: string;
  state: string;
  searchNames: string[];
  embedded: boolean;
  placementTitles: string[];
  inDiscoveryScope: boolean;
  ineligibleReason: string | null;
  exactIdMatch: boolean;
};

export type FindContentDecision = {
  question: DiscoveryQuestion;
  answer: string;
  decided: boolean;
  decidedAt: string | null;
  decidedLabel: string | null;
  token: string | null;
  stale: boolean;
};

export type FindContentDetail = FindContentResult & {
  topics: Array<{ id: number; name: string; category: string | null }>;
  decisions: FindContentDecision[];
  placements: FindContentPlacement[];
  isBrowsable: boolean;
  isDiscoverable: boolean;
  categories: string[];
  publishedHref: string;
};

export type SearchDiagnosticResult = {
  kind: DiscoveryItemKind;
  id: number;
  title: string;
  mediaType: string;
  position: number;
  accessVaries: boolean;
  openPath: string | null;
};

export type SearchInvestigationJourney = {
  logicalSearchId: string;
  journeyId: string;
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  query: string;
  normalizedQuery: string;
  createdAt: string;
  lastSeenAt: string;
  searchVersion: string | null;
  currentVersion: boolean;
  section: 'empty' | 'rephrased' | 'no_open';
  chain: Array<{ query: string; at: string }>;
  delivered: Array<{ key: string; title: string; position: number }>;
  opens: Array<{ key: string; at: string }>;
};

export type SearchInvestigationGroup = {
  query: string;
  section: SearchInvestigationJourney['section'];
  distinctMembers: number;
  timesSeen: number;
  lastSeenAt: string;
  journeys: SearchInvestigationJourney[];
};

export type CoachResourceOption = {
  id: number;
  title: string;
  mediaType: string;
  description: string;
  eligible: boolean;
  reason: string | null;
};

export type CoachResourceSuggestion = {
  id: string;
  resourceId: number;
  title: string;
  mediaType: string;
  createdAt: string;
  coachName: string;
  active: boolean;
  resolution: 'finished' | 'not_interested' | 'removed' | null;
};
