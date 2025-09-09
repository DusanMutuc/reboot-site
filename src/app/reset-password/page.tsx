// src/app/reset-password/page.tsx
import { Suspense } from 'react';
import ResetPasswordClient from './ResetPasswordClient';

// Segment options must live on the server module
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Page() {
  // Next 13/14/15 require Suspense around components that use useSearchParams
  return (
    <Suspense fallback={null}>
      <ResetPasswordClient />
    </Suspense>
  );
}
