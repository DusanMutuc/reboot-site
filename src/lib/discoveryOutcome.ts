import type { DiscoveryVisibility } from './discoveryVisibility';

export type DiscoveryOutcomeInput = {
  visibility: DiscoveryVisibility;
  openMode: string;
  embedded: boolean;
  kind?: 'resource' | 'guide';
  mediaType?: string;
  state?: string;
  hasCategory?: boolean;
};

/** Eligibility guidance, not a simulation of every member's permissions or ranking. */
export function discoveryOutcome({ visibility, openMode, embedded, kind = 'resource', mediaType,
  state = 'published', hasCategory = false }: DiscoveryOutcomeInput): {
    tone: 'neutral' | 'good' | 'warning'; search: string; browse: string;
  } {
  if (visibility === 'hidden') return { tone: 'neutral',
    search: 'Hidden from search. Members may still open it through their existing learning access.',
    browse: 'Not offered in homepage browse.' };
  if (state !== 'published') return { tone: 'warning',
    search: `This item is ${state}. It cannot appear in search until it is published.`,
    browse: visibility === 'browse' ? 'Homepage approval is saved, but it cannot appear while unpublished.' : 'Not approved for homepage browse.' };
  if (kind === 'guide') return { tone: 'neutral',
    search: mediaType === 'course'
      ? 'Search can return this whole course to members with access. Opening the result opens the course.'
      : mediaType === 'lesson'
        ? 'Search can return this Library guide to members with access. Opening the result opens the guide.'
        : 'This structural node is not a separate search result.',
    browse: 'Guides and other learning nodes stay out of homepage browse. The structured library is unchanged.' };
  const contextual = embedded && openMode === 'context';
  const search = contextual
    ? 'A matching search can return an accessible, published guide containing this resource—not the resource on its own. Without an eligible guide, this match is left out.'
    : embedded
      ? 'Search can return this resource on its own, with a separate link to its accessible guide or course.'
      : 'Search can return this resource on its own.';
  if (visibility !== 'browse') return { tone: 'neutral', search, browse: 'Search only—not approved for homepage browse or For you.' };
  if (contextual) return { tone: 'warning', search,
    browse: 'Homepage approval is saved, but this resource stays out of browse while it needs its guide. Approve independent use only after checking the surrounding instructions.' };
  return { tone: 'good', search, browse: hasCategory
    ? 'Approved for homepage browse, including the categories shown above. Member access still applies.'
    : 'Approved for homepage browse in All. It needs a topic with a category to appear under one of the four category chips.' };
}
