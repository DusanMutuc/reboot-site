/**
 * The colour-treatment option, kept in a plain module.
 *
 * Deliberately separate from `accent.tsx`: the context and hooks there need
 * `'use client'`, and a server component cannot call a function exported from a
 * client module — the page resolves this value from its search params before
 * any of it reaches the browser. Same division as `parseVolume` in
 * `onePagePlaceholderData` and `ContentSurface` in `homeTheme`.
 *
 *   none    turquoise and neutrals only — the surface as reviewed
 *   brand   the same surface with the logo's red added
 */
export type Accent = 'none' | 'brand';

/**
 * What a page gets when it opts into the toggle without naming a value. The
 * accented version is the proposal, so it is what an unqualified URL shows.
 */
export const DEFAULT_ACCENT: Accent = 'brand';

export function parseAccent(value: string | undefined): Accent {
  return value === 'none' || value === 'brand' ? value : DEFAULT_ACCENT;
}
