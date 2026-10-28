import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { renderComponent } from './helpers/componentHarness.mjs';

async function mount(props = {}) {
  const calls = [];
  // The harness has no DOM; native FormData still records the real values
  // explicitly supplied by the component's submit handler.
  class TestFormData extends FormData { constructor() { super(); } }
  const ui = renderComponent('src/app/support/SupportForm.tsx', {
    signedInEmail: 'member@example.test', available: true, from: '/library/guide', ...props,
  }, { 'next/link': 'Link', './support.module.css': {} }, {
    FormData: TestFormData, crypto: { randomUUID }, URL,
    document: { referrer: '' }, window: { location: { origin: 'https://hub.example.test' } },
    fetch(url, options) {
      const call = { url, data: options.body }; calls.push(call);
      return new Promise((resolve, reject) => { call.finish = (body, status = 200) => resolve(Response.json(body, { status })); call.reject = reject; });
    },
  });
  await ui.flush();
  const field = (id) => ui.all((node) => node.props.id === id)[0];
  const submit = async () => ui.act(() => ui.all((node) => node.type === 'form')[0].props.onSubmit({ preventDefault() {}, currentTarget: {} }));
  const change = async (id, value) => ui.act(() => field(id).props.onChange({ target: { value } }));
  const settle = async (call, body, status) => { call.finish(body, status); await ui.flush(); };
  return { ui, calls, field, submit, change, settle };
}

test('support form preserves message, attachment and request ID across failed delivery retries', async () => {
  const app = await mount();
  await app.change('support-message', 'Please help with this guide.');
  const image = new File(['fixture-image'], 'screen.png', { type: 'image/png' });
  await app.ui.act(() => app.field('support-screenshot').props.onChange({ target: { files: [image] } }));
  await app.submit();
  assert.equal(app.calls.length, 1);
  assert.match(app.ui.text(), /Sending/);
  assert.doesNotMatch(app.ui.text(), /Your message has been sent/);
  const id = app.calls[0].data.get('requestId');
  await app.settle(app.calls[0], { error: 'Please retry.' }, 502);
  assert.equal(app.field('support-message').props.value, 'Please help with this guide.');
  await app.submit();
  assert.equal(app.calls[1].data.get('requestId'), id);
  assert.equal(app.calls[1].data.get('message'), 'Please help with this guide.');
  assert.equal(app.calls[1].data.get('screenshot').name, 'screen.png');
  await app.settle(app.calls[1], { ok: true, reference: id, replyEmail: 'actual@example.test' });
  assert.match(app.ui.text(), /Your message has been sent/);
  assert.match(app.ui.text(), /actual@example.test/);
  assert.equal(app.ui.all((node) => node.type === 'form').length, 0);
});

test('editing a definitely unsent request creates a new ID while unchanged retry retains its ID', async () => {
  const app = await mount(); await app.change('support-message', 'First message'); await app.submit();
  const original = app.calls[0].data.get('requestId');
  await app.settle(app.calls[0], { code: 'delivery_failed', error: 'Not sent.' }, 503);
  assert.equal(app.field('support-message').props.readOnly, false);
  await app.change('support-message', 'Updated message'); await app.submit();
  assert.notEqual(app.calls[1].data.get('requestId'), original);
  assert.equal(app.calls[1].data.get('message'), 'Updated message');
});

test('uncertain delivery preserves the report and reference and permanently stops this form sending again', async () => {
  const app = await mount({ signedInEmail: null });
  await app.change('support-email', 'member@example.test');
  await app.change('support-message', 'Please keep my original report.');
  const image = new File(['fixture-image'], 'screen.png', { type: 'image/png' });
  await app.ui.act(() => app.field('support-screenshot').props.onChange({ target: { files: [image] } }));
  await app.submit();
  const id = app.calls[0].data.get('requestId');
  await app.settle(app.calls[0], { code: 'delivery_uncertain', reference: id, error: 'Delivery is unconfirmed.' }, 502);
  assert.match(app.ui.text(), /Delivery could not be confirmed/);
  assert.match(app.ui.text(), /may have been sent/);
  assert.doesNotMatch(app.ui.text(), /Your message has been sent|Please try again|Check delivery/);
  assert.match(app.ui.text(), new RegExp(id));
  assert.equal(app.field('support-message').props.readOnly, true);
  assert.equal(app.field('support-email').props.readOnly, true);
  assert.equal(app.field('support-screenshot').props.disabled, true);
  assert.equal(app.ui.all((node) => node.type === 'button' && node.props.type === 'submit')[0].props.disabled, true);
  await app.change('support-message', 'Changed report');
  await app.change('support-email', 'changed@example.test');
  await app.ui.act(() => app.field('support-screenshot').props.onChange({ target: { files: [] } }));
  await app.ui.act(() => app.ui.all((node) => node.props.children === 'Remove screenshot')[0].props.onClick());
  await app.submit();
  assert.equal(app.calls.length, 1);
  assert.equal(app.field('support-message').props.value, 'Please keep my original report.');
  assert.equal(app.field('support-email').props.value, 'member@example.test');
  assert.match(app.ui.text(), /screen\.png/);
  const fallback = app.ui.all((node) => node.type === 'a' && node.props.href.startsWith('mailto:'))[0];
  assert.equal(fallback.props.href, `mailto:support@rebootmembers.com?subject=${encodeURIComponent(`Support follow-up: ${id}`)}`);
});

test('network failure freezes original payload and checks delivery with the same ID', async () => {
  const app = await mount({ signedInEmail: null });
  await app.change('support-email', 'member@example.test');
  await app.change('support-message', 'Original report');
  const image = new File(['fixture-image'], 'screen.png', { type: 'image/png' });
  await app.ui.act(() => app.field('support-screenshot').props.onChange({ target: { files: [image] } }));
  await app.submit();
  const id = app.calls[0].data.get('requestId');
  app.calls[0].reject(new Error('Network interrupted'));
  await app.ui.flush();
  assert.match(app.ui.text(), /Check delivery/);
  assert.equal(app.field('support-message').props.readOnly, true);
  await app.change('support-message', 'Would be a duplicate');
  await app.change('support-email', 'changed@example.test');
  await app.ui.act(() => app.ui.all((node) => node.props.children === 'Remove screenshot')[0].props.onClick());
  await app.submit();
  assert.equal(app.calls.length, 2);
  assert.equal(app.calls[1].data.get('requestId'), id);
  assert.equal(app.calls[1].data.get('message'), 'Original report');
  assert.equal(app.calls[1].data.get('email'), 'member@example.test');
  assert.equal(app.calls[1].data.get('screenshot').name, 'screen.png');
  await app.settle(app.calls[1], { code: 'delivery_uncertain', reference: id }, 409);
  await app.submit();
  assert.equal(app.calls.length, 2);
});

test('busy outcome keeps original request until a definite failure permits editing', async () => {
  const app = await mount(); await app.change('support-message', 'Original report'); await app.submit();
  const id = app.calls[0].data.get('requestId');
  await app.settle(app.calls[0], { error: 'A delivery is still in progress.', reference: id }, 409);
  assert.equal(app.field('support-message').props.readOnly, true);
  await app.change('support-message', 'Not yet allowed'); await app.submit();
  assert.equal(app.calls[1].data.get('requestId'), id);
  assert.equal(app.calls[1].data.get('message'), 'Original report');
  await app.settle(app.calls[1], { code: 'delivery_failed', error: 'Nothing was sent.' }, 502);
  assert.equal(app.field('support-message').props.readOnly, false);
  await app.change('support-message', 'Now editable'); await app.submit();
  assert.notEqual(app.calls[2].data.get('requestId'), id);
  assert.equal(app.calls[2].data.get('message'), 'Now editable');
});

test('validation after a lost response cannot unlock edits or create another request', async () => {
  for (const [status, code] of [[400, 'email_required'], [400, undefined], [413, undefined]]) {
    const app = await mount(); await app.change('support-message', 'Original report'); await app.submit();
    const id = app.calls[0].data.get('requestId');
    app.calls[0].reject(new Error('The first response was lost'));
    await app.ui.flush(); await app.submit();
    // A temporary configuration failure also cannot classify the earlier attempt.
    await app.settle(app.calls[1], { error: 'Support is temporarily unavailable.' }, 503);
    assert.equal(app.field('support-message').props.readOnly, true);
    assert.match(app.ui.text(), /Check delivery/);
    await app.submit();
    assert.equal(app.calls[2].data.get('requestId'), id);
    await app.settle(app.calls[2], { code, error: 'This check was rejected.' }, status);
    assert.match(app.ui.text(), /Delivery could not be confirmed/);
    assert.match(app.ui.text(), new RegExp(id));
    assert.equal(app.field('support-message').props.readOnly, true);
    await app.change('support-message', 'Would be a duplicate'); await app.submit();
    assert.equal(app.field('support-message').props.value, 'Original report');
    assert.equal(app.calls.length, 3);
    app.ui.unmount();
  }
});

test('rejected image validation allows replacement with a fresh request ID', async () => {
  const app = await mount(); await app.change('support-message', 'Original report');
  const image = new File(['invalid-image'], 'bad.png', { type: 'image/png' });
  await app.ui.act(() => app.field('support-screenshot').props.onChange({ target: { files: [image] } }));
  await app.submit();
  const id = app.calls[0].data.get('requestId');
  await app.settle(app.calls[0], { error: 'The screenshot could not be processed.' }, 400);
  assert.equal(app.field('support-screenshot').props.disabled, false);
  const replacement = new File(['replacement-image'], 'replacement.png', { type: 'image/png' });
  await app.ui.act(() => app.field('support-screenshot').props.onChange({ target: { files: [replacement] } }));
  await app.submit();
  assert.notEqual(app.calls[1].data.get('requestId'), id);
  assert.equal(app.calls[1].data.get('screenshot').name, 'replacement.png');
});

test('expired session reveals the reply email field and keeps the message for resubmission', async () => {
  const app = await mount();
  assert.equal(app.field('support-email'), undefined);
  await app.change('support-message', 'I need login help.'); await app.submit();
  assert.equal(app.calls[0].data.get('signedIn'), '1');
  await app.settle(app.calls[0], { code: 'email_required', error: 'Confirm your email.' }, 400);
  assert.equal(app.field('support-email').props.required, true);
  assert.equal(app.field('support-message').props.value, 'I need login help.');
  await app.submit();
  assert.equal(app.calls[1].data.get('signedIn'), '0');
  assert.equal(app.calls[1].data.get('email'), 'member@example.test');
});

test('unconfigured form cannot submit and a non-success payload never becomes confirmation', async () => {
  const unavailable = await mount({ available: false });
  await unavailable.change('support-message', 'Help'); await unavailable.submit();
  assert.equal(unavailable.calls.length, 0);
  const app = await mount({ signedInEmail: null });
  assert.equal(app.field('support-email').props.required, true);
  await app.change('support-email', 'guest@example.test');
  await app.change('support-message', 'Help'); await app.submit();
  await app.settle(app.calls[0], { error: 'Try again.' }, 200);
  assert.doesNotMatch(app.ui.text(), /Your message has been sent/);
  assert.equal(app.field('support-message').props.value, 'Help');
  assert.equal(app.field('support-message').props.readOnly, true);
});
