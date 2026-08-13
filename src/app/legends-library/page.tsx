'use client';

import Chip from '@mui/material/Chip';
import LibraryCollectionPage from '@/components/library/LibraryCollectionPage';

export default function LegendsLibraryPage() {
  return (
    <LibraryCollectionPage
      basePath="/legends-library"
      scope="legend"
      title="Legends Library"
      backHref="/resources"
      backLabel="Back to Resources"
      headerAccessory={<Chip size="small" label="Legends access" color="default" />}
    />
  );
}
