import assert from 'node:assert/strict';
import test from 'node:test';
import { renderComponent } from './helpers/componentHarness.mjs';

const currentPeriod = '2026-02-01';
const previousPeriod = '2026-01-01';
const metrics = [
  { id: 1, key: 'closed_deals', name: 'Closed Deals', description: null },
  { id: 2, key: 'days_off', name: 'Days Off', description: null },
  { id: 3, key: 'profit', name: 'Profit', description: null },
];
const months = [
  { periodStart: previousPeriod, label: 'January' },
  { periodStart: currentPeriod, label: 'February' },
];
const clone = (value) => JSON.parse(JSON.stringify(value));
const keyFor = (user, period) => `${user}:${period}`;

function database({ historyError = null, historyRejection = null, deferHistory = false } = {}) {
  const records = new Map([
    [keyFor('member-a', currentPeriod), { closed_deals: 1, days_off: 4, profit: -100 }],
    [keyFor('member-a', previousPeriod), { closed_deals: 7, days_off: 6, profit: 200 }],
    [keyFor('member-b', currentPeriod), { closed_deals: 20, days_off: 8, profit: 500 }],
  ]);
  const writes = [];
  const reads = [];
  const historyRequests = [];
  let activeUser = 'member-a';
  const client = {
    auth: { async getUser() { return { data: { user: { id: activeUser } }, error: null }; } },
    from(table) {
      assert.equal(table, 'kpi_metric_types');
      return { select() { return { async order() { return { data: clone(metrics), error: null }; } }; } };
    },
    rpc(name, args) {
      if (name === 'get_monthly_kpi_history_for_year') {
        reads.push(clone(args));
        if (historyRejection) return Promise.reject(new Error(historyRejection));
        const result = () => {
          const error = typeof historyError === 'function' ? historyError(args) : historyError;
          const data = [...records].flatMap(([key, values]) => {
            const [user, period] = key.split(':');
            return user === args._user_id && Number(period.slice(0, 4)) === args._year
              ? [{ user_id: user, period_start_date: period, last_updated_at: null, kpi_values: clone(values) }]
              : [];
          });
          return { data: error ? null : data, error: error ? { message: error } : null };
        };
        if (!deferHistory) return Promise.resolve(result());
        const request = { args: clone(args), settled: false };
        historyRequests.push(request);
        return new Promise((resolve) => {
          request.finish = () => {
            assert.equal(request.settled, false, 'History RPC must settle only once');
            request.settled = true;
            resolve(result());
          };
        });
      }
      assert.equal(name, 'upsert_monthly_kpi_record');
      const write = { args: clone(args), settled: false };
      writes.push(write);
      return new Promise((resolve, reject) => {
        write.finish = (error = null) => {
          assert.equal(write.settled, false, 'RPC must settle only once');
          write.settled = true;
          if (!error) {
            const key = keyFor(args._user_id, args._period_start_date);
            records.set(key, { ...(records.get(key) ?? {}), ...clone(args._kpi_values) });
          }
          resolve({ data: null, error: error ? { message: error } : null });
        };
        write.reject = (message) => {
          assert.equal(write.settled, false, 'RPC must settle only once');
          write.settled = true;
          reject(new Error(message));
        };
      });
    },
  };
  return {
    client, writes, reads, records, historyRequests,
    setUser(user) { activeUser = user; },
    setHistoryError(error) { historyError = error; },
    setHistoryRejection(error) { historyRejection = error; },
    setDeferHistory(deferred) { deferHistory = deferred; },
    value(user = 'member-a', period = currentPeriod) { return records.get(keyFor(user, period)); },
    pending() { return writes.filter((write) => !write.settled); },
  };
}

async function mount(surface, db = database(), options = {}) {
  const defaultProps = surface === 'tracker'
    ? { userIdOverride: 'member-a', fixedPeriodDate: currentPeriod, ...options.props }
    : { months: options.months ?? months };
  const ui = renderComponent(
    surface === 'tracker' ? 'src/components/KpiTracker.tsx' : 'src/components/home/TrackerPanel.tsx',
    defaultProps,
    { '@/lib/supabaseClient': { supabase: db.client } },
  );
  await ui.flush();
  const field = (key) => {
    const input = surface === 'tracker'
      ? ui.all((node) => node.type === 'TextField' && node.props.onBlur)[metrics.findIndex((metric) => metric.key === key)]
      : ui.all((node) => node.props.id === `kpi-${key}` && node.props.onBlur)[0];
    assert.ok(input, `${surface}: missing ${key} input`);
    return input;
  };
  const saveButton = () => {
    assert.equal(surface, 'tracker', 'only the full tracker has an explicit save button');
    const button = ui.all((node) => node.type === 'Button'
      && typeof node.props.children === 'string' && /^(Save Changes|Saving\.\.\.)$/.test(node.props.children))[0];
    assert.ok(button, 'Save Changes button');
    return button;
  };
  return {
    ui, db, field, saveButton,
    async change(key, value) {
      assert.equal(Boolean(field(key).props.disabled), false, `${key} must be editable`);
      await ui.act(() => field(key).props.onChange({ target: { value } }));
    },
    async blur(key) { await ui.act(() => field(key).props.onBlur()); },
    async explicitSave() {
      await ui.act(() => saveButton().props.onClick());
    },
    async retryLoad() {
      const button = ui.all((node) => (node.type === 'Button' || node.props.component === 'button')
        && typeof node.props.children === 'string' && /retry/i.test(node.props.children))[0];
      assert.ok(button, 'load failure must offer a retry');
      await ui.act(() => button.props.onClick());
    },
    async settle(write, error = null) { write.finish(error); await ui.flush(); },
    async switchPeriod(period) {
      if (surface === 'tracker') {
        const month = ui.all((node) => node.type === 'Select' && node.props.labelId === 'month-select-label')[0];
        assert.ok(month, 'month selector');
        await ui.act(() => month.props.onChange({ target: { value: String(Number(period.slice(5, 7))) } }));
      } else {
        const label = defaultProps.months.find((entry) => entry.periodStart === period).label;
        const button = ui.all((node) => node.props.component === 'button' && node.props.children === label)[0];
        assert.ok(button, 'month selector');
        await ui.act(() => button.props.onClick());
      }
    },
    async switchUser(userId) {
      assert.equal(surface, 'tracker', 'only the full tracker accepts a target-user prop');
      await ui.updateProps({ ...defaultProps, userIdOverride: userId });
    },
  };
}

for (const surface of ['tracker', 'programme']) {
  test(`${surface}: prior autosave response preserves typing in the next field`, async () => {
    const app = await mount(surface);
    await app.change('closed_deals', '2');
    await app.blur('closed_deals');
    assert.equal(app.db.writes.length, 1);
    await app.change('days_off', '9');
    await app.settle(app.db.writes[0]);
    assert.equal(app.field('days_off').props.value, '9', 'pending response must not replace a newer draft');
    assert.doesNotMatch(app.ui.text(), /Saved to February/, 'unsaved typing must not be labelled as saved');
    await app.blur('days_off');
    const pending = app.db.pending();
    assert.equal(pending.length, 1);
    await app.settle(pending[0]);
    assert.equal(app.db.value().closed_deals, 2);
    assert.equal(app.db.value().days_off, 9);
  });

  test(`${surface}: rapid autosaves serialize writes and persist the newest snapshot`, async () => {
    const app = await mount(surface);
    await app.change('closed_deals', '2');
    await app.blur('closed_deals');
    await app.change('closed_deals', '3');
    await app.blur('closed_deals');
    await app.change('days_off', '9');
    await app.blur('days_off');
    assert.equal(app.db.pending().length, 1, 'one in-flight write prevents older requests committing last');
    for (let count = 0; app.db.pending().length && count < 6; count += 1) {
      assert.equal(app.db.pending().length, 1);
      await app.settle(app.db.pending()[0]);
    }
    assert.equal(app.db.pending().length, 0);
    assert.equal(app.db.value().closed_deals, 3);
    assert.equal(app.db.value().days_off, 9);
    assert.equal(app.field('closed_deals').props.value, '3');
    assert.equal(app.field('days_off').props.value, '9');
  });

  test(`${surface}: a pending save preserves a newer unblurred edit to the same field`, async () => {
    const app = await mount(surface);
    await app.change('closed_deals', '2');
    await app.blur('closed_deals');
    await app.change('closed_deals', '3');
    await app.settle(app.db.writes[0]);
    assert.equal(app.field('closed_deals').props.value, '3');
    await app.blur('closed_deals');
    assert.equal(app.db.pending().length, 1);
    await app.settle(app.db.pending()[0]);
    assert.equal(app.db.value().closed_deals, 3);
  });

  test(`${surface}: blur saves only that metric and merges other persisted values`, async () => {
    const app = await mount(surface);
    await app.change('days_off', '9');
    await app.change('closed_deals', '2');
    await app.blur('closed_deals');
    assert.deepEqual(app.db.pending()[0].args._kpi_values, { closed_deals: 2 });
    await app.settle(app.db.pending()[0]);
    assert.deepEqual(app.db.value(), { closed_deals: 2, days_off: 4, profit: -100 });
    assert.equal(app.field('days_off').props.value, '9');
    await app.blur('days_off');
    assert.deepEqual(app.db.pending()[0].args._kpi_values, { days_off: 9 });
    await app.settle(app.db.pending()[0]);
    await app.switchPeriod(previousPeriod);
    await app.switchPeriod(currentPeriod);
    assert.equal(app.field('closed_deals').props.value, '2');
    assert.equal(app.field('days_off').props.value, '9');
    assert.equal(app.field('profit').props.value, '-100.00');
  });

  test(`${surface}: failed history blocks edits and all save requests`, async () => {
    const db = database({ historyError: 'History unavailable' });
    const app = await mount(surface, db);
    assert.match(app.ui.text(), /History unavailable/);
    assert.equal(app.field('closed_deals').props.disabled, true);
    // A stale blur event must also be harmless even though controls are disabled.
    await app.ui.act(() => app.field('closed_deals').props.onChange({ target: { value: '99' } }));
    await app.blur('closed_deals');
    if (surface === 'tracker') await app.explicitSave();
    assert.equal(db.writes.length, 0);
    assert.deepEqual(db.value(), { closed_deals: 1, days_off: 4, profit: -100 });
  });

  test(`${surface}: retrying failed history hydrates saved values before enabling edits`, async () => {
    const db = database({ historyError: 'History unavailable' });
    const app = await mount(surface, db);
    assert.equal(app.field('days_off').props.disabled, true);
    db.setHistoryError(null);
    db.setDeferHistory(true);
    await app.retryLoad();
    assert.equal(app.field('days_off').props.disabled, true, 'retry cannot enable an empty draft while loading');
    await app.blur('days_off');
    assert.equal(db.writes.length, 0);
    assert.equal(db.historyRequests.length, 1);
    db.historyRequests[0].finish();
    await app.ui.flush();
    assert.equal(Boolean(app.field('days_off').props.disabled), false);
    assert.equal(app.field('days_off').props.value, '4');
    assert.equal(app.field('profit').props.value, '-100.00');
    assert.doesNotMatch(app.ui.text(), /History unavailable/);
    await app.change('days_off', '10');
    await app.blur('days_off');
    assert.deepEqual(db.pending()[0].args._kpi_values, { days_off: 10 });
    await app.settle(db.pending()[0]);
    assert.deepEqual(db.value(), { closed_deals: 1, days_off: 10, profit: -100 });
  });

  test(`${surface}: rejected history requests remain read-only and can be retried`, async () => {
    const db = database({ historyRejection: 'History network failure' });
    const app = await mount(surface, db);
    assert.match(app.ui.text(), /History network failure/);
    assert.equal(app.field('days_off').props.disabled, true);
    await app.blur('days_off');
    if (surface === 'tracker') await app.explicitSave();
    assert.equal(db.writes.length, 0);
    db.setHistoryRejection(null);
    await app.retryLoad();
    assert.equal(Boolean(app.field('days_off').props.disabled), false);
    assert.equal(app.field('days_off').props.value, '4');
    assert.doesNotMatch(app.ui.text(), /History network failure/);
  });

  test(`${surface}: save errors preserve the draft and blur retries the edit`, async () => {
    const app = await mount(surface);
    await app.change('days_off', '9');
    await app.blur('days_off');
    await app.settle(app.db.writes[0], 'Save temporarily failed');
    assert.equal(app.field('days_off').props.value, '9');
    assert.match(app.ui.text(), /Save temporarily failed/);
    assert.equal(app.db.value().days_off, 4);
    await app.blur('days_off');
    assert.equal(app.db.pending().length, 1);
    await app.settle(app.db.pending()[0]);
    assert.equal(app.db.value().days_off, 9);
    assert.doesNotMatch(app.ui.text(), /Save temporarily failed/);
  });

  test(`${surface}: one failed save does not poison queued edits or discard its own draft`, async () => {
    const app = await mount(surface);
    await app.change('closed_deals', '2');
    await app.blur('closed_deals');
    await app.change('days_off', '9');
    await app.blur('days_off');
    assert.equal(app.db.pending().length, 1);
    await app.settle(app.db.pending()[0], 'Save temporarily failed');
    assert.equal(app.db.pending().length, 1, 'later work must run after a failed request');
    await app.settle(app.db.pending()[0]);
    assert.equal(app.db.value().days_off, 9);
    assert.equal(app.db.value().closed_deals, 1, 'unrelated save must not include the failed metric');
    assert.equal(app.field('closed_deals').props.value, '2');
    assert.match(app.ui.text(), /Save temporarily failed/, 'unrelated success must not hide the unresolved failed edit');
    await app.blur('closed_deals');
    await app.settle(app.db.pending()[0]);
    assert.equal(app.db.value().closed_deals, 2);
  });

  test(`${surface}: a rejected write retains its draft and the next retry can succeed`, async () => {
    const app = await mount(surface);
    await app.change('days_off', '9');
    await app.blur('days_off');
    app.db.writes[0].reject('Write network failure');
    await app.ui.flush();
    assert.equal(app.field('days_off').props.value, '9');
    assert.equal(app.db.value().days_off, 4);
    assert.match(app.ui.text(), /Write network failure/);
    await app.blur('days_off');
    assert.equal(app.db.pending().length, 1);
    await app.settle(app.db.pending()[0]);
    assert.equal(app.db.value().days_off, 9);
    assert.doesNotMatch(app.ui.text(), /Write network failure/);
  });

  test(`${surface}: old-period responses do not replace new-period edits or success state`, async () => {
    const app = await mount(surface);
    await app.change('closed_deals', '2');
    await app.blur('closed_deals');
    await app.switchPeriod(previousPeriod);
    assert.equal(app.field('closed_deals').props.value, '7');
    await app.change('days_off', '12');
    await app.settle(app.db.writes[0]);
    assert.equal(app.field('days_off').props.value, '12');
    assert.equal(app.field('closed_deals').props.value, '7');
    assert.doesNotMatch(app.ui.text(), /KPI values saved|Saved to January/);
    assert.equal(app.db.value('member-a', previousPeriod).days_off, 6);
    await app.blur('days_off');
    await app.settle(app.db.pending()[0]);
    assert.equal(app.db.value('member-a', previousPeriod).days_off, 12);
    assert.equal(app.db.value().closed_deals, 2);
  });

  test(`${surface}: failed saves and unblurred edits survive switching months`, async () => {
    const app = await mount(surface);
    await app.change('closed_deals', '2');
    await app.blur('closed_deals');
    await app.change('days_off', '9');
    await app.switchPeriod(previousPeriod);
    await app.settle(app.db.writes[0], 'Save temporarily failed');
    assert.doesNotMatch(app.ui.text(), /Save temporarily failed/, 'old-month failure must not label the current month');
    await app.switchPeriod(currentPeriod);
    assert.equal(app.field('closed_deals').props.value, '2');
    assert.equal(app.field('days_off').props.value, '9');
    assert.match(app.ui.text(), /Save temporarily failed/, 'returning must reveal the unresolved save');
    await app.blur('closed_deals');
    await app.settle(app.db.pending()[0]);
    await app.blur('days_off');
    await app.settle(app.db.pending()[0]);
    assert.equal(app.db.value().closed_deals, 2);
    assert.equal(app.db.value().days_off, 9);
  });

  test(`${surface}: returning to a month before its save completes retains later typing`, async () => {
    const app = await mount(surface);
    await app.change('closed_deals', '2');
    await app.blur('closed_deals');
    await app.change('closed_deals', '3');
    await app.switchPeriod(previousPeriod);
    await app.switchPeriod(currentPeriod);
    assert.equal(app.field('closed_deals').props.value, '3');
    await app.settle(app.db.writes[0]);
    assert.equal(app.field('closed_deals').props.value, '3');
    assert.equal(app.db.value().closed_deals, 2);
    await app.blur('closed_deals');
    await app.settle(app.db.pending()[0]);
    assert.equal(app.db.value().closed_deals, 3);
  });

  test(`${surface}: explicit clearing stores null and preserves unrelated values`, async () => {
    const app = await mount(surface);
    await app.change('days_off', '');
    await app.blur('days_off');
    assert.equal(app.db.pending()[0].args._kpi_values.days_off, null);
    await app.settle(app.db.pending()[0]);
    assert.deepEqual(app.db.value(), { closed_deals: 1, days_off: null, profit: -100 });
    assert.equal(app.field('days_off').props.value, '');
  });

  test(`${surface}: focusing and leaving an unchanged field does not write`, async () => {
    const app = await mount(surface);
    await app.blur('closed_deals');
    assert.equal(app.db.writes.length, 0);
  });
}

test('tracker: pending save for the previous user cannot hydrate or mark the next user', async () => {
  let savedCallbacks = 0;
  const app = await mount('tracker', database(), { props: { onSaved: () => { savedCallbacks += 1; } } });
  await app.change('days_off', '9');
  const saveButton = app.ui.all((node) => node.type === 'Button' && node.props.children === 'Save Changes')[0];
  assert.ok(saveButton);
  await app.ui.act(() => saveButton.props.onClick());
  assert.equal(app.db.writes.length, 1);
  await app.switchUser('member-b');
  assert.equal(app.field('days_off').props.value, '8');
  await app.change('closed_deals', '21');
  await app.settle(app.db.writes[0]);
  assert.equal(app.field('closed_deals').props.value, '21');
  assert.equal(app.field('days_off').props.value, '8');
  assert.doesNotMatch(app.ui.text(), /KPI values saved/);
  assert.equal(savedCallbacks, 0, 'old request must not fire a current-record refresh callback');
  assert.equal(app.db.value('member-b').closed_deals, 20);
  await app.blur('closed_deals');
  await app.settle(app.db.pending()[0]);
  assert.equal(app.db.value('member-b').closed_deals, 21);
  assert.equal(app.db.value().days_off, 9);
});

test('tracker: explicit save after blur completion refreshes the parent without a duplicate write', async () => {
  let savedCallbacks = 0;
  const app = await mount('tracker', database(), { props: { onSaved: () => { savedCallbacks += 1; } } });
  await app.change('days_off', '9');
  await app.blur('days_off');
  await app.settle(app.db.writes[0]);
  assert.equal(savedCallbacks, 0, 'autosave must not invoke the explicit-save callback');
  await app.explicitSave();
  assert.equal(app.db.writes.length, 1, 'already acknowledged edits must not be written twice');
  assert.equal(savedCallbacks, 1, 'explicit save still refreshes surrounding KPI summaries');
});

test('tracker: blurring into Save Changes leaves the button clickable and waits for autosave', async () => {
  let savedCallbacks = 0;
  const app = await mount('tracker', database(), { props: { onSaved: () => { savedCallbacks += 1; } } });
  await app.change('days_off', '9');
  // A browser sends blur before click when the focused field loses focus to
  // the button. Starting autosave must not disable that following click.
  await app.blur('days_off');
  assert.equal(Boolean(app.saveButton().props.disabled), false);
  await app.explicitSave();
  assert.equal(savedCallbacks, 0, 'refresh must wait until the pending autosave is acknowledged');
  assert.equal(app.db.writes.length, 1);
  await app.settle(app.db.writes[0]);
  assert.equal(app.db.writes.length, 1, 'the queued explicit save does not duplicate the same patch');
  assert.equal(savedCallbacks, 1);
  assert.equal(app.db.value().days_off, 9);
});

test('tracker: explicit save on an unchanged record preserves the refresh callback', async () => {
  let savedCallbacks = 0;
  const app = await mount('tracker', database(), { props: { onSaved: () => { savedCallbacks += 1; } } });
  await app.explicitSave();
  assert.equal(app.db.writes.length, 0);
  assert.equal(savedCallbacks, 1);
});

test('tracker: switching users preserves dirty drafts and refreshes untouched values from new history', async () => {
  const app = await mount('tracker');
  await app.change('closed_deals', '2');
  await app.switchUser('member-b');
  assert.equal(app.field('closed_deals').props.value, '20');
  app.db.records.set(keyFor('member-a', currentPeriod), { closed_deals: 10, days_off: 30, profit: 800 });
  await app.switchUser('member-a');
  assert.equal(app.field('closed_deals').props.value, '2', 'retain the unsaved local edit');
  assert.equal(app.field('days_off').props.value, '30', 'refresh untouched fields from successful history');
  assert.equal(app.field('profit').props.value, '800.00');
  await app.blur('closed_deals');
  assert.deepEqual(app.db.pending()[0].args._kpi_values, { closed_deals: 2 });
  await app.settle(app.db.pending()[0]);
  assert.deepEqual(app.db.value(), { closed_deals: 2, days_off: 30, profit: 800 });
});

test('tracker: late history for the previous user cannot enable or hydrate the current user', async () => {
  const db = database({ deferHistory: true });
  const app = await mount('tracker', db);
  assert.equal(db.historyRequests.length, 1);
  await app.switchUser('member-b');
  assert.equal(db.historyRequests.length, 2);
  db.historyRequests[0].finish();
  await app.ui.flush();
  assert.equal(app.field('days_off').props.disabled, true);
  await app.blur('days_off');
  await app.explicitSave();
  assert.equal(db.writes.length, 0);
  db.historyRequests[1].finish();
  await app.ui.flush();
  assert.equal(Boolean(app.field('days_off').props.disabled), false);
  assert.equal(app.field('days_off').props.value, '8');
  assert.equal(app.field('closed_deals').props.value, '20');
});

test('programme: a failed year in a cross-year programme cannot be saved as a blank month', async () => {
  const db = database({ historyError: (args) => args._year === 2026 ? '2026 history unavailable' : null });
  const app = await mount('programme', db, { months: [
    { periodStart: '2025-12-01', label: 'December' },
    { periodStart: '2026-01-01', label: 'January' },
  ] });
  assert.deepEqual(db.reads.map((read) => read._year).sort(), [2025, 2026]);
  assert.match(app.ui.text(), /2026 history unavailable/);
  assert.equal(app.field('days_off').props.disabled, true);
  await app.blur('days_off');
  assert.equal(db.writes.length, 0);
});

test('programme: changing available months makes future edits target an available month', async () => {
  const app = await mount('programme');
  await app.change('closed_deals', '2');
  await app.blur('closed_deals');
  const oldWrite = app.db.writes[0];
  await app.ui.updateProps({ months: [{ periodStart: previousPeriod, label: 'January' }] });
  assert.equal(app.field('closed_deals').props.value, '7');
  assert.equal(app.field('days_off').props.value, '6');
  await app.change('days_off', '9');
  await app.blur('days_off');
  const newWrite = app.db.writes.find((write) => write !== oldWrite);
  assert.ok(newWrite, 'the newly available month can save independently');
  assert.equal(newWrite.args._period_start_date, previousPeriod);
  assert.deepEqual(newWrite.args._kpi_values, { days_off: 9 });
  await app.settle(oldWrite);
  assert.equal(app.field('days_off').props.value, '9', 'removed-month response must not hydrate the selected month');
  await app.settle(newWrite);
  assert.equal(app.db.value('member-a', previousPeriod).days_off, 9);
  assert.deepEqual(app.db.value(), { closed_deals: 2, days_off: 4, profit: -100 });
});
