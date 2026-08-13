import type { ReactNode } from 'react';
import LibrarySidebarLayout from '@/components/library/LibrarySidebarLayout';

export default function LegendsLibraryLayout({ children }: { children: ReactNode }) {
  return (
    <LibrarySidebarLayout basePath="/legends-library" scope="legend" title="Legends Library">
      {children}
    </LibrarySidebarLayout>
  );
}
