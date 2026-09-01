import type { SupabaseClient } from '@supabase/supabase-js';

export const ACCESS_REMOVED_PATH = '/access-removed';
export const PAST_MEMBER_ROLE_CODE = 'past_member';
export const NINETY_DAY_USER_ROLE_CODE = 'ninety-day-user';
export const NINETY_DAY_HOME_PATH = '/home/ninety-day';
const PAST_MEMBER_ALLOWED_API_PATHS = new Set([
  '/api/mobile/ambassador-hub',
  '/api/user/ambassador-hub',
]);

type RoleRelation = {
  code?: string | null;
} | null;

type UserRoleRow = {
  roles: RoleRelation | RoleRelation[] | null;
};

export type AppHomePath =
  | typeof ACCESS_REMOVED_PATH
  | typeof NINETY_DAY_HOME_PATH
  | '/admin'
  | '/assistant-library'
  | '/coach'
  | '/dashboard';

type RoleQueryClient = Pick<SupabaseClient, 'from'>;

export function extractRoleCodes(rows: UserRoleRow[] | null | undefined): string[] {
  return (rows ?? [])
    .flatMap((row) => {
      const roleRows = row.roles;
      return Array.isArray(roleRows) ? roleRows : roleRows ? [roleRows] : [];
    })
    .map((roleRow) => roleRow?.code)
    .filter((code): code is string => typeof code === 'string');
}

export async function fetchUserRoleCodes(
  client: RoleQueryClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from('user_roles')
    .select('roles ( code )')
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message);
  }

  return extractRoleCodes(data as UserRoleRow[] | null | undefined);
}

export function hasRoleCode(codes: readonly string[], roleCode: string): boolean {
  return codes.includes(roleCode);
}

export function isPastMemberRole(codes: readonly string[]): boolean {
  return hasRoleCode(codes, PAST_MEMBER_ROLE_CODE);
}

export function isNinetyDayUserRole(codes: readonly string[]): boolean {
  return hasRoleCode(codes, NINETY_DAY_USER_ROLE_CODE);
}

export function isPastMemberAllowedApiPath(pathname: string): boolean {
  return PAST_MEMBER_ALLOWED_API_PATHS.has(pathname);
}

export function resolveHomePathForRoleCodes(codes: readonly string[]): AppHomePath {
  if (isPastMemberRole(codes)) {
    return ACCESS_REMOVED_PATH;
  }

  if (hasRoleCode(codes, 'admin')) {
    return '/admin';
  }

  if (hasRoleCode(codes, 'coach')) {
    return '/coach';
  }

  if (hasRoleCode(codes, 'assistant')) {
    return '/assistant-library';
  }

  // Full membership wins if both roles are ever present during a manual repair.
  // The promotion RPC normally swaps them atomically.
  if (isNinetyDayUserRole(codes) && !hasRoleCode(codes, 'user')) {
    return NINETY_DAY_HOME_PATH;
  }

  return '/dashboard';
}
