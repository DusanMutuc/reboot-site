import type { ReactNode } from 'react';
import MemberThemeRegistry from '@/components/MemberThemeRegistry';

export default function BusinessReviewPrepLayout({ children }: { children: ReactNode }) {
  return <MemberThemeRegistry>{children}</MemberThemeRegistry>;
}
