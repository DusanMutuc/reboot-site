import type { ContentCategory, ContentItem } from './types';

/**
 * Flat catalogue for the browse grid.
 *
 * Real items resolve through `search_resources`, which already accepts
 * `_tag_ids` and `_types`; the four categories map to tags. Multiple
 * categories per item is deliberate — it is what lets the same catalogue be
 * reached several ways.
 */

let cursor = 0;

function entry(
  title: string,
  typeLabel: string,
  metaLabel: string,
  categories: ContentCategory[],
  progressPct: number | null = null,
): ContentItem {
  cursor += 1;
  return {
    id: `c${cursor}`,
    title,
    typeLabel,
    metaLabel,
    href: '#',
    thumbIndex: cursor,
    categories,
    progressPct,
  };
}

export const placeholderContent: ContentItem[] = [
  entry('Turning a cold database into listing appointments', 'Video', '31 min', ['marketing']),
  entry('The three-line follow-up text that gets replies', 'Playbook', '6 min', ['marketing', 'systems']),
  entry('Lead follow-up system', 'Training', '6 parts', ['marketing', 'systems'], 62),
  entry('Listing presentation — the full script', 'Script', '22 min', ['marketing']),
  entry('Handling "we already have an agent"', 'Script', '9 min', ['marketing', 'mindset']),
  entry('Pricing conversations that hold', 'Training', '4 parts', ['marketing', 'mindset'], 25),
  entry('Where your last ten deals actually came from', 'Playbook', '17 min', ['marketing', 'systems']),
  entry('Asking for the referral without being weird', 'Replay', '11 min', ['marketing', 'mindset']),

  entry('Setting up your 15/30 list in one sitting', 'Playbook', '14 min', ['systems'], 40),
  entry('Weekly numbers review, in ten minutes', 'Playbook', '10 min', ['systems']),
  entry('Transaction paperwork handover', 'Playbook', '19 min', ['systems', 'hiring']),
  entry('Database reactivation campaign', 'Training', '5 parts', ['systems', 'marketing']),
  entry('Your listing launch checklist', 'Playbook', '12 min', ['systems']),
  entry('Cleaning your database in fifteen minutes', 'Playbook', '15 min', ['systems']),

  entry('Hiring your first assistant', 'Video', '34 min', ['hiring']),
  entry('What to delegate first, and what never to', 'Playbook', '13 min', ['hiring', 'systems']),
  entry('Assistant onboarding checklist', 'Playbook', '11 min', ['hiring']),
  entry('Getting out of the paperwork', 'Training', '4 parts', ['hiring', 'systems']),
  entry('Running a useful weekly team meeting', 'Replay', '16 min', ['hiring', 'mindset']),

  entry('Rebuilding momentum after a slow month', 'Video', '27 min', ['mindset']),
  entry('Saying no to the wrong listing', 'Replay', '15 min', ['mindset']),
  entry('Taking time off without the business stalling', 'Video', '11 min', ['mindset', 'systems']),
  entry('Your week, blocked properly', 'Replay', '21 min', ['mindset', 'systems']),
  entry('The stories agents tell themselves about prospecting', 'Video', '18 min', ['mindset']),
];

/**
 * What the relatedness algorithm returns for a member on the three placeholder
 * priorities, ranked.
 *
 * Deliberately drawn out of `placeholderContent` rather than written as its own
 * list: a recommendation is a *selection* of the catalogue, and modelling it as
 * separate items would let the preview claim material the library does not
 * actually hold.
 *
 * Long enough to fill the grid the other chips fill. Relatedness is a ranking,
 * not a set, so the last couple being a looser match costs nothing — whereas a
 * short "For you" view reads as a different kind of object from every other
 * view, which is the thing the merge was meant to stop.
 */
const RECOMMENDED_TITLES = [
  'Setting up your 15/30 list in one sitting',
  'Where your last ten deals actually came from',
  'Weekly numbers review, in ten minutes',
  'Cleaning your database in fifteen minutes',
  'Taking time off without the business stalling',
  'Your week, blocked properly',
  'The three-line follow-up text that gets replies',
  'Rebuilding momentum after a slow month',
];

export const placeholderRecommended: ContentItem[] = RECOMMENDED_TITLES.map((title) => {
  const match = placeholderContent.find((item) => item.title === title);
  if (!match) throw new Error(`Recommended title not in the catalogue: ${title}`);
  return match;
});
