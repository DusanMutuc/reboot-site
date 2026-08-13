export type ScorecardLibraryAudience = 'foundation' | 'legends';
export type ScorecardLibrarySource = 'main' | 'legend';
export type ScorecardTemplateState = 'active' | 'draft' | 'archived';

export type ScorecardLibraryOption = {
  id: number;
  title: string;
  description: string | null;
  slug: string | null;
  nodeType: string;
  state: string | null;
  source: ScorecardLibrarySource;
  breadcrumb: string;
};

export type ScorecardLibrarySystem = {
  id: number;
  key: string;
  label: string;
  position: number;
  libraryItemId: number | null;
  mappedItem: ScorecardLibraryOption | null;
};

export type ScorecardLibraryCategory = {
  id: number;
  key: string;
  label: string;
  position: number;
  systems: ScorecardLibrarySystem[];
};

export type ScorecardLibraryTemplate = {
  key: string;
  audience: ScorecardLibraryAudience;
  name: string;
  version: number;
  isActive: boolean;
  state: ScorecardTemplateState;
  reviewCount: number;
  draftReviewCount: number;
  upgradeCandidateCount: number;
  categories: ScorecardLibraryCategory[];
};

export type ScorecardLibraryAdminPayload = {
  templates: ScorecardLibraryTemplate[];
  libraryOptions: ScorecardLibraryOption[];
};

export type ScorecardLibraryMappingUpdate = {
  systemId: number;
  libraryItemId: number | null;
  mappedItem: ScorecardLibraryOption | null;
};

export type ScorecardDraftSystemInput = {
  key: string;
  label: string;
  libraryItemId: number | null;
};

export type ScorecardDraftCategoryInput = {
  key: string;
  label: string;
  systems: ScorecardDraftSystemInput[];
};

export type ScorecardVersionTargetSystem = {
  key: string;
  label: string;
  categoryLabel: string;
  libraryItemId: number | null;
};

export type ScorecardVersionPriorityConflict = {
  systemKey: string;
  systemLabel: string;
  actionStepId: number;
};

export type ScorecardVersionReviewedConflict = {
  systemKey: string;
  systemLabel: string;
  reviewedAt: string;
};

export type ScorecardVersionReviewConflict = {
  reviewId: number;
  userId: string;
  memberName: string;
  reviewDate: string;
  fromTemplateKey: string;
  fromVersion: number;
  retainedPriorityKeys: string[];
  priorities: ScorecardVersionPriorityConflict[];
  reviewedSystems: ScorecardVersionReviewedConflict[];
};

export type ScorecardVersionPublishPreview = {
  templateKey: string;
  audience: ScorecardLibraryAudience;
  version: number;
  isActive: boolean;
  eligibleReviewCount: number;
  automaticReviewCount: number;
  conflictReviewCount: number;
  addedSystems: ScorecardVersionTargetSystem[];
  removedSystems: Array<{ key: string; label: string }>;
  targetSystems: ScorecardVersionTargetSystem[];
  conflicts: ScorecardVersionReviewConflict[];
};

export type ScorecardVersionReviewResolution = {
  reviewId: number;
  action: 'upgrade' | 'skip';
  priorityReplacements: Record<string, string | null>;
  confirmReviewedRemoval: boolean;
};

export type ScorecardVersionPublishResult = {
  templateKey: string;
  published: boolean;
  eligibleReviewCount: number;
  migratedReviewCount: number;
  skippedReviewCount: number;
};
