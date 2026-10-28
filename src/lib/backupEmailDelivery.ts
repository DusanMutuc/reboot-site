import nodemailer from 'nodemailer';
import { getSupportConfig, sendSupportEmail, type SupportConfig } from './supportServer';
import { supportEmail } from './support';
import { getBackupEmailConfig, isLoopbackHost } from './backupEmailConfig';

type DeliveryConfig = { mode: 'smtp'; smtp: SupportConfig }
  | { mode: 'local'; host: string; port: number; from: string };

export function getBackupEmailDeliveryConfig(env: NodeJS.ProcessEnv = process.env): DeliveryConfig | null {
  const config = getBackupEmailConfig(env);
  if (!config) return null;
  if (config.deliveryMode === 'smtp') {
    // The support inbox is unrelated to account mail. Reuse only its strict
    // transport settings; each message supplies its verified destination.
    const smtp = getSupportConfig({ ...env, SUPPORT_TO_EMAIL: env.SUPPORT_FROM_EMAIL, SUPPORT_RATE_LIMIT_SECRET: config.secret });
    return smtp ? { mode: 'smtp', smtp } : null;
  }
  const host = env.BACKUP_EMAIL_LOCAL_SMTP_HOST?.trim();
  const portValue = env.BACKUP_EMAIL_LOCAL_SMTP_PORT ?? '';
  const port = Number(portValue);
  const from = supportEmail(env.BACKUP_EMAIL_LOCAL_FROM_EMAIL);
  if (!host || !isLoopbackHost(host) || !/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 1 || port > 65535 || !from) return null;
  return { mode: 'local', host: host === '[::1]' ? '::1' : host, port, from };
}

export async function sendBackupEmail(config: DeliveryConfig, message: { id: string; to: string; subject: string; text: string }): Promise<void> {
  if (config.mode === 'smtp') {
    await sendSupportEmail(config.smtp, message.id, {
      from: config.smtp.from, to: [message.to], reply_to: config.smtp.from, subject: message.subject, text: message.text,
    });
    return;
  }
  // This mode is available only with explicit loopback app, Auth and SMTP
  // configuration. It cannot be selected as a fallback for a failed TLS send.
  const transport = nodemailer.createTransport({
    host: config.host, port: config.port, secure: false, ignoreTLS: true,
    connectionTimeout: 2_000, greetingTimeout: 2_000, socketTimeout: 5_000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  });
  try {
    const result = await transport.sendMail({
      from: config.from, to: message.to, subject: message.subject, text: message.text,
      messageId: `<reboot-backup.${message.id}@${config.from.split('@')[1]}>`,
    });
    if (!result.accepted.includes(message.to) || result.rejected.length || !/^2\d\d(?:[ -]|$)/.test(result.response)) throw new Error('Local email was not accepted');
  } finally { transport.close(); }
}
