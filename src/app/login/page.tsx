// src/app/login/page.tsx
import NextDynamic from 'next/dynamic';

// Next segment options: keep these here (server file)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Use an alias so it doesn't collide with the exported `dynamic` above
const LoginClient = NextDynamic(() => import('./LoginClient'), { ssr: false });

export default function Page() {
  return <LoginClient />;
}
