import { Suspense } from 'react';
import MobileHandoffClient from './MobileHandoffClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MobileHandoffClient />
    </Suspense>
  );
}
