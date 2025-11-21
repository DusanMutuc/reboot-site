// src/app/coach/progress/page.tsx
import { Suspense } from 'react';
import StudentProgressView from '@/components/coach/StudentProgressView';

export const dynamic = 'force-dynamic'; // query-driven page; skip static export

export default function CoachProgressPage() {
  return (
    <Suspense fallback={null}>
      <StudentProgressView mode="coach" />
    </Suspense>
  );
}
