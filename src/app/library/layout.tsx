import type { ReactNode } from 'react';
import MemberThemeRegistry from '@/components/MemberThemeRegistry';
import LibrarySidebarLayout from '@/components/library/LibrarySidebarLayout';

export default function LibraryLayout({ children }: { children: ReactNode }) {
  return (
    <MemberThemeRegistry>
      <LibrarySidebarLayout basePath="/library" scope="main" title="Library">
        {children}
      </LibrarySidebarLayout>
    </MemberThemeRegistry>
  );
}
