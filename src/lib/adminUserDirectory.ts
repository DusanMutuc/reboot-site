import { getAdminClient } from '@/lib/supabaseAdmin';
import { fetchCurrentMemberUserIdSet } from '@/lib/currentMembers';

export type AdminUserDirectoryRow = {
  id: string;
  email: string;
  phone: string | null;
  first_name: string;
  last_name: string;
  looker_link: string;
  ghl_user_id: string | null;
  is_legend: boolean;
  is_past_member: boolean;
};

type AdminUserDirectoryEntry = AdminUserDirectoryRow & {
  is_current_member: boolean;
  searchText: string;
};

type AdminUserDirectoryPage = {
  items: AdminUserDirectoryRow[];
  total: number;
};

const DIRECTORY_TTL_MS = 2 * 60 * 1000;
const AUTH_USERS_PER_PAGE = 1000;
const PROFILE_CHUNK_SIZE = 500;

let cachedDirectory: { expiresAt: number; items: AdminUserDirectoryEntry[] } | null = null;
let directoryPromise: Promise<AdminUserDirectoryEntry[]> | null = null;

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

function buildSearchText(row: AdminUserDirectoryRow) {
  return [
    row.email,
    row.phone ?? '',
    row.first_name,
    row.last_name,
    row.looker_link,
    row.ghl_user_id ?? '',
    row.is_legend ? 'legend' : '',
    row.is_past_member ? 'past member' : '',
  ]
    .join(' ')
    .toLowerCase();
}

function compareDirectoryRows(a: AdminUserDirectoryRow, b: AdminUserDirectoryRow) {
  const lastName = collator.compare(a.last_name, b.last_name);
  if (lastName !== 0) return lastName;

  const firstName = collator.compare(a.first_name, b.first_name);
  if (firstName !== 0) return firstName;

  return collator.compare(a.email, b.email);
}

function toDirectoryEntry(
  row: AdminUserDirectoryRow,
  isCurrentMember: boolean,
): AdminUserDirectoryEntry {
  return {
    ...row,
    is_current_member: isCurrentMember,
    searchText: buildSearchText(row),
  };
}

function toPublicDirectoryRow(row: AdminUserDirectoryEntry): AdminUserDirectoryRow {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    first_name: row.first_name,
    last_name: row.last_name,
    looker_link: row.looker_link,
    ghl_user_id: row.ghl_user_id,
    is_legend: row.is_legend,
    is_past_member: row.is_past_member,
  };
}

async function fetchRoleIdByCode(code: string) {
  const supa = getAdminClient();
  const { data: roleRow, error } = await supa
    .from('roles')
    .select('id')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return roleRow?.id ?? null;
}

async function fetchUserIdsByRoleId(roleId: number | null) {
  if (!roleId) {
    return [] as string[];
  }

  const supa = getAdminClient();
  const { data, error } = await supa
    .from('user_roles')
    .select('user_id')
    .eq('role_id', roleId);

  if (error) {
    throw new Error(error.message);
  }

  return Array.from(new Set((data ?? []).map((row) => row.user_id)));
}

async function fetchAuthUsersMap() {
  const supa = getAdminClient();
  const authMap = new Map<string, { email: string; phone: string | null }>();

  for (let page = 1; ; page += 1) {
    const { data, error } = await supa.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PER_PAGE,
    });

    if (error) {
      throw new Error(error.message);
    }

    for (const user of data.users) {
      authMap.set(user.id, {
        email: (user.email || '').toLowerCase(),
        phone: user.phone && user.phone.trim().length > 0 ? user.phone : null,
      });
    }

    if (data.users.length < AUTH_USERS_PER_PAGE) {
      break;
    }
  }

  return authMap;
}

async function fetchProfilesByIds(ids: string[]) {
  const supa = getAdminClient();
  const chunks: string[][] = [];

  for (let i = 0; i < ids.length; i += PROFILE_CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + PROFILE_CHUNK_SIZE));
  }

  const profileResponses = await Promise.all(
    chunks.map((chunk) =>
      supa
        .from('profiles')
        .select('id, first_name, last_name, looker_link, ghl_user_id')
        .in('id', chunk)
    )
  );

  const profiles: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    looker_link: string | null;
    ghl_user_id: string | null;
  }> = [];

  for (const response of profileResponses) {
    if (response.error) {
      throw new Error(response.error.message);
    }

    profiles.push(...(response.data ?? []));
  }

  return profiles;
}

async function buildAdminUserDirectory() {
  const supa = getAdminClient();
  const [userRoleId, legendRoleId, pastMemberRoleId] = await Promise.all([
    fetchRoleIdByCode('user'),
    fetchRoleIdByCode('legend'),
    fetchRoleIdByCode('past_member'),
  ]);
  if (!userRoleId) {
    return [];
  }

  const [userIds, legendUserIds, pastMemberUserIds, currentMemberUserIdSet, authUsersMap] =
    await Promise.all([
      fetchUserIdsByRoleId(userRoleId),
      fetchUserIdsByRoleId(legendRoleId),
      fetchUserIdsByRoleId(pastMemberRoleId),
      fetchCurrentMemberUserIdSet(supa),
      fetchAuthUsersMap(),
    ]);
  if (userIds.length === 0) {
    return [];
  }

  const legendUserIdSet = new Set(legendUserIds);
  const pastMemberUserIdSet = new Set(pastMemberUserIds);
  const profiles = await fetchProfilesByIds(userIds);

  return profiles
    .map((profile) => {
      const auth = authUsersMap.get(profile.id);

      return toDirectoryEntry(
        {
          id: profile.id,
          email: auth?.email ?? '',
          phone: auth?.phone ?? null,
          first_name: profile.first_name ?? '',
          last_name: profile.last_name ?? '',
          looker_link: profile.looker_link?.trim() ?? '',
          ghl_user_id: profile.ghl_user_id?.trim() ?? null,
          is_legend: legendUserIdSet.has(profile.id),
          is_past_member: pastMemberUserIdSet.has(profile.id),
        },
        currentMemberUserIdSet.has(profile.id),
      );
    })
    .sort(compareDirectoryRows);
}

async function getCachedDirectory() {
  const now = Date.now();
  if (cachedDirectory && cachedDirectory.expiresAt > now) {
    return cachedDirectory.items;
  }

  if (!directoryPromise) {
    directoryPromise = buildAdminUserDirectory()
      .then((items) => {
        cachedDirectory = {
          items,
          expiresAt: Date.now() + DIRECTORY_TTL_MS,
        };
        return items;
      })
      .finally(() => {
        directoryPromise = null;
      });
  }

  return directoryPromise;
}

export async function getAdminUserDirectoryPage(
  query: string,
  page: number,
  limit: number,
  membership: 'all' | 'current' = 'all',
): Promise<AdminUserDirectoryPage> {
  const normalizedQuery = query.trim().toLowerCase();
  const directory = await getCachedDirectory();
  const membershipFiltered =
    membership === 'current'
      ? directory.filter((row) => row.is_current_member)
      : directory;
  const filtered = normalizedQuery
    ? membershipFiltered.filter((row) => row.searchText.includes(normalizedQuery))
    : membershipFiltered;

  const from = Math.max(0, (page - 1) * limit);
  const to = from + limit;

  return {
    items: filtered.slice(from, to).map(toPublicDirectoryRow),
    total: filtered.length,
  };
}

export function invalidateAdminUserDirectory() {
  cachedDirectory = null;
  directoryPromise = null;
}
