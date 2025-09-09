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

  // 1 = admin, 2 = coach (adjust if different in your roles table)
  const { data: roles, error } = await supabase
    .from('user_roles')
    .select('role_id')
    .eq('user_id', user.id)
    .in('role_id', [1, 2])

  if (error) {
    redirect('/dashboard') // safe fallback
  }

  const ids = new Set((roles ?? []).map(r => r.role_id))

  if (ids.has(1)) redirect('/admin')
  if (ids.has(2)) redirect('/coach')
  redirect('/dashboard')
}
