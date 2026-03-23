import type { ReactNode } from 'react';
import LibrarySidebarLayout from '@/components/library/LibrarySidebarLayout';

export default function AssistantLibraryLayout({ children }: { children: ReactNode }) {
  return (
    <LibrarySidebarLayout basePath="/assistant-library" scope="assistant" title="Assistant Library">
      {children}
    </LibrarySidebarLayout>
  );
}
