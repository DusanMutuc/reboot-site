import { redirect } from 'next/navigation';

import AccessRemovedClient from './AccessRemovedClient';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { fetchUserRoleCodes, isPastMemberRole, resolveHomePathForRoleCodes } from '@/lib/userRoles';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AccessRemovedPage() {
  const supabase = getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const roleCodes = await fetchUserRoleCodes(supabase, user.id);
  if (!isPastMemberRole(roleCodes)) {
    redirect(resolveHomePathForRoleCodes(roleCodes));
  }

  return <AccessRemovedClient />;
}
