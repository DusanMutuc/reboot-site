const DEFAULT_HANDOFF_TARGET = '/';

export function sanitizeMobileHandoffTarget(target: string | null | undefined) {
  if (!target) {
    return DEFAULT_HANDOFF_TARGET;
  }

  if (!target.startsWith('/')) {
    return DEFAULT_HANDOFF_TARGET;
  }

  if (target.startsWith('//')) {
    return DEFAULT_HANDOFF_TARGET;
  }

  return target;
}

export function buildMobileHandoffRedirectUrl(origin: string, target: string | null | undefined) {
  const url = new URL('/auth/mobile-handoff', origin);
  const next = sanitizeMobileHandoffTarget(target);

  if (next !== DEFAULT_HANDOFF_TARGET) {
    url.searchParams.set('next', next);
  }

  return url.toString();
}
