'use client';

import LibraryCollectionPage from '@/components/library/LibraryCollectionPage';

export default function LibraryPage() {
  return (
    <LibraryCollectionPage
      basePath="/library"
      scope="main"
      title="Library"
      backHref="/resources"
      backLabel="Back to Resources"
    />
  );
}
