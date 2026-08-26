import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { fetchUserRoleCodes, resolveHomePathForRoleCodes } from '@/lib/userRoles';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home() {
  const supabase = getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  let codes: string[];
  try {
    codes = await fetchUserRoleCodes(supabase, user.id);
  } catch {
    redirect('/home');
  }

  redirect(resolveHomePathForRoleCodes(codes));
}
