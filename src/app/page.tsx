// app/page.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'

export default async function Home() {
  const supabase = createServerComponentClient({ cookies })
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: rolesRows, error } = await supabase
    .from('user_roles')
    .select('roles ( code )')
    .eq('user_id', user.id)

  if (error) {
    redirect('/dashboard') // safe fallback
  }

  const codes = (rolesRows ?? [])
    .flatMap((row) => {
      const r = row.roles;
      return Array.isArray(r) ? r : r ? [r] : [];
    })
    .map((roleRow) => roleRow?.code)
    .filter((code): code is string => typeof code === 'string');

  if (codes.includes('admin')) redirect('/admin')
  if (codes.includes('coach')) redirect('/coach')
  if (codes.includes('assistant')) redirect('/assistant-library')
  redirect('/dashboard')
}
