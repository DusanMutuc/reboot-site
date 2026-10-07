export type ImplementationGuideAudience = 'foundation' | 'legends';

export type ImplementationGuideResource = {
  resourceId: number;
  pageStart: number | null;
  pageEnd: number | null;
};

export type ImplementationGuideStep = {
  id: string;
  title: string;
  description: string;
  resources: ImplementationGuideResource[];
};

export type ImplementationGuide = {
  id: string;
  revision: number;
  updatedAt: string;
  steps: ImplementationGuideStep[];
};

export type ImplementationGuideSystem = {
  id: number;
  key: string;
  label: string;
  audience: ImplementationGuideAudience;
  categoryId: number;
  categoryLabel: string;
  categoryPosition: number;
  position: number;
  guide: ImplementationGuide | null;
};

export type ImplementationGuidesAdminResponse = {
  systems: ImplementationGuideSystem[];
  resources: { id: number; title: string; type: string; state: string }[];
};
