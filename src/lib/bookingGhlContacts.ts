import { fetchBookingGhl } from '@/lib/bookingGhlFetch';
import { GHL } from '@/lib/config';

export type BookingGhlContactDetails = {
  name: string | null;
  email: string | null;
};

const BATCH_SIZE = 100;
const FALLBACK_CONCURRENCY = 4;
const CONTACT_TIMEOUT_MS = 8_000;
const IDENTITY_FIELDS = ['firstName', 'lastName', 'name', 'contactName', 'email'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() || null : null;
}

function contactDetails(value: unknown, id: string, fromSearch = false): BookingGhlContactDetails | null {
  if (!isRecord(value) || value.id !== id || value.locationId !== GHL.LOCATION_ID) return null;
  if (fromSearch && ['firstName', 'lastName', 'email'].some((field) =>
    !Object.hasOwn(value, field) || (value[field] !== null && typeof value[field] !== 'string'))) return null;
  if (!IDENTITY_FIELDS.some((field) => Object.hasOwn(value, field))) return null;
  if (IDENTITY_FIELDS.some((field) => value[field] != null && typeof value[field] !== 'string')) return null;
  const fullName = [readString(value.firstName), readString(value.lastName)].filter(Boolean).join(' ');
  return {
    name: fullName || readString(value.name) || readString(value.contactName),
    email: readString(value.email)?.toLowerCase() ?? null,
  };
}

function configuredBase(): string | null {
  try {
    if (!GHL.BASE || !GHL.TOKEN || !GHL.VERSION || !GHL.LOCATION_ID) return null;
    const base = new URL(GHL.BASE);
    const local = process.env.NODE_ENV !== 'production' && base.protocol === 'http:'
      && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
    if ((base.protocol !== 'https:' && !local) || base.username || base.password) return null;
    return base.href.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** Resolve only known contact IDs; search omissions fall back to exact reads. */
export async function resolveBookingGhlContacts(
  ids: readonly string[],
): Promise<Map<string, BookingGhlContactDetails | null>> {
  const requestedIds = [...new Set(ids)];
  const resolved = new Map<string, BookingGhlContactDetails | null>(requestedIds.map((id) => [id, null]));
  if (requestedIds.length === 0) return resolved;
  const base = configuredBase();
  if (!base) return resolved;
  const headers = {
    Authorization: `Bearer ${GHL.TOKEN}`,
    Version: GHL.VERSION,
    Accept: 'application/json',
  };

  for (let offset = 0; offset < requestedIds.length; offset += BATCH_SIZE) {
    const chunk = requestedIds.slice(offset, offset + BATCH_SIZE);
    const wanted = new Set(chunk);
    try {
      const response = await fetchBookingGhl(`${base}/contacts/search`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        cache: 'no-store',
        redirect: 'error',
        body: JSON.stringify({
          locationId: GHL.LOCATION_ID,
          page: 1,
          pageLimit: 500,
          fastPagination: true,
          filters: [{
            group: 'OR',
            filters: chunk.map((id) => ({ field: 'id', operator: 'eq', value: id })),
          }],
        }),
      }, CONTACT_TIMEOUT_MS);
      if (!response.ok) continue;
      const payload: unknown = await response.json();
      if (!isRecord(payload) || !Array.isArray(payload.contacts)) continue;

      // Duplicate IDs are ambiguous even when one of their rows looks valid.
      const counts = new Map<string, number>();
      for (const contact of payload.contacts) {
        if (isRecord(contact) && typeof contact.id === 'string' && wanted.has(contact.id)) {
          counts.set(contact.id, (counts.get(contact.id) ?? 0) + 1);
        }
      }
      for (const contact of payload.contacts) {
        if (!isRecord(contact) || typeof contact.id !== 'string' || counts.get(contact.id) !== 1) continue;
        const details = contactDetails(contact, contact.id, true);
        if (details) resolved.set(contact.id, details);
      }
    } catch {
      // Search may be unavailable or its index may lag; exact reads remain authoritative.
    }
  }

  const missing = requestedIds.filter((id) => resolved.get(id) === null);
  let nextId = 0;
  await Promise.all(Array.from({ length: Math.min(FALLBACK_CONCURRENCY, missing.length) }, async () => {
    while (nextId < missing.length) {
      const id = missing[nextId++];
      try {
        const response = await fetchBookingGhl(`${base}/contacts/${encodeURIComponent(id)}`, {
          headers,
          cache: 'no-store',
          redirect: 'error',
        }, CONTACT_TIMEOUT_MS);
        if (!response.ok) continue;
        const payload: unknown = await response.json();
        resolved.set(id, isRecord(payload) ? contactDetails(payload.contact, id) : null);
      } catch {
        // Failed identities remain unresolved and are retried on the next report.
      }
    }
  }));
  return resolved;
}
