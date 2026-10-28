import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createConnection, isIP, type Socket } from 'node:net';
import nodemailer, { type SendMailOptions } from 'nodemailer';
import type { SMTPTransportOptions, SMTPSentMessageInfo } from 'nodemailer/lib/smtp-transport';
import sharp from 'sharp';
import { SUPPORT_IMAGE_LIMIT, SUPPORT_IMAGE_TYPES, SUPPORT_MESSAGE_LIMIT, supportEmail, supportPagePath } from './support';

export type SupportConfig = {
  smtp: { host: string; port: number; secure: boolean; user: string; password: string };
  from: string; to: string; rateLimitSecret: string;
};
export type SupportIdentity = { id: string; email: string; name: string | null } | null;
export type SupportEmailPayload = {
  from: string; to: string[]; reply_to: string; subject: string; text: string;
  attachments?: { filename: string; content: string }[];
};
export type SupportReservation = {
  outcome: 'prepare' | 'ready' | 'sent' | 'busy' | 'conflict' | 'rate_limited' | 'expired' | 'needs_review';
  delivery_payload: SupportEmailPayload | null;
};
export type SupportRepository = {
  prepare(values: Record<string, unknown>): Promise<SupportReservation>;
  reserve(id: string, lease: string, payload: SupportEmailPayload): Promise<boolean>;
  finish(id: string, lease: string, outcome: 'sent' | 'retryable_failure' | 'uncertain', providerId?: string | null): Promise<void>;
};
type Dependencies = {
  config: SupportConfig | null;
  identity(): Promise<SupportIdentity>;
  repository(): SupportRepository;
  network: string;
  send?: typeof sendSupportEmail;
  decode?: typeof supportScreenshot;
};

export function getSupportConfig(env: NodeJS.ProcessEnv = process.env): SupportConfig | null {
  const from = supportEmail(env.SUPPORT_FROM_EMAIL);
  const to = supportEmail(env.SUPPORT_TO_EMAIL);
  const host = env.SUPPORT_SMTP_HOST?.trim();
  const portValue = env.SUPPORT_SMTP_PORT?.trim() ?? '';
  const port = Number(portValue);
  const secure = env.SUPPORT_SMTP_SECURE?.trim();
  const user = env.SUPPORT_SMTP_USER?.trim();
  const password = env.SUPPORT_SMTP_PASSWORD;
  const rateLimitSecret = env.SUPPORT_RATE_LIMIT_SECRET?.trim();
  if (!from || !to || !host || host.length > 253 || isIP(host)
    || !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
    || !/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 1 || port > 65535
    || (secure !== 'true' && secure !== 'false') || !user || /[\r\n\0]/.test(user)
    || !password?.trim() || !rateLimitSecret || rateLimitSecret.length < 32) return null;
  return { from, to, smtp: { host, port, secure: secure === 'true', user, password }, rateLimitSecret };
}

function response(body: Record<string, unknown>, status: number, retryAfter?: number) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) },
  });
}

class SupportInputError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export async function readSupportForm(request: Request): Promise<FormData> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.startsWith('multipart/form-data;')) throw new SupportInputError('Please submit the support form.');
  const limit = SUPPORT_IMAGE_LIMIT + 32 * 1024;
  if (Number(request.headers.get('content-length')) > limit) throw new SupportInputError('Your screenshot must be 2 MB or smaller.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new SupportInputError('Please include a message.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new SupportInputError('Your screenshot must be 2 MB or smaller.', 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return await new Request(request.url, { method: 'POST', headers: { 'content-type': type }, body: bytes }).formData();
  } catch (error) {
    if (error instanceof SupportInputError) throw error;
    throw new SupportInputError('The attachment could not be read. Please choose it again.');
  }
}

/** Decode raster images, limit decompression size, and remove metadata/extra content. */
export async function supportScreenshot(file: FormDataEntryValue | null): Promise<Buffer | null> {
  if (!file || (typeof file !== 'string' && file.size === 0)) return null;
  if (typeof file === 'string' || !SUPPORT_IMAGE_TYPES.includes(file.type)) {
    throw new SupportInputError('Choose a PNG, JPG, or WebP screenshot.');
  }
  if (file.size > SUPPORT_IMAGE_LIMIT) throw new SupportInputError('Your screenshot must be 2 MB or smaller.', 413);
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, { limitInputPixels: 20_000_000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!metadata.format || !['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) !== 1) throw new Error('Unsupported image');
    const cleaned = await image.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    if (cleaned.length > SUPPORT_IMAGE_LIMIT) throw new SupportInputError('Please use a smaller screenshot (under 2 MB).', 413);
    return cleaned;
  } catch (error) {
    if (error instanceof SupportInputError) throw error;
    throw new SupportInputError('This screenshot could not be opened. Please choose another PNG, JPG, or WebP image.');
  }
}

export class SupportDeliveryError extends Error {
  constructor(readonly safeToRetry: boolean) {
    super(safeToRetry ? 'Support delivery failed before acceptance' : 'Support delivery could not be confirmed');
  }
}

type SupportSmtpTransport = {
  sendMail(message: SendMailOptions): Promise<SMTPSentMessageInfo>;
  close(): void;
};
type SupportSmtpFactory = (options: SMTPTransportOptions) => SupportSmtpTransport;

function definitelyNotAccepted(error: unknown): boolean {
  if (error instanceof SupportDeliveryError) return error.safeToRetry;
  if (!error || typeof error !== 'object') return false;
  const details = error as { code?: string; command?: string; responseCode?: number; timeoutType?: string };
  if (details.code === 'EAUTH' || details.code === 'EDNS' || details.code === 'ETLS') return true;
  if (['CONNECT_TIMEOUT', 'GREETING_TIMEOUT', 'UPGRADE_TIMEOUT'].includes(details.timeoutType ?? '')) return true;
  // A generic connection/socket error (even command=CONN) can happen after DATA.
  // Only a definite negative reply to the transaction establishes non-acceptance.
  return typeof details.responseCode === 'number' && details.responseCode >= 400 && details.responseCode < 600
    && /^(?:EHLO|HELO|STARTTLS|AUTH(?: .*)?|MAIL FROM|RCPT TO|DATA)$/.test(details.command ?? '');
}

export async function sendSupportEmail(
  config: SupportConfig, id: string, payload: SupportEmailPayload,
  createTransport: SupportSmtpFactory = options => nodemailer.createTransport(options),
): Promise<string> {
  let socket: Socket | undefined;
  let socketTimer: ReturnType<typeof setTimeout> | undefined;
  let transport: SupportSmtpTransport | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  // Message-ID is a reference only: SMTP servers do not promise deduplication.
  const messageId = `<reboot-support.${id}@${payload.from.split('@')[1]}>`;
  try {
    transport = createTransport({
      host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
      requireTLS: !config.smtp.secure, ignoreTLS: false, opportunisticTLS: false,
      auth: { user: config.smtp.user, pass: config.smtp.password }, forceAuth: true,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: config.smtp.host },
      connectionTimeout: 8_000, greetingTimeout: 5_000, socketTimeout: 10_000, dnsTimeout: 5_000,
      disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
      // Keep a handle to the underlying socket: single-message transport.close()
      // alone does not terminate an active send. Nodemailer performs TLS itself.
      getSocket(options, callback) {
        if (stopped) { callback(new SupportDeliveryError(true)); return; }
        socket = createConnection({ host: options.host!, port: Number(options.port) });
        let returned = false;
        const fail = () => {
          if (returned) return;
          returned = true;
          clearTimeout(socketTimer);
          socket?.destroy();
          callback(new SupportDeliveryError(true));
        };
        socketTimer = setTimeout(fail, 8_000);
        socket.once('error', fail);
        socket.once('connect', () => {
          if (returned || stopped) { socket?.destroy(); return; }
          returned = true;
          clearTimeout(socketTimer);
          socket?.removeListener('error', fail);
          callback(null, { connection: socket });
        });
      },
    });
    const result = await Promise.race([
      transport.sendMail({
        from: payload.from, to: payload.to, replyTo: payload.reply_to,
        subject: payload.subject, text: payload.text, messageId,
        attachments: payload.attachments?.map(item => ({ ...item, encoding: 'base64', contentType: 'image/png' })),
        disableFileAccess: true, disableUrlAccess: true,
      }),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => {
          stopped = true;
          socket?.destroy();
          transport?.close();
          // A timeout or destroyed socket cannot prove the server did not accept.
          reject(new SupportDeliveryError(false));
        }, 18_000);
      }),
    ]);
    if (!/^2\d\d(?:[ -]|$)/.test(result.response ?? '') || result.rejected?.length
      || !payload.to.every(address => result.accepted?.includes(address))) throw new SupportDeliveryError(false);
    return messageId;
  } catch (error) {
    // Never expose SMTP replies, credentials, message text or recipient addresses.
    throw new SupportDeliveryError(definitelyNotAccepted(error));
  } finally {
    stopped = true;
    clearTimeout(deadline);
    clearTimeout(socketTimer);
    socket?.destroy();
    transport?.close();
  }
}

export async function handleSupportRequest(request: Request, deps: Dependencies): Promise<Response> {
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    return response({ error: 'Please send your message from the Reboot support page.' }, 403);
  }
  if (!deps.config) return response({ error: 'The support form is not available yet. Please try again later.' }, 503);
  try {
    const form = await readSupportForm(request);
    if (String(form.get('website') ?? '').trim()) return response({ error: 'Your message could not be submitted.' }, 400);
    const id = String(form.get('requestId') ?? '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new SupportInputError('Please reload the support form and try again.');
    const message = String(form.get('message') ?? '').trim();
    if (!message || message.length > SUPPORT_MESSAGE_LIMIT || message.includes('\0')) throw new SupportInputError(`Please enter a message of up to ${SUPPORT_MESSAGE_LIMIT.toLocaleString()} characters.`);
    const identity = await deps.identity();
    if (!identity && form.get('signedIn') === '1') {
      return response({ error: 'Your session has ended. Confirm your email below so we can reply.', code: 'email_required' }, 400);
    }
    const email = supportEmail(identity?.email ?? form.get('email'));
    if (!email) return response({ error: 'Enter your email so we can reply.', code: 'email_required' }, 400);
    const pagePath = supportPagePath(String(form.get('pagePath') ?? ''), origin);
    const file = form.get('screenshot');
    if (typeof file === 'string' || (file && file.size > 0 && !SUPPORT_IMAGE_TYPES.includes(file.type))) throw new SupportInputError('Choose a PNG, JPG, or WebP screenshot.');
    if (file && file.size > SUPPORT_IMAGE_LIMIT) throw new SupportInputError('Your screenshot must be 2 MB or smaller.', 413);
    // Hash only the bounded compressed bytes here. Image decoding must wait for
    // durable quota admission so rejected requests cannot repeatedly run sharp.
    const imageHash = file?.size ? createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex') : null;
    const digest = (value: string) => createHash('sha256').update(value).digest('hex');
    const keyed = (value: string) => createHmac('sha256', deps.config!.rateLimitSecret).update(value).digest('hex');
    const fingerprint = digest(JSON.stringify([identity?.id ?? null, email, message, pagePath, imageHash]));
    const lease = randomUUID();
    const repository = deps.repository();
    const reserved = await repository.prepare({
      _id: id, _user_id: identity?.id ?? null, _reply_email: email, _message: message, _page_path: pagePath,
      _fingerprint: fingerprint, _actor_key: keyed(`email:${email}`), _network_key: keyed(`network:${deps.network}`),
      _lease: lease,
    });
    if (reserved.outcome === 'sent') return response({ ok: true, reference: id, replyEmail: email }, 200);
    if (reserved.outcome === 'rate_limited') return response({ error: 'You have sent several requests recently. Please wait an hour before trying again.' }, 429, 3600);
    if (reserved.outcome === 'busy') return response({ error: 'Your message is still being sent. Please try again in a moment.', reference: id }, 409, 30);
    if (reserved.outcome === 'expired' || reserved.outcome === 'needs_review') return response({ error: 'We could not confirm delivery. Please keep this reference and ask your coach to check it before sending again.', code: 'delivery_uncertain', reference: id }, 409);
    if (reserved.outcome === 'conflict') return response({ error: 'This request no longer matches its earlier submission. Keep this reference and ask your coach to check it before sending again.', code: 'delivery_uncertain', reference: id }, 409);
    let payload = reserved.delivery_payload;
    if (reserved.outcome === 'prepare') {
      try {
        const screenshot = await (deps.decode ?? supportScreenshot)(file);
        payload = {
          from: deps.config.from, to: [deps.config.to], reply_to: email,
          subject: `Reboot support · ${id}`,
          text: [
            `Support request: ${id}`, `Reply email: ${email}`,
            `Member: ${identity?.name || (identity ? 'Signed-in member' : 'Signed out (email not verified)')}`,
            `User ID: ${identity?.id ?? 'Not signed in'}`, `Page: ${pagePath ?? 'Not provided'}`,
            '', message,
          ].join('\n'),
          ...(screenshot ? { attachments: [{ filename: 'screenshot.png', content: screenshot.toString('base64') }] } : {}),
        };
      } catch (error) {
        await repository.finish(id, lease, 'retryable_failure').catch(() => {});
        throw error;
      }
      // A lost lease or ambiguous DB acknowledgement may mean another worker
      // owns this ID. Preserve the original request for checking, never resend.
      if (!await repository.reserve(id, lease, payload)) throw new Error('Support preparation lease expired');
    } else if (reserved.outcome !== 'ready') {
      throw new Error('Unexpected support reservation');
    }
    if (!payload) throw new Error('Missing reserved support payload');
    let providerId: string;
    try {
      providerId = await (deps.send ?? sendSupportEmail)(deps.config, id, payload);
    } catch (error) {
      const safe = error instanceof SupportDeliveryError && error.safeToRetry;
      try {
        await repository.finish(id, lease, safe ? 'retryable_failure' : 'uncertain');
      } catch {
        // Without the durable acknowledgement the request remains locked, even
        // when this particular send definitely failed before acceptance.
        return response({ error: 'We could not confirm delivery. Keep this reference and ask your coach to check it before sending again.', code: 'delivery_uncertain', reference: id }, 502);
      }
      return response({
        error: safe ? 'Your message was not sent. Your text is still here; please try again.'
          : 'We could not confirm delivery. Keep this reference and ask your coach to check it before sending again.',
        code: safe ? 'delivery_failed' : 'delivery_uncertain', reference: id,
      }, 502);
    }
    try {
      await repository.finish(id, lease, 'sent', providerId);
    } catch {
      await repository.finish(id, lease, 'uncertain', providerId).catch(() => {});
      return response({ error: 'Delivery was accepted, but we could not save its confirmation. Keep this reference and ask your coach to check it before sending again.', code: 'delivery_uncertain', reference: id }, 503);
    }
    return response({ ok: true, reference: id, replyEmail: email }, 200);
  } catch (error) {
    if (error instanceof SupportInputError) return response({ error: error.message }, error.status);
    return response({ error: 'We could not confirm your message was sent. Please try again; your text has been kept.' }, 503);
  }
}
