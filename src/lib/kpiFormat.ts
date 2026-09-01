/**
 * The rules every surface that edits the monthly KPI record has to agree on.
 *
 * There are now two of them — the full tracker page and the 90-day home card —
 * and they write to the same `upsert_monthly_kpi_record` row. Which fields are
 * money, which may go negative, and how a typed string becomes a number are
 * not presentation choices: get one of them wrong on one surface and a member
 * can enter a figure in one place that reads differently in the other, or save
 * a negative where the column expects none.
 *
 * So they live here rather than being copied. `KpiTracker` imports these; it
 * defined them first, and the definitions are unchanged.
 */

/** Only these two are currency. Everything else is a whole count. */
export function isMoneyMetric(key: string): boolean {
  return key === 'gross_revenue' || key === 'profit';
}

/** Profit is the only figure a member can legitimately report below zero. */
export function allowsNegativeValue(key: string): boolean {
  return key === 'profit';
}

export const moneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

/** The `period_start_date` the RPCs key on: the first of the month. */
export function getPeriodStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/**
 * What a member is allowed to type into a given field.
 *
 * Returns null for input that should be rejected outright — the caller keeps
 * the previous value rather than showing something unenterable. An empty
 * string is allowed through, because clearing a field is how a member unsets a
 * figure they entered by mistake.
 */
export function acceptKpiInput(key: string, raw: string): string | null {
  if (raw === '') return '';

  const cleaned = raw.replace(/,/g, '');
  const pattern = isMoneyMetric(key)
    ? allowsNegativeValue(key)
      ? /^-?\d*\.?\d*$/
      : /^\d*\.?\d*$/
    : /^\d*$/;

  return pattern.test(cleaned) ? cleaned : null;
}

/**
 * A typed string as it should be stored, or null.
 *
 * Null covers three different situations deliberately — empty, unparseable,
 * and out of range — because all three mean the same thing to the record: this
 * member has not given a usable figure for this metric.
 */
export function parseKpiValue(key: string, raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null;

  const num = Number(raw.replace(/,/g, '').trim());
  if (!Number.isFinite(num)) return null;
  if (num < 0 && !allowsNegativeValue(key)) return null;

  return num;
}

/** A stored number as it should appear in an input. */
export function formatKpiValue(key: string, value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return isMoneyMetric(key) ? moneyFormatter.format(value) : numberFormatter.format(value);
}
