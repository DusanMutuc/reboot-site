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
      if (url === '/api/admin/list-users?membership=all') return success({ items: [source, dest, anotherDest] });
      assert.equal(url, '/api/admin/transfer-user-data');
      const body = JSON.parse(options.body);
      calls.push(body);
      return transfer ? transfer(body, calls.length) : success();
    },
  };
  async function mount() {
    const ui = renderComponent('src/components/admin/UserDataTransfer.tsx', {}, {
      '@mui/material/Autocomplete': { __esModule: true, default: 'Autocomplete' },
    }, globals);
    instances.push(ui);
    await ui.flush();
    await ui.act(() => ui.all((node) => node.type === 'Autocomplete')[0].props.onChange(null, source));
    await ui.act(() => ui.all((node) => node.type === 'Autocomplete')[1].props.onChange(null, dest));
    return ui;
  }
  return { mount, calls, storage, confirmations, unmountAll: () => instances.forEach((ui) => ui.unmount()) };
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
  assert.equal(runButton(ui).props.children, 'Retry Live Copy');
  assert.match(ui.text(), /A previous attempt is saved/);
  await run(ui);
  assert.equal(env.calls.at(-1).options.request_id, operationId);
  assert.equal(liveRequests, 3);
  assert.match(ui.text(), /Live copy completed/);
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
  assert.match(ui.text(), /Live copy completed/);
  assert.equal(runButton(ui).props.disabled, true);
  const callsAfterCompletion = env.calls.length;
  await run(ui);
  assert.equal(env.calls.length, callsAfterCompletion, 'A known completed operation is not resubmitted');
});

test('malformed saved operation IDs do not bypass the preview prerequisite', async (t) => {
  const env = environment(); t.after(env.unmountAll);
  const intentKey = JSON.stringify([source.id, dest.id, 'prefer_source', 'keep_latest_submitted', false]);
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
  assert.equal(runButton(ui).props.children, 'Copy Completed');
  await selectOption(ui, 'KPI handling', 'skip');
  await selectOption(ui, 'KPI handling', 'prefer_source');
  assert.equal(runButton(ui).props.disabled, true);
  assert.equal(runButton(ui).props.children, 'Copy Completed');
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
  assert.doesNotMatch(ui.text(), /Live copy completed/);
  await run(ui);
  await setDryRun(ui, true);
  assert.match(ui.text(), /Live copy completed/);
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
