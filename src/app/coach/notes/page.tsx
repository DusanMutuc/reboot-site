// src/app/coach/notes/page.tsx
import { Suspense } from 'react';
import CoachNotesView from '@/components/coach/CoachNotesView';

export const dynamic = 'force-dynamic'; // avoids static prerender when reading search params

export default function CoachNotesPage() {
  return (
    <Suspense fallback={null}>
      <CoachNotesView mode="coach" />
    </Suspense>
  );
}
