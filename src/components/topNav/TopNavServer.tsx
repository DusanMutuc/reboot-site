// src/components/topNav/TopNavServer.tsx
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import TopNav from './topNav'; // keep casing consistent with your other imports
import { extractRoleCodes } from '@/lib/userRoles';

type Role = 'user' | 'coach' | 'admin' | 'assistant';

export default async function TopNavServer({
  title,
  sections,
}: {
  title?: string;
  sections?: { id: string; label: string }[];
}) {
  // ⬇️ await cookies() to fix: "Property 'get' does not exist on type 'Promise<...>'"
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        // set/remove not needed for read-only auth context here
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  let role: Role = 'user';
  if (user?.id) {
    const { data: rolesRows } = await supabase
      .from('user_roles')
      .select('roles ( code )')
      .eq('user_id', user.id);

    if (rolesRows?.length) {
      const codes = extractRoleCodes(rolesRows);

      if (codes.includes('admin')) role = 'admin';
      else if (codes.includes('coach')) role = 'coach';
      else if (codes.includes('assistant')) role = 'assistant';
    }
  }

  return <TopNav title={title} sections={sections} role={role} />;
}
