// src/app/login/page.tsx

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ✅ Just import and render the client component directly.
// Server components *can* render client components.
import LoginClient from './LoginClient';

export default function Page() {
  return <LoginClient />;
}
