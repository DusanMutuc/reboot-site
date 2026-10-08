'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function AccountMergedPage() {
  useEffect(() => { void supabase.auth.signOut({ scope: 'local' }).catch(() => {}); }, []);
  return (
    <main style={{ maxWidth: 520, margin: '15vh auto', padding: 24 }}>
      <h1>This account has been merged</h1>
      <p>Please sign in with your current account to continue. Your transferred history is available there.</p>
      <p><Link href="/login">Sign in with your current account</Link></p>
    </main>
  );
}
