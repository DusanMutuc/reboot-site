import { GHL } from '@/lib/config';

const PAGE_LIMIT = 100;
const MAX_PAGES = 10;
const LOOKUP_TIMEOUT_MS = 10_000;

export type GhlContactLookupResult =
  | { ok: true; contactId: string }
  | { ok: false; error: string; status: number };

type Failure = Extract<GhlContactLookupResult, { ok: false }>;

function failure(error: string, status: number): Failure {
  return { ok: false, error, status };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function invalidResponse(): Failure {
  return failure('GHL returned an incomplete or inconsistent contact search. Retry the transfer or check the GHL connection.', 502);
}

/**
 * Resolves the destination's primary email without creating or changing a GHL
 * contact. Call with the destination email read from Supabase Auth on the server,
 * never a client-supplied contact ID or the source account's cached ID.
 *
 * The advanced search endpoint supports private integration tokens. The newer
 * /contacts/lookup endpoint is OAuth-only; /contacts/ is deprecated.
 * https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/contacts/search-contacts-advanced/
 */
export async function resolveGhlContactIdByEmail(email: string): Promise<GhlContactLookupResult> {
  const normalizedEmail = readString(email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return failure('The destination account needs a valid email before it can be transferred.', 400);
  }

  const base = readString(GHL.BASE).replace(/\/+$/, '');
  const token = readString(GHL.TOKEN);
  const version = readString(GHL.VERSION);
  const locationId = readString(GHL.LOCATION_ID);
  if (!base || !token || !version || !locationId) {
    return failure('GHL contact lookup is not configured. Configure the GHL API base, token, version and location before transferring an account.', 503);
  }

  let searchUrl: URL;
  try {
    searchUrl = new URL(`${base}/contacts/search`);
    if (searchUrl.protocol !== 'https:' || searchUrl.username || searchUrl.password || searchUrl.search || searchUrl.hash) {
      throw new Error('Invalid GHL API base');
    }
  } catch {
    return failure('The GHL API base must be a valid HTTPS URL without credentials, a query or a fragment.', 503);
  }

  const controller = new AbortController();
  // One deadline covers every page and reading each response body.
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  const seenIds = new Set<string>();
  const matchingIds = new Set<string>();
  let expectedTotal: number | undefined;

  try {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const response = await fetch(searchUrl.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Version: version,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          locationId,
          page,
          pageLimit: PAGE_LIMIT,
          filters: [{ field: 'email', operator: 'eq', value: normalizedEmail }],
        }),
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });

      if (!response.ok) {
        // Do not surface response bodies: they may contain tokens/contact data.
        return failure(
          response.status === 401 || response.status === 403
            ? 'GHL rejected the contact lookup. Check the private token, contacts.readonly permission and configured location before retrying.'
            : 'GHL contact lookup is temporarily unavailable. Retry the transfer later.',
          502,
        );
      }

      const payload: unknown = await response.json();
      if (!isRecord(payload) || !Array.isArray(payload.contacts)
        || typeof payload.total !== 'number' || !Number.isSafeInteger(payload.total) || payload.total < 0
        || payload.contacts.length > PAGE_LIMIT
        || (expectedTotal !== undefined && payload.total !== expectedTotal)) {
        return invalidResponse();
      }
      expectedTotal = payload.total;

      for (const contact of payload.contacts) {
        if (!isRecord(contact)) return invalidResponse();
        const contactId = readString(contact.id);
        const contactEmail = readString(contact.email).toLowerCase();
        // Never trust that a server-side filter guarantees identity or location.
        if (!contactId || !contactEmail || readString(contact.locationId) !== locationId
          || seenIds.has(contactId)) {
          return invalidResponse();
        }
        seenIds.add(contactId);
        if (contactEmail === normalizedEmail) matchingIds.add(contactId);
      }

      if (matchingIds.size > 1) {
        return failure('More than one GHL contact has the destination email in the configured location. Resolve the duplicate contacts in GHL, then retry the transfer.', 409);
      }
      if (seenIds.size > expectedTotal || (payload.contacts.length === 0 && seenIds.size < expectedTotal)) {
        return invalidResponse();
      }
      if (seenIds.size === expectedTotal) {
        const [contactId] = matchingIds;
        return contactId
          ? { ok: true, contactId }
          : failure('No GHL contact has the destination email in the configured location. Add or correct that contact in GHL, then retry the transfer.', 409);
      }
    }
    return failure('GHL returned too many contact results to verify a unique destination. Check the destination email and duplicate contacts in GHL, then retry.', 502);
  } catch {
    return controller.signal.aborted
      ? failure('GHL contact lookup timed out. Retry the transfer.', 504)
      : failure('GHL contact lookup could not be completed. Check the connection and retry the transfer.', 502);
  } finally {
    clearTimeout(timeout);
  }
}
