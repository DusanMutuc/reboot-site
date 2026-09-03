/**
 * The words shown in the discovery help drawer.
 *
 * Content only — no layout, no JSX. DiscoveryHelpDrawer knows how to render a card; this file
 * knows what the cards say. Keeping them apart means the wording can be corrected without
 * touching a component, which is the part that will actually happen once tagging is under way.
 *
 * This mirrors docs/discovery-admin-quickref.html. That card stays hand-authored, so a change
 * here is not automatically a change there — when a rule changes, edit both. The full reasoning
 * behind every rule lives in docs/discovery-admin-guide-v2.md and is deliberately not repeated
 * here: a drawer opened mid-task is the wrong place to argue a case.
 */

/** The admin screens, keyed the same way DiscoveryAdminPanel routes them. */
export type DiscoveryHelpView =
  | 'topics' | 'placement' | 'visibility' | 'browse' | 'find' | 'search' | 'vocabulary';

/**
 * A worked example. `from` is the thing you type or the item you are looking at and renders
 * monospaced; with no `from` the example is a single piece of prose, as on Description.
 */
export type HelpExample = { from?: string; to: string };

export type HelpCard = {
  /** The field this card is about, as the admin screen labels it. */
  name: string;
  /** The quantity rule, where there is one worth stating up front. */
  qty?: string;
  /** What to do. `**bold**` is honoured; nothing else is. */
  rules: string[];
  /** Questions to ask before acting, shown as the card's prompts. */
  asks?: string[];
  good: HelpExample[];
  /** The trap. One sentence where possible. */
  watch: string;
};

const TOPIC: HelpCard = {
  name: 'Topic',
  qty: '2–4 per item',
  rules: [
    'Tag what it is **about**, not what it mentions.',
    'Reuse an existing topic before making a new one.',
  ],
  asks: [
    'Before using: would a member want a shelf of everything we have about this?',
    'Before creating: will I use this on five or more things?',
  ],
  good: [
    { from: 'Energy Leaks', to: 'time management · delegation · mindset' },
    { from: 'Ep 95 - Price Drop Workshop', to: 'price reductions · listing presentation' },
  ],
  watch: 'A word can be in the title and still be a bad topic. **Order Your Stanchions** is not about stanchions.',
};

const SYNONYM: HelpCard = {
  name: 'Synonym',
  qty: 'applies catalogue-wide',
  rules: [
    '**Add** for misspellings members keep making, and for abbreviations.',
    '**Skip** plurals and word forms — search already handles those.',
    'Use it when the word suits everything under that topic.',
  ],
  good: [
    { from: 'refferal', to: 'referral' },
    { from: 'p&l, pnl', to: 'profit and loss' },
    { from: 'listing appointment', to: 'listing presentation' },
  ],
  watch: 'You create these by merging, and merging is **one-way**. There is no undo.',
};

const ALTERNATE_NAME: HelpCard = {
  name: 'Alternate name',
  qty: 'one item only',
  rules: [
    "Add the name people actually say that isn't in the title.",
    'Add the old name whenever you rename something.',
    'Worth doing on anything members ask for by nickname.',
  ],
  good: [
    { from: '"the TIM letter"', to: 'Ep 52 - Ben explains the TIM letter' },
    { from: '"red carpet script"', to: 'a formally-titled script' },
  ],
  watch: "If the name would suit five resources, it's a topic — not an alternate name.",
};

const CATEGORY: HelpCard = {
  name: 'Category',
  qty: 'exactly 1 per topic',
  rules: [
    'The category goes on the **topic**, never on the resource.',
    'Set it the moment you create the topic.',
    'Four, fixed: Marketing & sales · Systems & operations · Hiring & team · Mindset & leadership.',
  ],
  good: [
    { from: 'client events', to: 'Marketing & sales' },
    { from: 'client onboarding', to: 'Systems & operations' },
  ],
  watch: 'A topic that needs two categories is two topics. Use the No category filter to catch misses.',
};

const SWITCHES: HelpCard = {
  name: 'The switches',
  qty: '4 questions',
  rules: [
    '**Published** — it is finished. Nothing else works without it.',
    '**In search** — members may find it by searching.',
    '**On the homepage** — you would offer it to someone who is not looking. Gates browse and **algorithmic** recommendations.',
    '**Standalone use** — it makes sense outside its lesson.',
  ],
  good: [
    { to: 'A worksheet kept with its lesson still earns its topics — that is how the lesson becomes findable by the words on the worksheet.' },
  ],
  watch: 'Coach-selected suggestions are the exception: a published, safely openable coach pick may appear even without homepage approval.',
};

const DESCRIPTION: HelpCard = {
  name: 'Description',
  rules: [
    'Write it for the person deciding whether to open the thing.',
    "Say what they'll get and who it's for.",
    "Don't write it for search — it barely moves ranking.",
  ],
  good: [
    { to: '"A one-page script for the first ninety seconds of a listing appointment. Use it before your first walk-through."' },
  ],
  watch: "Don't rewrite titles to game search. An accurate title, alternate names and topics do the job together.",
};

/**
 * Which cards each screen opens to.
 *
 * A screen gets every card it can prompt a question about, not just the one it is named after:
 * Assign topics needs Category because creating a topic is where the category decision lands,
 * and Homepage browse needs it because the four chips are fed by topic categories rather than
 * by anything on this screen.
 */
export const DISCOVERY_HELP: Record<DiscoveryHelpView, HelpCard[]> = {
  topics: [TOPIC, CATEGORY],
  placement: [SWITCHES],
  visibility: [SWITCHES],
  browse: [SWITCHES, CATEGORY],
  vocabulary: [TOPIC, SYNONYM, CATEGORY],
  find: [SWITCHES, ALTERNATE_NAME],
  search: [ALTERNATE_NAME, SYNONYM, DESCRIPTION],
};

/** The guide is served through an authenticated admin API, never from public assets. */
export const DISCOVERY_GUIDE_HREF: string | null = '/api/admin/discovery/guide';
