import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import tls from 'node:tls';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import ts from 'typescript';
import { key, cert } from './fixtures/supportSmtpTls.mjs';

const require = createRequire(import.meta.url);
function load(file, overrides = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => overrides[name] ?? require(name), loaded, loaded.exports);
  return loaded.exports;
}
const { sendSupportEmail, SupportDeliveryError } = load('src/lib/supportServer.ts', { './support': load('src/lib/support.ts') });
const payload = { from: 'support@reboot.test', to: ['inbox@reboot.test'], reply_to: 'student@example.test', subject: 'Synthetic local test', text: 'This never leaves localhost.', attachments: [{ filename: 'screenshot.png', content: 'c3ludGhldGlj' }] };

// Minimal synthetic server: only loopback, test credentials, and no relay capability.
async function smtpServer({ secure = false, behavior = 'accept' } = {}) {
  const commands = [], messages = [], sockets = new Set();
  const context = tls.createSecureContext({ key, cert });
  const attach = (socket, encrypted, greet = true) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    let buffer = '', receiving = false, message = '';
    const onData = data => {
      buffer += data.toString('utf8');
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n');
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (receiving) {
          if (line !== '.') { message += `${line}\r\n`; continue; }
          messages.push(message);
          receiving = false;
          if (behavior === 'disconnect-after-data') { socket.destroy(); return; }
          socket.write(behavior === 'reject-data' ? '550 message rejected\r\n' : '250 queued locally\r\n');
          continue;
        }
        const verb = line.split(' ')[0].toUpperCase();
        commands.push({ verb, encrypted });
        if (verb === 'EHLO' || verb === 'HELO') {
          socket.write(`250-localhost\r\n${!encrypted && behavior !== 'no-starttls' ? '250-STARTTLS\r\n' : ''}250 AUTH PLAIN\r\n`);
        } else if (verb === 'STARTTLS') {
          if (behavior === 'no-starttls') { socket.write('502 STARTTLS unavailable\r\n'); continue; }
          socket.removeListener('data', onData);
          socket.write('220 start TLS\r\n', () => {
            const upgraded = new tls.TLSSocket(socket, { isServer: true, secureContext: context });
            attach(upgraded, true, false);
          });
          return;
        } else if (verb === 'AUTH') {
          assert.equal(encrypted, true, 'credentials must never be sent without TLS');
          socket.write(behavior === 'reject-auth' ? '535 invalid credentials\r\n' : '235 authenticated\r\n');
        } else if (verb === 'MAIL' || verb === 'RCPT') {
          assert.equal(encrypted, true, 'envelope must never be sent without TLS');
          socket.write('250 ok\r\n');
        } else if (verb === 'DATA') {
          receiving = true;
          socket.write('354 send message\r\n');
        } else if (verb === 'QUIT') {
          socket.end('221 bye\r\n');
        } else socket.write('500 unsupported command\r\n');
      }
    };
    socket.on('data', onData);
    if (greet) socket.write('220 localhost synthetic SMTP\r\n');
  };
  const server = secure ? tls.createServer({ key, cert }, socket => attach(socket, true)) : net.createServer(socket => attach(socket, false));
  server.on('tlsClientError', () => {});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    commands, messages,
    config: { smtp: { host: 'localhost', port: server.address().port, secure, user: 'synthetic-user', password: 'synthetic-password' }, from: payload.from, to: payload.to[0], rateLimitSecret: 'synthetic-only-secret-at-least-32-characters' },
    async close() { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); },
  };
}

// Trust only this synthetic fixture CA, retaining hostname and certificate checks.
const localTransport = options => nodemailer.createTransport({ ...options, host: '127.0.0.1', tls: { ...options.tls, ca: cert } });

for (const secure of [false, true]) {
  test(`real SMTP protocol sends through ${secure ? 'implicit TLS' : 'required STARTTLS'}`, async () => {
    const server = await smtpServer({ secure });
    try {
      const id = randomUUID();
      assert.equal(await sendSupportEmail(server.config, id, payload, localTransport), `<reboot-support.${id}@reboot.test>`);
      assert.equal(server.messages.length, 1);
      assert.ok(server.commands.some(command => command.verb === 'AUTH' && command.encrypted));
      assert.match(server.messages[0], /Reply-To: student@example\.test/);
      assert.match(server.messages[0], /filename=screenshot\.png/);
      assert.match(server.messages[0].replace(/\r\n[ \t]+/g, ' '), new RegExp(`Message-ID: <reboot-support.${id}@reboot.test>`));
      assert.equal(server.commands.some(command => command.verb === 'STARTTLS'), !secure);
    } finally { await server.close(); }
  });
}

for (const [behavior, safe] of [['no-starttls', true], ['reject-auth', true], ['reject-data', true], ['disconnect-after-data', false]]) {
  test(`real SMTP ${behavior} is ${safe ? 'definitely unsent' : 'uncertain'}`, async () => {
    const server = await smtpServer({ behavior });
    try {
      await assert.rejects(() => sendSupportEmail(server.config, randomUUID(), payload, localTransport), error => error instanceof SupportDeliveryError && error.safeToRetry === safe);
      if (behavior === 'no-starttls') assert.ok(!server.commands.some(command => command.verb === 'AUTH' || command.verb === 'DATA'));
      if (behavior === 'reject-auth') assert.ok(!server.commands.some(command => command.verb === 'DATA'));
      if (behavior.endsWith('data')) assert.equal(server.messages.length, 1);
    } finally { await server.close(); }
  });
}

test('real SMTP rejects an untrusted TLS certificate before credentials or message', async () => {
  const server = await smtpServer({ secure: true });
  try {
    await assert.rejects(() => sendSupportEmail(server.config, randomUUID(), payload, options => nodemailer.createTransport({ ...options, host: '127.0.0.1' })), error => error instanceof SupportDeliveryError);
    assert.ok(!server.commands.some(command => command.verb === 'AUTH' || command.verb === 'DATA'));
  } finally { await server.close(); }
});
