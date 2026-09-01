'use client';

import { createContext, useContext } from 'react';
import type { Accent } from './accentOption';

/**
 * Carries the colour treatment down to the handful of components that honour
 * it, so the two versions can be put side by side rather than argued about.
 *
 * Deliberately not a second theme: swapping a palette would repaint every
 * component, and the whole claim being tested is that only a named few
 * non-data surfaces need to change. Components read the flag and opt in one at
 * a time, which also means the diff shows exactly where red was let in.
 *
 * To ship one and drop the other, change `DEFAULT_ACCENT` in `accentOption`
 * and delete the branches for the version that lost.
 */
export type { Accent };

/**
 * The context falls back to `none`, which is not the same as `DEFAULT_ACCENT`
 * and the difference matters: `StickyBar` and `HubFooter` are shared with the
 * three earlier layout variants, and those are kept as a record of what was
 * already reviewed. Anything that has not explicitly opted in stays exactly as
 * it was.
 */
const AccentContext = createContext<Accent>('none');

export function AccentProvider({
  accent,
  children,
}: {
  accent: Accent;
  children: React.ReactNode;
}) {
  return <AccentContext.Provider value={accent}>{children}</AccentContext.Provider>;
}

export function useAccent(): Accent {
  return useContext(AccentContext);
}

/** Reads as `isBrand ? red : whatever it was` at every call site. */
export function useIsBrandAccent(): boolean {
  return useContext(AccentContext) === 'brand';
}
