import { getAdminClient } from '@/lib/supabaseAdmin';
import { fetchCurrentMemberUserIdSet } from '@/lib/currentMembers';

export type AdminDirectoryPerson = {
  id: string;
  name: string;
  email: string;
};

export type AdminDirectoryPartnership = {
  id: string;
  name: string;
};

export type AdminUserDirectoryRow = {
  id: string;
  email: string;
  phone: string | null;
  first_name: string;
  last_name: string;
  ghl_user_id: string | null;
  introduced_at: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  is_current_member: boolean;
  is_legend: boolean;
  is_past_member: boolean;
  primary_coaches: AdminDirectoryPerson[];
  implementation_coaches: AdminDirectoryPerson[];
  assistants: AdminDirectoryPerson[];
  partnerships: AdminDirectoryPartnership[];
};

export type AdminUserDirectoryFilters = {
  membership?: 'all' | 'current' | 'past';
  legendOnly?: boolean;
  setup?: 'all' | 'missing-phone' | 'missing-primary-coach' | 'missing-ghl';
  sort?: 'name' | 'introduced-desc' | 'last-sign-in-desc';
};

type AdminUserDirectoryEntry = AdminUserDirectoryRow & {
  searchText: string;
};

type AdminUserDirectoryPage = {
  items: AdminUserDirectoryRow[];
  total: number;
};

type AuthDirectoryUser = {
  email: string;
  phone: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

type ProfileDirectoryRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  ghl_user_id: string | null;
  introduced_at: string | null;
  created_at: string | null;
};

const DIRECTORY_TTL_MS = 2 * 60 * 1000;
const AUTH_USERS_PER_PAGE = 1000;
const PROFILE_CHUNK_SIZE = 500;
const COURSE_ID = 2;

let cachedDirectory: { expiresAt: number; items: AdminUserDirectoryEntry[] } | null = null;
let directoryPromise: Promise<AdminUserDirectoryEntry[]> | null = null;

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

function displayName(firstName?: string | null, lastName?: string | null, fallback = '') {
  return `${firstName ?? ''} ${lastName ?? ''}`.trim() || fallback;
}

function buildSearchText(row: AdminUserDirectoryRow) {
  const statusTerms = [
    row.is_current_member ? 'current member' : 'inactive member',
    row.is_past_member ? 'past member' : '',
    row.is_legend ? 'legend' : '',
    row.phone ? '' : 'missing phone',
    row.ghl_user_id ? '' : 'missing ghl',
    row.primary_coaches.length > 0 ? '' : 'missing primary coach unassigned coach',
  ];

  return [
    row.email,
    row.phone ?? '',
    row.first_name,
    row.last_name,
    row.ghl_user_id ?? '',
    ...statusTerms,
    ...row.primary_coaches.flatMap((person) => [person.name, person.email]),
    ...row.implementation_coaches.flatMap((person) => [person.name, person.email]),
    ...row.assistants.flatMap((person) => [person.name, person.email]),
    ...row.partnerships.map((partnership) => partnership.name),
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

function compareOptionalDatesDesc(
  a: string | null,
  b: string | null,
  rowA: AdminUserDirectoryRow,
  rowB: AdminUserDirectoryRow,
) {
  const aTime = a ? Date.parse(a) : Number.NEGATIVE_INFINITY;
  const bTime = b ? Date.parse(b) : Number.NEGATIVE_INFINITY;
  if (aTime !== bTime) return bTime - aTime;
  return compareDirectoryRows(rowA, rowB);
}

function toDirectoryEntry(row: AdminUserDirectoryRow): AdminUserDirectoryEntry {
  return { ...row, searchText: buildSearchText(row) };
}

function toPublicDirectoryRow(row: AdminUserDirectoryEntry): AdminUserDirectoryRow {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    first_name: row.first_name,
    last_name: row.last_name,
    ghl_user_id: row.ghl_user_id,
    introduced_at: row.introduced_at,
    created_at: row.created_at,
    last_sign_in_at: row.last_sign_in_at,
    is_current_member: row.is_current_member,
    is_legend: row.is_legend,
    is_past_member: row.is_past_member,
    primary_coaches: row.primary_coaches,
    implementation_coaches: row.implementation_coaches,
    assistants: row.assistants,
    partnerships: row.partnerships,
  };
}

async function fetchRoleIdByCode(code: string) {
  const supa = getAdminClient();
  const { data: roleRow, error } = await supa
    .from('roles')
    .select('id')
    .eq('code', code)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return roleRow?.id ?? null;
}

async function fetchUserIdsByRoleId(roleId: number | null) {
  if (!roleId) return [] as string[];

  const supa = getAdminClient();
  const { data, error } = await supa.from('user_roles').select('user_id').eq('role_id', roleId);
  if (error) throw new Error(error.message);

  return Array.from(new Set((data ?? []).map((row) => row.user_id)));
}

async function fetchAuthUsersMap() {
  const supa = getAdminClient();
  const authMap = new Map<string, AuthDirectoryUser>();

  for (let page = 1; ; page += 1) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage: AUTH_USERS_PER_PAGE });
    if (error) throw new Error(error.message);

    for (const user of data.users) {
      authMap.set(user.id, {
        email: (user.email || '').toLowerCase(),
        phone: user.phone && user.phone.trim().length > 0 ? user.phone : null,
        created_at: user.created_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
      });
    }

    if (data.users.length < AUTH_USERS_PER_PAGE) break;
  }

  return authMap;
}

async function fetchProfilesByIds(ids: string[]): Promise<ProfileDirectoryRow[]> {
  if (ids.length === 0) return [];

  const supa = getAdminClient();
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += PROFILE_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + PROFILE_CHUNK_SIZE));
  }

  const responses = await Promise.all(
    chunks.map((chunk) =>
      supa
        .from('profiles')
        .select('id, first_name, last_name, ghl_user_id, introduced_at, created_at')
        .in('id', chunk),
    ),
  );

  const profiles: ProfileDirectoryRow[] = [];
  for (const response of responses) {
    if (response.error) throw new Error(response.error.message);
    profiles.push(...((response.data ?? []) as ProfileDirectoryRow[]));
  }

  return profiles;
}

function addUniquePerson(
  map: Map<string, AdminDirectoryPerson[]>,
  userId: string,
  person: AdminDirectoryPerson,
) {
  const current = map.get(userId) || [];
  if (!current.some((item) => item.id === person.id)) {
    current.push(person);
    map.set(userId, current);
  }
}

async function fetchSupportDirectory(
  userIds: string[],
  authUsersMap: Map<string, AuthDirectoryUser>,
) {
  const supa = getAdminClient();
  const [coachResponse, assistantResponse, partnershipUserResponse] = await Promise.all([
    supa
      .from('user_coaches')
      .select('user_id, coach_id, relationship_type')
      .in('user_id', userIds)
      .eq('course_id', COURSE_ID)
      .eq('is_active', true),
    supa
      .from('user_assistants')
      .select('user_id, assistant_id')
      .in('user_id', userIds)
      .eq('is_active', true),
    supa.from('partnership_users').select('partnership_id, user_id').in('user_id', userIds),
  ]);

  if (coachResponse.error) throw new Error(coachResponse.error.message);
  if (assistantResponse.error) throw new Error(assistantResponse.error.message);
  if (partnershipUserResponse.error) throw new Error(partnershipUserResponse.error.message);

  const coachRows = coachResponse.data ?? [];
  const assistantRows = assistantResponse.data ?? [];
  const partnershipUserRows = partnershipUserResponse.data ?? [];
  const supportIds = Array.from(
    new Set([
      ...coachRows.map((row) => row.coach_id),
      ...assistantRows.map((row) => row.assistant_id),
    ].filter((id): id is string => typeof id === 'string' && id.length > 0)),
  );
  const partnershipIds = Array.from(
    new Set(
      partnershipUserRows
        .map((row) => row.partnership_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  );

  const [supportProfiles, partnershipResponse] = await Promise.all([
    fetchProfilesByIds(supportIds),
    partnershipIds.length > 0
      ? supa.from('partnerships').select('id, name').in('id', partnershipIds).eq('is_active', true)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (partnershipResponse.error) throw new Error(partnershipResponse.error.message);

  const supportProfileMap = new Map(supportProfiles.map((profile) => [profile.id, profile]));
  const personForId = (id: string): AdminDirectoryPerson => {
    const profile = supportProfileMap.get(id);
    const email = authUsersMap.get(id)?.email ?? '';
    return { id, name: displayName(profile?.first_name, profile?.last_name, email || id), email };
  };

  const primaryCoaches = new Map<string, AdminDirectoryPerson[]>();
  const implementationCoaches = new Map<string, AdminDirectoryPerson[]>();
  const assistants = new Map<string, AdminDirectoryPerson[]>();
  const partnerships = new Map<string, AdminDirectoryPartnership[]>();

  for (const row of coachRows) {
    if (!row.user_id || !row.coach_id) continue;
    const target = row.relationship_type === 'implementation' ? implementationCoaches : primaryCoaches;
    addUniquePerson(target, row.user_id, personForId(row.coach_id));
  }

  for (const row of assistantRows) {
    if (!row.user_id || !row.assistant_id) continue;
    addUniquePerson(assistants, row.user_id, personForId(row.assistant_id));
  }

  const partnershipById = new Map(
    (partnershipResponse.data ?? []).map((partnership) => [
      partnership.id,
      { id: partnership.id, name: partnership.name?.trim() || 'Unnamed partnership' },
    ]),
  );

  for (const row of partnershipUserRows) {
    if (!row.user_id || !row.partnership_id) continue;
    const partnership = partnershipById.get(row.partnership_id);
    if (!partnership) continue;
    const current = partnerships.get(row.user_id) || [];
    if (!current.some((item) => item.id === partnership.id)) {
      current.push(partnership);
      partnerships.set(row.user_id, current);
    }
  }

  return { primaryCoaches, implementationCoaches, assistants, partnerships };
}

async function buildAdminUserDirectory() {
  const supa = getAdminClient();
  const [userRoleId, legendRoleId, pastMemberRoleId] = await Promise.all([
    fetchRoleIdByCode('user'),
    fetchRoleIdByCode('legend'),
    fetchRoleIdByCode('past_member'),
  ]);
  if (!userRoleId) return [];

  const [userIds, legendUserIds, pastMemberUserIds, currentMemberUserIdSet, authUsersMap] =
    await Promise.all([
      fetchUserIdsByRoleId(userRoleId),
      fetchUserIdsByRoleId(legendRoleId),
      fetchUserIdsByRoleId(pastMemberRoleId),
      fetchCurrentMemberUserIdSet(supa),
      fetchAuthUsersMap(),
    ]);
  if (userIds.length === 0) return [];

  const [profiles, support] = await Promise.all([
    fetchProfilesByIds(userIds),
    fetchSupportDirectory(userIds, authUsersMap),
  ]);
  const legendUserIdSet = new Set(legendUserIds);
  const pastMemberUserIdSet = new Set(pastMemberUserIds);

  return profiles
    .map((profile) => {
      const auth = authUsersMap.get(profile.id);
      return toDirectoryEntry({
        id: profile.id,
        email: auth?.email ?? '',
        phone: auth?.phone ?? null,
        first_name: profile.first_name ?? '',
        last_name: profile.last_name ?? '',
        ghl_user_id: profile.ghl_user_id?.trim() ?? null,
        introduced_at: profile.introduced_at ?? null,
        created_at: auth?.created_at ?? profile.created_at ?? null,
        last_sign_in_at: auth?.last_sign_in_at ?? null,
        is_current_member: currentMemberUserIdSet.has(profile.id),
        is_legend: legendUserIdSet.has(profile.id),
        is_past_member: pastMemberUserIdSet.has(profile.id),
        primary_coaches: support.primaryCoaches.get(profile.id) || [],
        implementation_coaches: support.implementationCoaches.get(profile.id) || [],
        assistants: support.assistants.get(profile.id) || [],
        partnerships: support.partnerships.get(profile.id) || [],
      });
    })
    .sort(compareDirectoryRows);
}

async function getCachedDirectory() {
  const now = Date.now();
  if (cachedDirectory && cachedDirectory.expiresAt > now) return cachedDirectory.items;

  if (!directoryPromise) {
    directoryPromise = buildAdminUserDirectory()
      .then((items) => {
        cachedDirectory = { items, expiresAt: Date.now() + DIRECTORY_TTL_MS };
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
  filters: AdminUserDirectoryFilters = {},
): Promise<AdminUserDirectoryPage> {
  const normalizedQuery = query.trim().toLowerCase();
  const directory = await getCachedDirectory();
  const membership = filters.membership ?? 'all';
  const setup = filters.setup ?? 'all';

  const filtered = directory.filter((row) => {
    if (membership === 'current' && !row.is_current_member) return false;
    if (membership === 'past' && !row.is_past_member) return false;
    if (filters.legendOnly && !row.is_legend) return false;
    if (setup === 'missing-phone' && row.phone) return false;
    if (setup === 'missing-primary-coach' && row.primary_coaches.length > 0) return false;
    if (setup === 'missing-ghl' && row.ghl_user_id) return false;
    if (normalizedQuery && !row.searchText.includes(normalizedQuery)) return false;
    return true;
  });

  const sorted = [...filtered];
  if (filters.sort === 'introduced-desc') {
    sorted.sort((a, b) => compareOptionalDatesDesc(a.introduced_at, b.introduced_at, a, b));
  } else if (filters.sort === 'last-sign-in-desc') {
    sorted.sort((a, b) => compareOptionalDatesDesc(a.last_sign_in_at, b.last_sign_in_at, a, b));
  } else {
    sorted.sort(compareDirectoryRows);
  }

  const from = Math.max(0, (page - 1) * limit);
  return {
    items: sorted.slice(from, from + limit).map(toPublicDirectoryRow),
    total: sorted.length,
  };
}

export function invalidateAdminUserDirectory() {
  cachedDirectory = null;
  directoryPromise = null;
}
