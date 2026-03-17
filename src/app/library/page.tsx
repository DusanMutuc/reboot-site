'use client';

import LibraryCollectionPage from '@/components/library/LibraryCollectionPage';

export default function LibraryPage() {
  return (
    <LibraryCollectionPage
      basePath="/library"
      title="Library"
      backHref="/resources"
      backLabel="Back to Resources"
    />
  );
}
