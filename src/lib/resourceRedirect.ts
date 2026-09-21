/** Parse a resource ID without querying the database for invalid numeric values. */
export function parseResourceId(value: string | undefined): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Resolve a stored web destination locally; no requests are made to the target. */
export function resolveResourceRedirectTarget(
  value: string | null | undefined,
  requestUrl: string,
): string | null {
  if (!value?.trim()) return null;

  try {
    const request = new URL(requestUrl);
    const target = new URL(value, request);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return null;

    // Query strings and fragments do not make a redirect back to this route safe.
    const requestPath = request.pathname.replace(/\/$/, '');
    const targetPath = target.pathname.replace(/\/$/, '');
    if (target.origin === request.origin && targetPath === requestPath) return null;

    return target.toString();
  } catch {
    return null;
  }
}
