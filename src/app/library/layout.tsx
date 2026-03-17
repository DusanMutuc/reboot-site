import type { ReactNode } from 'react';
import LibrarySidebarLayout from '@/components/library/LibrarySidebarLayout';

export default function LibraryLayout({ children }: { children: ReactNode }) {
  return (
    <LibrarySidebarLayout basePath="/library" title="Library">
      {children}
    </LibrarySidebarLayout>
  );
}
