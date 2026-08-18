/**
 * Whether the member holds the legend role, as a review switch.
 *
 * `legend` is a real role in this application — it already gates course
 * audiences (`'public' | 'legend' | 'specific_users'`) and profiles carry
 * `is_legend` — so the two states below stand in for something that exists,
 * not for a hypothetical. Reading it from the URL keeps the design review
 * self-serve: nothing here touches auth, and wiring it to the real role is a
 * one-line change at the page.
 *
 * Same server/client split as `parseAccent`: a plain module, so a server
 * component can resolve it from search params before anything reaches the
 * browser.
 *
 *   standard   the gated row is shown locked
 *   legend     the gated row is open
 */
export type LegendAccess = 'standard' | 'legend';

/** Most members are not legends, so that is what an unqualified URL shows. */
export const DEFAULT_LEGEND_ACCESS: LegendAccess = 'standard';

export function parseLegend(value: string | undefined): LegendAccess {
  return value === 'legend' || value === 'standard' ? value : DEFAULT_LEGEND_ACCESS;
}
