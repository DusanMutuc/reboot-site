import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptKpiInput,
  allowsNegativeValue,
  formatKpiValue,
  getPeriodStart,
  isMoneyMetric,
  parseKpiValue,
} from '../src/lib/kpiFormat.ts';

/**
 * These rules are shared by the tracker page and the 90-day home card, which
 * write to the same monthly KPI record. A disagreement between the two is not
 * a cosmetic bug — it is a figure that reads differently depending on where a
 * member looks at it — so the rules are pinned here rather than trusted to
 * stay identical by inspection.
 */

test('only revenue and profit are money, and only profit may go negative', () => {
  assert.ok(isMoneyMetric('gross_revenue'));
  assert.ok(isMoneyMetric('profit'));
  assert.ok(!isMoneyMetric('closed_deals'));
  assert.ok(!isMoneyMetric('days_off'));

  assert.ok(allowsNegativeValue('profit'));
  assert.ok(!allowsNegativeValue('gross_revenue'));
  assert.ok(!allowsNegativeValue('closed_deals'));
});

test('counts accept whole numbers only', () => {
  assert.equal(acceptKpiInput('closed_deals', '12'), '12');
  assert.equal(acceptKpiInput('closed_deals', ''), '');
  // Rejected input returns null so the caller keeps the previous value.
  assert.equal(acceptKpiInput('closed_deals', '12.5'), null);
  assert.equal(acceptKpiInput('closed_deals', '-3'), null);
  assert.equal(acceptKpiInput('closed_deals', 'abc'), null);
});

test('money accepts decimals, and a minus sign only where profit allows it', () => {
  assert.equal(acceptKpiInput('gross_revenue', '38200.50'), '38200.50');
  // Commas are stripped so a formatted value stays editable.
  assert.equal(acceptKpiInput('gross_revenue', '38,200.50'), '38200.50');
  assert.equal(acceptKpiInput('gross_revenue', '-100'), null);
  assert.equal(acceptKpiInput('profit', '-1200.25'), '-1200.25');
});

test('parsing turns unusable input into null rather than zero', () => {
  assert.equal(parseKpiValue('closed_deals', '3'), 3);
  assert.equal(parseKpiValue('gross_revenue', '38,200.50'), 38200.5);
  assert.equal(parseKpiValue('profit', '-1200.25'), -1200.25);

  // Empty, absent and out-of-range all mean "no usable figure given".
  assert.equal(parseKpiValue('closed_deals', ''), null);
  assert.equal(parseKpiValue('closed_deals', undefined), null);
  assert.equal(parseKpiValue('gross_revenue', '-5'), null);

  // A zero a member actually typed is a result, and must survive.
  assert.equal(parseKpiValue('closed_deals', '0'), 0);
});

test('formatting round-trips a stored value back into the field', () => {
  assert.equal(formatKpiValue('gross_revenue', 38200.5), '38,200.50');
  assert.equal(formatKpiValue('closed_deals', 3), '3');
  assert.equal(formatKpiValue('closed_deals', 1200), '1,200');
  assert.equal(formatKpiValue('closed_deals', 0), '0');
  assert.equal(formatKpiValue('closed_deals', null), '');
  assert.equal(formatKpiValue('closed_deals', undefined), '');

  const stored = parseKpiValue('gross_revenue', formatKpiValue('gross_revenue', 38200.5));
  assert.equal(stored, 38200.5);
});

test('period start is the first of the month, zero padded', () => {
  assert.equal(getPeriodStart(2026, 8), '2026-08-01');
  assert.equal(getPeriodStart(2026, 12), '2026-12-01');
});
