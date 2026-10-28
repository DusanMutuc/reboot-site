export type BackupEmailConfig = { secret: string; origin: string; deliveryMode: 'smtp' | 'local' };

export function isLoopbackHost(host: string): boolean {
  return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host.toLowerCase());
}

export function isBackupEmailEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BACKUP_EMAIL_ENABLED === 'true';
}

export function getBackupEmailConfig(env: NodeJS.ProcessEnv = process.env): BackupEmailConfig | null {
  if (!isBackupEmailEnabled(env)) return null;
  const secret = env.BACKUP_EMAIL_SECRET?.trim();
  const deliveryMode = env.BACKUP_EMAIL_DELIVERY_MODE;
  if (!secret || secret.length < 32 || !['smtp', 'local'].includes(deliveryMode ?? '')) return null;
  try {
    const origin = new URL(env.BACKUP_EMAIL_ORIGIN ?? '');
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') return null;
    if (origin.protocol !== 'https:' && !(deliveryMode === 'local' && origin.protocol === 'http:' && isLoopbackHost(origin.hostname))) return null;
    if (deliveryMode === 'local') {
      const database = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '');
      if (!isLoopbackHost(origin.hostname) || !isLoopbackHost(database.hostname)
        || !['http:', 'https:'].includes(database.protocol) || database.username || database.password) return null;
    }
    return { secret, origin: origin.origin, deliveryMode: deliveryMode as 'smtp' | 'local' };
  } catch { return null; }
}
