import type { ReactNode } from 'react';
import MemberThemeRegistry from '@/components/MemberThemeRegistry';
import LibrarySidebarLayout from '@/components/library/LibrarySidebarLayout';

export default function AssistantLibraryLayout({ children }: { children: ReactNode }) {
  return (
    <MemberThemeRegistry>
      <LibrarySidebarLayout basePath="/assistant-library" scope="assistant" title="Assistant Library">
        {children}
      </LibrarySidebarLayout>
    </MemberThemeRegistry>
  );
}
