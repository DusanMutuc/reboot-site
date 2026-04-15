import type { User } from '@supabase/supabase-js';
import { GHL } from '@/lib/config';
import { getAdminClient } from '@/lib/supabaseAdmin';

const AMBASSADOR_URL_FIELD = 'Ambassador URL';
const HUB_URL = 'https://rebootmembers.com/ambassadors/hub';

type GhlContact = Record<string, unknown>;

type ProfileRow = {
  first_name: string | null;
  ghl_user_id: string | null;
};

export type AmbassadorHubResult =
  | {
      ok: true;
      url: string;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

export async function resolveAmbassadorHubUrl(
  user: Pick<User, 'id' | 'email' | 'user_metadata'>,
): Promise<AmbassadorHubResult> {
  try {
    const supabase = getAdminClient();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('first_name, ghl_user_id')
      .eq('id', user.id)
      .maybeSingle<ProfileRow>();

    if (profileError) {
      console.error('[ambassador-hub] Profile lookup failed', {
        userId: user.id,
        message: profileError.message,
      });
      return { ok: false, error: 'Could not load ambassador link.', status: 500 };
    }

    const cachedContactId = readString(profile?.ghl_user_id);
    if (cachedContactId) {
      const firstName =
        getProfileFirstName(profile) ?? extractUserMetadataFirstName(user.user_metadata);

      return {
        ok: true,
        url: buildHubUrl(firstName, cachedContactId),
      };
    }

    const email = user.email?.trim().toLowerCase();
    if (!email) {
      return { ok: false, error: 'No email found for authenticated user.', status: 400 };
    }

    if (!GHL.BASE || !GHL.TOKEN || !GHL.VERSION) {
      return { ok: false, error: 'GHL contact lookup is not configured.', status: 500 };
    }

    const response = await searchGhlContacts(email);

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[ambassador-hub] GHL contact lookup failed', {
        status: response.status,
        detail: detail.slice(0, 500),
      });
      return { ok: false, error: 'Could not load ambassador link.', status: 502 };
    }

    const payload: unknown = await response.json();
    const contact = findContact(payload, email);

    if (!contact) {
      console.warn('[ambassador-hub] No GHL contact found', {
        email: maskEmail(email),
        responseShape: describePayloadShape(payload),
      });
      return { ok: false, error: 'No GHL contact found for this user.', status: 404 };
    }

    const contactId = extractContactId(contact);
    if (!contactId) {
      console.warn('[ambassador-hub] GHL contact found without an id', {
        email: maskEmail(email),
        contactKeys: Object.keys(contact).slice(0, 20),
      });
      return {
        ok: false,
        error: 'GHL contact ID is not available for this user.',
        status: 404,
      };
    }

    const { error: updateProfileError } = await supabase
      .from('profiles')
      .update({ ghl_user_id: contactId })
      .eq('id', user.id);

    if (updateProfileError) {
      console.error('[ambassador-hub] Failed to cache GHL contact id', {
        userId: user.id,
        message: updateProfileError.message,
      });
    }

    const ambassadorUrl = extractCustomField(contact, AMBASSADOR_URL_FIELD);
    const firstName =
      getProfileFirstName(profile) ??
      extractFirstName(contact) ??
      extractFirstNameFromUrl(ambassadorUrl) ??
      extractUserMetadataFirstName(user.user_metadata) ??
      '';

    return { ok: true, url: buildHubUrl(firstName, contactId) };
  } catch (error) {
    console.error('[ambassador-hub] Unexpected error', error);
    return { ok: false, error: 'Could not load ambassador link.', status: 500 };
  }
}

function buildHubUrl(firstName: string | null, contactId: string): string {
  const hubUrl = new URL(HUB_URL);
  hubUrl.searchParams.set('fn', firstName ?? '');
  hubUrl.searchParams.set('aid', contactId);
  return hubUrl.toString();
}

async function searchGhlContacts(email: string): Promise<Response> {
  const ghlBase = GHL.BASE.replace(/\/+$/, '');
  const searchUrl = new URL(`${ghlBase}/contacts/search`);

  const response = await fetch(searchUrl.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GHL.TOKEN}`,
      Version: GHL.VERSION,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      locationId: GHL.LOCATION_ID,
      page: 1,
      pageLimit: 20,
      filters: [
        {
          field: 'email',
          operator: 'eq',
          value: email,
        },
      ],
    }),
    cache: 'no-store',
  });

  if (response.ok) return response;

  const detail = await response.text().catch(() => '');
  console.warn('[ambassador-hub] GHL contact search failed, trying query fallback', {
    status: response.status,
    detail: detail.slice(0, 500),
  });

  const fallbackUrl = new URL(`${ghlBase}/contacts/`);
  fallbackUrl.searchParams.set('locationId', GHL.LOCATION_ID);
  fallbackUrl.searchParams.set('query', email);
  fallbackUrl.searchParams.set('limit', '20');

  return fetch(fallbackUrl.toString(), {
    headers: {
      Authorization: `Bearer ${GHL.TOKEN}`,
      Version: GHL.VERSION,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
}

function findContact(payload: unknown, email: string): GhlContact | null {
  const contacts = extractContacts(payload);
  if (contacts.length === 0) return null;

  const matchingContact = contacts.find((contact) =>
    extractContactEmails(contact).some((candidate) => candidate.toLowerCase() === email),
  );

  return matchingContact ?? contacts[0] ?? null;
}

function extractContacts(payload: unknown): GhlContact[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];

  const possibleContainerKeys = ['contacts', 'contact', 'data', 'results', 'items'];

  for (const key of possibleContainerKeys) {
    const container = payload[key];
    if (Array.isArray(container)) {
      return container.filter(isRecord);
    }

    if (isRecord(container)) {
      if (Array.isArray(container.contacts)) {
        return container.contacts.filter(isRecord);
      }

      return [container];
    }
  }

  return [payload];
}

function extractContactEmails(contact: GhlContact): string[] {
  const emails = [
    readString(contact.email),
    readString(contact.emailAddress),
    readString(contact.primaryEmail),
  ].filter((value): value is string => Boolean(value));

  for (const key of ['additionalEmails', 'emails']) {
    const value = contact[key];
    if (!Array.isArray(value)) continue;

    for (const item of value) {
      const directEmail = readString(item);
      if (directEmail) {
        emails.push(directEmail);
        continue;
      }

      if (isRecord(item)) {
        const nestedEmail = readString(item.email) ?? readString(item.value);
        if (nestedEmail) emails.push(nestedEmail);
      }
    }
  }

  return emails;
}

function extractContactId(contact: GhlContact): string | null {
  return readFirstString(contact, ['id', '_id', 'contactId', 'contact_id']);
}

function getProfileFirstName(profile: ProfileRow | null | undefined): string | null {
  return readString(profile?.first_name);
}

function extractCustomField(contact: GhlContact, fieldName: string): string | null {
  const directValue = readString(contact[fieldName]);
  if (directValue) return directValue;

  const customFieldContainers = [
    contact.customFields,
    contact.custom_fields,
    contact.customField,
    contact.custom_field,
    contact.customFieldValues,
    contact.custom_field_values,
  ];

  for (const container of customFieldContainers) {
    const value = readCustomFieldContainer(container, fieldName);
    if (value) return value;
  }

  return null;
}

function readCustomFieldContainer(container: unknown, fieldName: string): string | null {
  if (Array.isArray(container)) {
    for (const item of container) {
      if (!isRecord(item)) continue;

      const label = readFirstString(item, [
        'name',
        'label',
        'fieldName',
        'field_name',
        'fieldKey',
        'field_key',
        'key',
        'id',
      ]);

      if (!fieldNameMatches(label, fieldName)) continue;

      const value = readFirstString(item, ['value', 'field_value', 'fieldValue']);
      if (value) return value;
    }
  }

  if (isRecord(container)) {
    for (const [key, value] of Object.entries(container)) {
      if (!fieldNameMatches(key, fieldName)) continue;

      const directValue = readString(value);
      if (directValue) return directValue;

      if (isRecord(value)) {
        const nestedValue = readFirstString(value, ['value', 'field_value', 'fieldValue']);
        if (nestedValue) return nestedValue;
      }
    }
  }

  return null;
}

function extractFirstName(contact: GhlContact): string | null {
  return readFirstString(contact, [
    'firstName',
    'first_name',
    'first_name_lowercase',
    'firstNameLowerCase',
  ]);
}

function extractUserMetadataFirstName(metadata: unknown): string | null {
  if (!isRecord(metadata)) return null;
  return readFirstString(metadata, ['first_name', 'firstName']);
}

function extractFirstNameFromUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    return readString(new URL(url).searchParams.get('fn'));
  } catch {
    return null;
  }
}

function readFirstString(record: GhlContact, keys: string[]): string | null {
  for (const key of keys) {
    const value = readString(record[key]);
    if (value) return value;
  }

  return null;
}

function readString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return null;
}

function fieldNameMatches(value: string | null, expected: string): boolean {
  return value?.trim().toLowerCase() === expected.toLowerCase();
}

function describePayloadShape(payload: unknown): string {
  if (Array.isArray(payload)) return `array:${payload.length}`;
  if (!isRecord(payload)) return typeof payload;

  return Object.entries(payload)
    .slice(0, 10)
    .map(([key, value]) => `${key}:${Array.isArray(value) ? `array:${value.length}` : typeof value}`)
    .join(',');
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return 'unknown';

  const maskedLocal =
    local.length <= 2 ? `${local[0] ?? ''}*` : `${local[0]}***${local[local.length - 1]}`;
  return `${maskedLocal}@${domain}`;
}

function isRecord(value: unknown): value is GhlContact {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
