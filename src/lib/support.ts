export const SUPPORT_MESSAGE_LIMIT = 5000;
export const SUPPORT_IMAGE_LIMIT = 2 * 1024 * 1024;
export const SUPPORT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Never include query strings or fragments: password links can contain credentials. */
export function supportPagePath(value: string | null | undefined, origin?: string): string | null {
  if (!value || value.length > 4096 || /[\r\n\\]/.test(value)) return null;
  try {
    const base = origin ?? 'https://support.invalid';
    if (!origin && (!value.startsWith('/') || value.startsWith('//'))) return null;
    const url = new URL(value, base);
    if (url.origin !== new URL(base).origin || url.username || url.password) return null;
    return url.pathname.slice(0, 512);
  } catch {
    return null;
  }
}

export function supportEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email) ? email : null;
}
