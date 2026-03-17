'use client';

import Chip from '@mui/material/Chip';
import LibraryCollectionPage from '@/components/library/LibraryCollectionPage';

export default function AssistantLibraryPage() {
  return (
    <LibraryCollectionPage
      basePath="/assistant-library"
      title="Assistant Library"
      headerAccessory={<Chip size="small" label="Assistant access" color="default" />}
    />
  );
}
