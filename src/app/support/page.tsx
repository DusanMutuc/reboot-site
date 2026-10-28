import Link from 'next/link';
import type { Metadata } from 'next';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { supportPagePath } from '@/lib/support';
import { getSupportConfig } from '@/lib/supportServer';
import SupportForm from './SupportForm';
import styles from './support.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Support | Real Estate Reboot Coaching', description: 'Get help with your Reboot account, training, or coaching.' };

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ from?: string | string[] }> }) {
  const params = await searchParams;
  const from = supportPagePath(typeof params.from === 'string' ? params.from : null);
  let email: string | null = null;
  try {
    const { data: { user } } = await getSupabaseServer().auth.getUser();
    email = user?.email ?? null;
  } catch { /* Login help stays accessible when there is no usable session. */ }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.inner}>
          <nav className={styles.nav} aria-label="Support navigation">
            <Link className={styles.brand} href="/">REBOOT</Link>
            <Link className={styles.back} href={email ? '/' : '/login'}>{email ? 'Back to the hub' : 'Back to sign in'}</Link>
          </nav>
          <h1>Let’s get you unstuck.</h1>
          <p>Questions about your account, training, or coaching? Send us a message.</p>
        </div>
      </header>
      <section className={styles.body} aria-label="Contact support">
        <div className={styles.inner}>
          <SupportForm signedInEmail={email} available={getSupportConfig() !== null} from={from} />
          <footer className={styles.footer}>
            <Link href="/login">Password or sign-in help</Link>
            <Link href="/privacy-policy">Privacy policy</Link>
            <Link href="/delete-account">Delete account</Link>
          </footer>
        </div>
      </section>
    </main>
  );
}
