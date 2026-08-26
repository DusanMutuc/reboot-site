import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Keep old review links and bookmarks working after Momentum became `/home`. */
export default function MomentumRedirect() {
  redirect('/home');
}
