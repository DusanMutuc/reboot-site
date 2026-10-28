import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
function load(file, overrides = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const loadedModule = { exports: {} };
  new Function('require', 'module', 'exports', js)((name) => overrides[name] ?? require(name), loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const shared = load('src/lib/support.ts');
const { getSupportConfig, handleSupportRequest, readSupportForm, supportScreenshot, sendSupportEmail, SupportDeliveryError } = load('src/lib/supportServer.ts', { './support': shared });
const config = { smtp: { host: 'smtp.example.test', port: 587, secure: false, user: 'test-user', password: 'test-password' }, from: 'support@reboot.test', to: 'inbox@reboot.test', rateLimitSecret: 'test-only-secret-at-least-32-characters' };
const origin = 'https://hub.reboot.test';
function request(values = {}, options = {}) {
  const body = new FormData();
  for (const [key, value] of Object.entries({ requestId: randomUUID(), message: 'I cannot open the lesson.', email: 'guest@example.test', ...values })) {
    if (value !== undefined) body.set(key, value);
  }
  return new Request(`${origin}/api/support`, { method: 'POST', body, headers: { origin, ...options } });
}
function fixture({ identity = null, outcome = null, sendError = false, finishError = false, storedPayload = null, configured = true, reserveAccepted = true } = {}) {
  const reserved = [], sent = [], finished = [], attached = [], decoded = [];
  const deps = {
    config: configured ? config : null, network: 'test-network',
    async identity() { return identity; },
    repository() { return {
      async prepare(value) { reserved.push(value); return { outcome: outcome ?? (storedPayload ? 'ready' : 'prepare'), delivery_payload: storedPayload }; },
      async reserve(...args) { attached.push(args); return reserveAccepted; },
      async finish(...args) { finished.push(args); if (finishError) throw new Error('Database unavailable'); },
    }; },
    async send(...args) { sent.push(args); if (sendError) throw sendError === true ? new Error('Provider unavailable') : sendError; return 'provider-123'; },
    async decode(file) { decoded.push(file); return supportScreenshot(file); },
  };
  return { deps, reserved, sent, finished, attached, decoded };
}

test('support requires explicit complete delivery configuration and never has a fallback inbox', () => {
  assert.equal(getSupportConfig({}), null);
  const env = { SUPPORT_TO_EMAIL: config.to, SUPPORT_FROM_EMAIL: config.from, SUPPORT_RATE_LIMIT_SECRET: config.rateLimitSecret, SUPPORT_SMTP_HOST: config.smtp.host, SUPPORT_SMTP_PORT: '587', SUPPORT_SMTP_SECURE: 'false', SUPPORT_SMTP_USER: config.smtp.user, SUPPORT_SMTP_PASSWORD: config.smtp.password };
  assert.deepEqual(getSupportConfig(env), config);
  for (const key of Object.keys(env)) assert.equal(getSupportConfig({ ...env, [key]: '' }), null, key);
  for (const [key, value] of [['SUPPORT_SMTP_HOST', 'smtp://invalid.test'], ['SUPPORT_SMTP_HOST', '127.0.0.1'], ['SUPPORT_SMTP_PORT', '0'], ['SUPPORT_SMTP_PORT', '65536'], ['SUPPORT_SMTP_PORT', '587.5'], ['SUPPORT_SMTP_SECURE', 'optional'], ['SUPPORT_RATE_LIMIT_SECRET', 'short']]) assert.equal(getSupportConfig({ ...env, [key]: value }), null);
  assert.equal(getSupportConfig({ ...env, SUPPORT_SMTP_PASSWORD: ' keep spaces ' }).smtp.password, ' keep spaces ');
});

test('context includes only same-origin path, never recovery tokens or another origin', () => {
  assert.equal(shared.supportPagePath('/reset-password?token=secret#access_token=secret'), '/reset-password');
  assert.equal(shared.supportPagePath(`${origin}/courses/example?email=x#secret`, origin), '/courses/example');
  for (const value of ['https://evil.test/x', '//evil.test/x', '/\\evil.test', 'javascript:alert(1)']) assert.equal(shared.supportPagePath(value, origin), null);
  assert.equal(shared.supportPagePath('https://evil.test/x'), null);
});

test('missing configuration and cross-origin submissions cause no writes or emails', async () => {
  for (const [opts, headers, status] of [[{ configured: false }, {}, 503], [{}, { origin: 'https://evil.test' }, 403]]) {
    const f = fixture(opts);
    assert.equal((await handleSupportRequest(request({}, headers), f.deps)).status, status);
    assert.equal(f.reserved.length, 0); assert.equal(f.sent.length, 0);
  }
});

test('signed-in identity overrides submitted email/user ID; message and path are retained', async () => {
  const f = fixture({ identity: { id: 'verified-user', email: 'member@example.test', name: 'Member Name' } });
  const res = await handleSupportRequest(request({ email: 'attacker@example.test', userId: 'forged', pagePath: '/library/item?token=secret' }), f.deps);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).replyEmail, 'member@example.test');
  assert.equal(f.reserved[0]._user_id, 'verified-user');
  assert.equal(f.reserved[0]._page_path, '/library/item');
  assert.equal(f.sent[0][2].reply_to, 'member@example.test');
  assert.ok(!JSON.stringify(f.reserved).includes('secret'));
  assert.match(f.reserved[0]._actor_key, /^[a-f0-9]{64}$/);
});

test('guests can request login help without an account lookup; email and message are required', async () => {
  const f = fixture();
  assert.equal((await handleSupportRequest(request(), f.deps)).status, 200);
  assert.equal(f.reserved[0]._user_id, null);
  assert.match(f.sent[0][2].text, /email not verified/);
  for (const values of [{ email: '' }, { email: 'bad\r\nBcc: other@example.test' }, { message: ' ' }, { message: 'a'.repeat(5001) }, { website: 'spam' }]) {
    const invalid = fixture();
    assert.equal((await handleSupportRequest(request(values), invalid.deps)).status, 400);
    assert.equal(invalid.sent.length, 0);
  }
});

test('a lost session asks for explicit reply email confirmation before creating a request', async () => {
  const f = fixture();
  const res = await handleSupportRequest(request({ signedIn: '1', email: 'previous@example.test' }), f.deps);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'email_required');
  assert.equal(f.reserved.length, 0);
});

test('screenshots are decoded, sanitized and attached with a fixed safe filename', async () => {
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#abcdef' } }).jpeg().toBuffer();
  const f = fixture();
  const res = await handleSupportRequest(request({ screenshot: new File([image], '../../private.jpg', { type: 'image/jpeg' }) }), f.deps);
  assert.equal(res.status, 200);
  const attachment = f.sent[0][2].attachments[0];
  assert.equal(attachment.filename, 'screenshot.png');
  const metadata = await sharp(Buffer.from(attachment.content, 'base64')).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.exif, undefined);
  for (const file of [new File(['<svg/>'], 'fake.png', { type: 'image/png' }), new File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' }), new File([new Uint8Array(shared.SUPPORT_IMAGE_LIMIT + 1)], 'large.png', { type: 'image/png' })]) {
    await assert.rejects(() => supportScreenshot(file));
  }
});

test('streaming request limit is enforced even without Content-Length', async () => {
  const huge = new Request(`${origin}/api/support`, { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: new Uint8Array(shared.SUPPORT_IMAGE_LIMIT + 32769) });
  await assert.rejects(() => readSupportForm(huge), /2 MB/);
});

test('unknown delivery failures and post-acceptance persistence failures are quarantined', async () => {
  for (const options of [{ sendError: true }, { finishError: true }]) {
    const f = fixture(options);
    const res = await handleSupportRequest(request(), f.deps);
    assert.ok(res.status >= 500);
    const body = await res.json();
    assert.notEqual(body.ok, true);
    assert.equal(body.code, 'delivery_uncertain');
    assert.ok(body.reference);
    assert.equal(f.finished.at(-1)[2], 'uncertain');
    assert.equal(f.sent.length, 1);
  }
});

test('definite pre-acceptance failures permit retry only after durable acknowledgement', async () => {
  for (const finishError of [false, true]) {
    const f = fixture({ sendError: new SupportDeliveryError(true), finishError });
    const res = await handleSupportRequest(request(), f.deps);
    assert.equal((await res.json()).code, finishError ? 'delivery_uncertain' : 'delivery_failed');
    assert.equal(f.finished[0][2], 'retryable_failure');
    assert.equal(f.sent.length, 1);
  }
});

test('already sent, busy, expired and throttled reservations never trigger another email', async () => {
  for (const [outcome, status] of [['sent', 200], ['busy', 409], ['conflict', 409], ['expired', 409], ['needs_review', 409], ['rate_limited', 429]]) {
    const f = fixture({ outcome });
    // Deliberately invalid pixels: these branches must reject before decoding.
    const res = await handleSupportRequest(request({ screenshot: new File(['not-an-image'], 'screen.png', { type: 'image/png' }) }), f.deps);
    assert.equal(res.status, status);
    assert.equal(f.sent.length, 0);
    assert.equal(f.decoded.length, 0);
    assert.equal(f.attached.length, 0);
    if (status === 429) assert.equal(res.headers.get('retry-after'), '3600');
    if (['expired', 'needs_review', 'conflict'].includes(outcome)) assert.equal((await res.json()).code, 'delivery_uncertain');
  }
});

test('retry uses the exact previously reserved provider payload', async () => {
  const storedPayload = { from: 'old@reboot.test', to: ['old-inbox@reboot.test'], reply_to: 'guest@example.test', subject: 'Stored request', text: 'Stored request' };
  const f = fixture({ storedPayload });
  assert.equal((await handleSupportRequest(request(), f.deps)).status, 200);
  assert.deepEqual(f.sent[0][2], storedPayload);
  assert.equal(f.decoded.length, 0);
  assert.equal(f.attached.length, 0);
});

test('invalid images consume an admission and release its lease without reserving or sending a payload', async () => {
  const f = fixture();
  const res = await handleSupportRequest(request({ screenshot: new File(['invalid'], 'screen.png', { type: 'image/png' }) }), f.deps);
  assert.equal(res.status, 400);
  assert.equal(f.reserved.length, 1, 'durable admission happens before decode');
  assert.equal(f.decoded.length, 1);
  assert.equal(f.attached.length, 0);
  assert.equal(f.sent.length, 0);
  assert.equal(f.finished[0][2], 'retryable_failure');
});

test('expired preparation lease prevents sending even after successful decoding', async () => {
  const f = fixture({ reserveAccepted: false });
  const res = await handleSupportRequest(request(), f.deps);
  assert.equal(res.status, 503);
  assert.equal(f.reserved.length, 1);
  assert.equal(f.attached.length, 1);
  assert.equal(f.sent.length, 0);
  assert.equal((await res.json()).code, undefined, 'a competing worker may own the send; do not unlock edits');
});

test('SMTP requires verified TLS and auth; maps payload without trusting files or remote URLs', async () => {
  const id = randomUUID();
  const payload = { from: config.from, to: [config.to], reply_to: 'member@example.test', subject: 'Support', text: 'Help', attachments: [{ filename: 'screenshot.png', content: 'aGVscA==' }] };
  for (const secure of [true, false]) {
    let options, mail, closed = 0;
    const reference = await sendSupportEmail({ ...config, smtp: { ...config.smtp, secure } }, id, payload, value => {
      options = value;
      return { async sendMail(value) { mail = value; return { response: '250 queued', accepted: payload.to, rejected: [] }; }, close() { closed++; } };
    });
    assert.equal(reference, `<reboot-support.${id}@reboot.test>`);
    assert.equal(mail.messageId, reference);
    assert.equal(mail.replyTo, payload.reply_to);
    assert.equal(mail.attachments[0].encoding, 'base64');
    assert.equal(options.secure, secure);
    assert.equal(options.requireTLS, !secure);
    assert.equal(options.ignoreTLS, false);
    assert.equal(options.opportunisticTLS, false);
    assert.equal(options.tls.rejectUnauthorized, true);
    assert.equal(options.tls.minVersion, 'TLSv1.2');
    assert.equal(options.forceAuth, true);
    assert.equal(options.disableFileAccess, true);
    assert.equal(options.disableUrlAccess, true);
    assert.equal(closed, 1);
  }
});

test('SMTP error classification defaults to uncertain and never exposes server details', async () => {
  const payload = { from: config.from, to: [config.to], reply_to: 'member@example.test', subject: 'Support', text: 'Help' };
  for (const [details, safe] of [[{ code: 'EAUTH' }, true], [{ code: 'EDNS' }, true], [{ code: 'ETLS' }, true], [{ timeoutType: 'GREETING_TIMEOUT' }, true], [{ command: 'DATA', responseCode: 550 }, true], [{ command: 'RCPT TO', responseCode: 450 }, true], [{ command: 'CONN', code: 'ECONNECTION' }, false], [{ command: 'CONN', responseCode: 421 }, false], [{ timeoutType: 'SOCKET_TIMEOUT' }, false], [{ code: 'ESOCKET' }, false], [{}, false]]) {
    await assert.rejects(() => sendSupportEmail(config, randomUUID(), payload, () => ({ async sendMail() { throw Object.assign(new Error('sensitive detail'), details); }, close() {} })), error => error instanceof SupportDeliveryError && error.safeToRetry === safe && !error.message.includes('sensitive'));
  }
});

test('SMTP missing final acceptance is uncertain even if sendMail resolves', async () => {
  const payload = { from: config.from, to: [config.to], reply_to: 'member@example.test', subject: 'Support', text: 'Help' };
  for (const result of [{}, { response: '250 queued', accepted: [] }, { response: '250 queued', accepted: payload.to, rejected: ['another@example.test'] }]) {
    await assert.rejects(() => sendSupportEmail(config, randomUUID(), payload, () => ({ async sendMail() { return result; }, close() {} })), error => error.safeToRetry === false);
  }
});

test('the overall SMTP deadline closes transport and remains uncertain', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let closed = 0;
  const payload = { from: config.from, to: [config.to], reply_to: 'member@example.test', subject: 'Support', text: 'Help' };
  const pending = sendSupportEmail(config, randomUUID(), payload, () => ({ sendMail() { return new Promise(() => {}); }, close() { closed++; } }));
  const rejection = assert.rejects(pending, error => error.safeToRetry === false);
  t.mock.timers.tick(18_000);
  await rejection;
  assert.ok(closed >= 1);
});
