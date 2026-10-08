import assert from 'node:assert/strict';
import test from 'node:test';
import { renderComponent } from './helpers/componentHarness.mjs';

const source = { id: '11111111-1111-4111-8111-111111111111', name: 'Source', email: 'source@example.invalid' };
const dest = { id: '22222222-2222-4222-8222-222222222222', name: 'Destination', email: 'destination@example.invalid' };
const anotherDest = { id: '33333333-3333-4333-8333-333333333333', name: 'Another destination', email: 'another@example.invalid' };
const success = (data = { ok: true }) => ({ ok: true, json: async () => data });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function environment({ transfer, storageFails = false, confirm = true } = {}) {
  const calls = [];
  const storage = new Map();
  const confirmations = [];
  const instances = [];
  let availableUsers = [source, dest, anotherDest];
  let nextId = 1;
  const globals = {
    crypto: { randomUUID: () => `44444444-4444-4444-8444-${String(nextId++).padStart(12, '0')}` },
    window: {
      confirm(message) { confirmations.push(message); return confirm; },
      sessionStorage: {
        getItem(key) { if (storageFails) throw new Error('Storage unavailable'); return storage.get(key) ?? null; },
        setItem(key, value) { if (storageFails) throw new Error('Storage unavailable'); storage.set(key, value); },
      },
    },
    fetch: async (url, options) => {
      if (url === '/api/admin/list-users?membership=all') return success({ items: availableUsers });
      assert.equal(url, '/api/admin/transfer-user-data');
      const body = JSON.parse(options.body);
      calls.push(body);
      return transfer ? transfer(body, calls.length) : success();
    },
  };
  async function mount({ selectUsers = true } = {}) {
    const ui = renderComponent('src/components/admin/UserDataTransfer.tsx', {}, {
      '@mui/material/Autocomplete': { __esModule: true, default: 'Autocomplete' },
    }, globals);
    instances.push(ui);
    await ui.flush();
    if (selectUsers) {
      await ui.act(() => ui.all((node) => node.type === 'Autocomplete')[0].props.onChange(null, source));
      await ui.act(() => ui.all((node) => node.type === 'Autocomplete')[1].props.onChange(null, dest));
    }
    return ui;
  }
  return { mount, calls, storage, confirmations, setUsers: (users) => { availableUsers = users; }, unmountAll: () => instances.forEach((ui) => ui.unmount()) };
}

const runButton = (ui) => ui.all((node) => node.type === 'Button' && node.props.variant === 'contained')[0];
const dryRunSwitch = (ui) => ui.all((node) => node.type === 'Switch')[0];
const setDryRun = (ui, checked) => ui.act(() => dryRunSwitch(ui).props.onChange({ target: { checked } }));
const run = (ui) => ui.act(() => runButton(ui).props.onClick());
const selectOption = (ui, label, value) => ui.act(() => ui.all((node) => node.type === 'Select' && node.props.label === label)[0].props.onChange({ target: { value } }));
async function previewThenLive(ui) {
  await run(ui);
  await setDryRun(ui, false);
  assert.equal(runButton(ui).props.disabled, false);
}

test('a live transfer requires a successful preview with the same users and options', async (t) => {
  const env = environment(); t.after(env.unmountAll);
  const ui = await env.mount();
  await setDryRun(ui, false);
  assert.equal(runButton(ui).props.disabled, true);
  await run(ui);
  assert.equal(env.calls.length, 0, 'The event handler also rejects an unpreviewed live request');
  await setDryRun(ui, true);
  await previewThenLive(ui);
  assert.equal(env.calls[0].options.dry_run, true);
  assert.equal('request_id' in env.calls[0].options, false);

  await selectOption(ui, 'KPI handling', 'skip');
  assert.equal(runButton(ui).props.disabled, true);
  await selectOption(ui, 'KPI handling', 'prefer_source');
  assert.equal(runButton(ui).props.disabled, false);
  await selectOption(ui, 'Smart Doc conflicts', 'keep_dest');
  assert.equal(runButton(ui).props.disabled, true);
  await selectOption(ui, 'Smart Doc conflicts', 'keep_latest_submitted');
  await ui.act(() => ui.all((node) => node.type === 'Switch')[1].props.onChange({ target: { checked: true } }));
  assert.equal(runButton(ui).props.disabled, true);
  await ui.act(() => ui.all((node) => node.type === 'Switch')[1].props.onChange({ target: { checked: false } }));
  await ui.act(() => ui.all((node) => node.type === 'Autocomplete')[1].props.onChange(null, anotherDest));
  assert.equal(runButton(ui).props.disabled, true);
});

test('a failed preview revokes an earlier successful preview', async (t) => {
  const env = environment({ transfer: (_body, count) => count === 1 ? success() : { ok: false, json: async () => ({ error: 'No matching destination contact' }) } });
  t.after(env.unmountAll);
  const ui = await env.mount();
  await run(ui);
  await run(ui);
  await setDryRun(ui, false);
  assert.equal(runButton(ui).props.disabled, true);
  assert.match(ui.text(), /No matching destination contact/);
});

test('source, destination and every transfer option are disabled until an in-flight request finishes', async (t) => {
  const pending = deferred();
  const env = environment({ transfer: () => pending.promise }); t.after(env.unmountAll);
  const ui = await env.mount();
  await run(ui);
  for (const node of ui.all((node) => ['Autocomplete', 'Switch', 'Select'].includes(node.type))) {
    assert.equal(node.props.disabled, true, `${node.type} must be disabled during a transfer`);
  }
  assert.equal(runButton(ui).props.disabled, true);
  await run(ui);
  assert.equal(env.calls.length, 1);
  pending.resolve(success());
  await ui.flush();
  for (const node of ui.all((node) => ['Autocomplete', 'Switch', 'Select'].includes(node.type))) assert.equal(node.props.disabled, false);
  assert.equal(runButton(ui).props.disabled, false);
});

test('lost live responses reuse the operation ID on retry and after remount', async (t) => {
  let liveRequests = 0;
  const env = environment({ transfer: (body) => {
    if (body.options.dry_run) return success();
    liveRequests += 1;
    if (liveRequests === 1) throw new Error('Connection dropped after the server committed');
    if (liveRequests === 2) return { ok: true, json: async () => { throw new Error('Incomplete response body'); } };
    return success({ ok: true, replayed: true });
  } });
  t.after(env.unmountAll);
  let ui = await env.mount();
  await previewThenLive(ui);
  await run(ui);
  assert.match(ui.text(), /Connection dropped/);
  const operationId = env.calls.at(-1).options.request_id;
  assert.ok(operationId);
  assert.equal([...env.storage.values()][0], operationId);
  await run(ui);
  assert.match(ui.text(), /Incomplete response body/);
  assert.equal(env.calls.at(-1).options.request_id, operationId);

  ui.unmount();
  ui = await env.mount();
  await setDryRun(ui, false);
  assert.equal(runButton(ui).props.disabled, false, 'A saved attempt can be retried without another preview');
  assert.equal(runButton(ui).props.children, 'Retry Saved Operation');
  assert.match(ui.text(), /A previous attempt is saved/);
  await run(ui);
  assert.equal(env.calls.at(-1).options.request_id, operationId);
  assert.equal(liveRequests, 3);
  assert.match(ui.text(), /Merge completed/);
});

test('a failed preview after reload does not block retrieving a completed transfer with its original operation ID', async (t) => {
  let committed = false;
  const env = environment({ transfer: (body) => {
    if (body.options.dry_run) return committed
      ? { ok: false, json: async () => ({ error: 'Destination already has implementation sessions' }) }
      : success();
    if (!committed) {
      committed = true;
      throw new Error('Lost response after commit');
    }
    return success({ ok: true, replayed: true });
  } });
  t.after(env.unmountAll);
  let ui = await env.mount();
  await previewThenLive(ui);
  await run(ui);
  const originalId = env.calls.at(-1).options.request_id;
  ui.unmount();

  ui = await env.mount();
  await run(ui);
  assert.match(ui.text(), /Destination already has implementation sessions/);
  await setDryRun(ui, false);
  assert.equal(runButton(ui).props.disabled, false);
  await run(ui);
  assert.equal(env.calls.at(-1).options.request_id, originalId);
  assert.match(ui.text(), /Merge completed/);
  assert.equal(runButton(ui).props.disabled, true);
  const callsAfterCompletion = env.calls.length;
  await run(ui);
  assert.equal(env.calls.length, callsAfterCompletion, 'A known completed operation is not resubmitted');
});

test('malformed saved operation IDs do not bypass the preview prerequisite', async (t) => {
  const env = environment(); t.after(env.unmountAll);
  const intentKey = JSON.stringify(['merge', source.id, dest.id, 'prefer_source', 'keep_latest_submitted', false]);
  env.storage.set(`reboot:account-transfer:${intentKey}`, 'corrupted-storage-value');
  const ui = await env.mount();
  await setDryRun(ui, false);
  assert.equal(runButton(ui).props.disabled, true);
  await setDryRun(ui, true);
  await previewThenLive(ui);
  await run(ui);
  assert.notEqual(env.calls.at(-1).options.request_id, 'corrupted-storage-value');
});

test('a completed operation stays disabled after switching settings away and back', async (t) => {
  const env = environment(); t.after(env.unmountAll);
  const ui = await env.mount();
  await previewThenLive(ui);
  await run(ui);
  assert.equal(runButton(ui).props.disabled, true);
  assert.equal(runButton(ui).props.children, 'Completed');
  await selectOption(ui, 'KPI handling', 'skip');
  await selectOption(ui, 'KPI handling', 'prefer_source');
  assert.equal(runButton(ui).props.disabled, true);
  assert.equal(runButton(ui).props.children, 'Completed');
});

test('an unavailable session store still preserves the retry ID for this mounted page', async (t) => {
  const env = environment({ storageFails: true, transfer: (body) => {
    if (!body.options.dry_run) throw new Error('Lost response');
    return success();
  } });
  t.after(env.unmountAll);
  const ui = await env.mount();
  await previewThenLive(ui);
  await run(ui);
  await run(ui);
  const liveCalls = env.calls.filter((body) => !body.options.dry_run);
  assert.equal(liveCalls.length, 2);
  assert.equal(liveCalls[0].options.request_id, liveCalls[1].options.request_id);
});

test('changing transfer destination creates a separate operation only after a new preview', async (t) => {
  const env = environment(); t.after(env.unmountAll);
  const ui = await env.mount();
  await previewThenLive(ui);
  await run(ui);
  const firstId = env.calls.at(-1).options.request_id;
  await ui.act(() => ui.all((node) => node.type === 'Autocomplete')[1].props.onChange(null, anotherDest));
  assert.equal(runButton(ui).props.disabled, true);
  await setDryRun(ui, true);
  await previewThenLive(ui);
  await run(ui);
  assert.notEqual(env.calls.at(-1).options.request_id, firstId);
  assert.equal(env.calls.at(-1).dest, anotherDest.id);
});

test('result labels describe the completed operation even after toggling the dry-run switch', async (t) => {
  const env = environment(); t.after(env.unmountAll);
  const ui = await env.mount();
  await previewThenLive(ui);
  assert.match(ui.text(), /Dry run completed/);
  assert.doesNotMatch(ui.text(), /Merge completed/);
  await run(ui);
  await setDryRun(ui, true);
  assert.match(ui.text(), /Merge completed/);
  assert.doesNotMatch(ui.text(), /Dry run completed/);
});

test('cancelling confirmation performs no live request', async (t) => {
  const env = environment({ confirm: false }); t.after(env.unmountAll);
  const ui = await env.mount();
  await previewThenLive(ui);
  await run(ui);
  assert.equal(env.calls.length, 1);
  assert.equal(env.confirmations.length, 1);
  assert.match(env.confirmations[0], /destination@example.invalid/);
  assert.equal(env.storage.size, 0);
});

test('merge is the default and switching operation requires a fresh preview and retry ID', async (t) => {
  const env = environment(); t.after(env.unmountAll);
  const ui = await env.mount();
  await previewThenLive(ui);
  assert.equal(env.calls[0].options.operation, 'merge');
  await run(ui);
  assert.match(env.confirmations.at(-1), /source account will be archived/);
  const mergeId = env.calls.at(-1).options.request_id;
  await selectOption(ui, 'Account operation', 'copy');
  await setDryRun(ui, false);
  assert.equal(runButton(ui).props.disabled, true);
  await setDryRun(ui, true);
  await previewThenLive(ui);
  await run(ui);
  assert.equal(env.calls.at(-1).options.operation, 'copy');
  assert.notEqual(env.calls.at(-1).options.request_id, mergeId);
  assert.match(env.confirmations.at(-1), /Both accounts will remain usable/);
});
test('archive mode sends archive intent and explains that history is not copied again', async (t) => {
  const env = environment(); t.after(env.unmountAll);
  const ui = await env.mount();
  await selectOption(ui, 'Account operation', 'archive');
  await previewThenLive(ui);
  await run(ui);
  assert.equal(env.calls.at(-1).options.operation, 'archive');
  assert.match(env.confirmations.at(-1), /without copying again/);
});

const receiptKey = 'reboot:account-transfer:pending-receipts';
const recoveryButtons = (ui) => ui.all((node) => node.type === 'Button' && node.props.children === 'Retry this saved operation');

test('an Auth-pending merge can recover after reload when the archived source is absent from all selectors', async (t) => {
  let archived = false;
  const env = environment({ transfer: (body) => {
    if (body.options.dry_run) {
      assert.equal(archived, false, 'recovering an archived source must not require a new preview');
      return success();
    }
    if (!archived) {
      archived = true;
      return { ok: false, json: async () => ({ code: 'MERGE_AUTH_PENDING', error: 'The merge is recorded, but disabling the old sign-in is still pending.' }) };
    }
    return success({ operation: 'merge', archived: true, replayed: true });
  } });
  t.after(env.unmountAll);
  let ui = await env.mount();
  await previewThenLive(ui);
  await run(ui);
  const originalRequest = env.calls.at(-1);
  assert.equal(JSON.parse(env.storage.get(receiptKey)).length, 1);
  ui.unmount();
  env.setUsers([dest, anotherDest]);
  ui = await env.mount({ selectUsers: false });
  for (const select of ui.all((node) => node.type === 'Autocomplete')) {
    assert.equal(select.props.options.some((user) => user.id === source.id), false);
    assert.equal(select.props.value, null);
  }
  assert.equal(runButton(ui).props.disabled, true);
  assert.equal(recoveryButtons(ui).length, 1);
  assert.match(ui.text(), /source@example.invalid/);
  await ui.act(() => recoveryButtons(ui)[0].props.onClick());
  assert.deepEqual(env.calls.at(-1), originalRequest, 'recovery must preserve the exact operation, accounts, options and ID');
  assert.equal(env.calls.length, 3);
  assert.match(ui.text(), /Merge completed/);
  assert.equal(recoveryButtons(ui).length, 0);
  assert.deepEqual(JSON.parse(env.storage.get(receiptKey)), []);
  ui.unmount();
  ui = await env.mount({ selectUsers: false });
  assert.equal(recoveryButtons(ui).length, 0, 'completed recovery should not remain an unfinished receipt');
});

test('recovery ignores changed form selections and does not authorize a different unpreviewed operation', async (t) => {
  let pending = true;
  const env = environment({ transfer: (body) => {
    if (!body.options.dry_run && pending) { pending = false; throw new Error('Lost reply'); }
    return success();
  } });
  t.after(env.unmountAll);
  let ui = await env.mount();
  await previewThenLive(ui);
  await run(ui);
  const original = env.calls.at(-1);
  ui.unmount();
  env.setUsers([dest, anotherDest]);
  ui = await env.mount({ selectUsers: false });
  await ui.act(() => ui.all((node) => node.type === 'Autocomplete')[0].props.onChange(null, dest));
  await ui.act(() => ui.all((node) => node.type === 'Autocomplete')[1].props.onChange(null, anotherDest));
  await selectOption(ui, 'Account operation', 'copy');
  await selectOption(ui, 'KPI handling', 'skip');
  await selectOption(ui, 'Smart Doc conflicts', 'keep_dest');
  await setDryRun(ui, false);
  assert.equal(runButton(ui).props.disabled, true);
  await run(ui);
  assert.equal(env.calls.length, 2);
  await ui.act(() => recoveryButtons(ui)[0].props.onClick());
  assert.deepEqual(env.calls.at(-1), original);
  assert.equal(runButton(ui).props.disabled, true, 'recovery is not a preview for the visible new operation');
  assert.match(ui.text(), /Merge completed/);
  assert.doesNotMatch(ui.text(), /History copied\. Both accounts remain usable/);
});

test('malformed receipts cannot appear as recoverable live operations', async (t) => {
  const env = environment(); t.after(env.unmountAll);
  const base = { requestId: '44444444-4444-4444-8444-000000000001', source, dest,
    options: { operation: 'merge', dry_run: false, kpi_merge: 'prefer_source', smart_doc_conflict: 'keep_dest', reassign_authorship: false },
    createdAt: '2026-10-10T10:00:00Z' };
  for (const bad of [null, {}, { ...base, requestId: 'invalid' }, { ...base, dest: source },
    { ...base, options: { ...base.options, dry_run: true } }, { ...base, options: { ...base.options, operation: 'delete' } },
    { ...base, options: { ...base.options, reassign_authorship: 'false' } }]) {
    env.storage.set(receiptKey, JSON.stringify([bad]));
    const ui = await env.mount();
    assert.equal(recoveryButtons(ui).length, 0);
    await setDryRun(ui, false);
    assert.equal(runButton(ui).props.disabled, true);
    ui.unmount();
  }
  assert.equal(env.calls.length, 0);
});

test('saved receipt replay strips unexpected option metadata and preserves the original operation', async (t) => {
  const env = environment(); t.after(env.unmountAll);
  const receipt = { requestId: '44444444-4444-4444-8444-000000000001', source, dest,
    options: { operation: 'archive', dry_run: false, kpi_merge: 'skip', smart_doc_conflict: 'keep_dest', reassign_authorship: false, destination_email: 'forged@example.invalid' },
    createdAt: '2026-10-10T10:00:00Z' };
  env.storage.set(receiptKey, JSON.stringify([receipt]));
  env.setUsers([]);
  const ui = await env.mount({ selectUsers: false });
  await ui.act(() => recoveryButtons(ui)[0].props.onClick());
  assert.equal(env.calls[0].options.operation, 'archive');
  assert.equal(env.calls[0].options.request_id, receipt.requestId);
  assert.equal('destination_email' in env.calls[0].options, false);
});

test('cancelling a saved-operation retry leaves its recovery receipt and sends no request', async (t) => {
  const env = environment({ confirm: false }); t.after(env.unmountAll);
  env.storage.set(receiptKey, JSON.stringify([{ requestId: '44444444-4444-4444-8444-000000000001', source, dest,
    options: { operation: 'merge', dry_run: false, kpi_merge: 'skip', smart_doc_conflict: 'keep_dest', reassign_authorship: false },
    createdAt: '2026-10-10T10:00:00Z' }]));
  const ui = await env.mount({ selectUsers: false });
  await ui.act(() => recoveryButtons(ui)[0].props.onClick());
  assert.equal(env.calls.length, 0);
  assert.equal(recoveryButtons(ui).length, 1);
  assert.equal(JSON.parse(env.storage.get(receiptKey)).length, 1);
});

test('finishing one saved operation preserves unrelated unfinished receipts', async (t) => {
  let failWrites = true;
  const env = environment({ transfer: (body) => {
    if (!body.options.dry_run && failWrites) throw new Error('Uncertain response');
    return success();
  } });
  t.after(env.unmountAll);
  let ui = await env.mount();
  await previewThenLive(ui); await run(ui);
  const first = env.calls.at(-1);
  await ui.act(() => ui.all((node) => node.type === 'Autocomplete')[1].props.onChange(null, anotherDest));
  await setDryRun(ui, true); await previewThenLive(ui); await run(ui);
  const second = env.calls.at(-1);
  assert.equal(recoveryButtons(ui).length, 2);
  failWrites = false;
  ui.unmount(); env.setUsers([]);
  ui = await env.mount({ selectUsers: false });
  await ui.act(() => recoveryButtons(ui)[0].props.onClick());
  assert.deepEqual(env.calls.at(-1), first);
  assert.equal(recoveryButtons(ui).length, 1);
  assert.equal(JSON.parse(env.storage.get(receiptKey))[0].requestId, second.options.request_id);
  await ui.act(() => recoveryButtons(ui)[0].props.onClick());
  assert.deepEqual(env.calls.at(-1), second);
  assert.equal(recoveryButtons(ui).length, 0);
});
