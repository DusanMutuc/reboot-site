import type { Metadata } from 'next';
import HomeThemeRegistry from '@/components/home/HomeThemeRegistry';

export const metadata: Metadata = {
  title: 'Reboot — Member home',
  description: 'Your coaching calls, training, and numbers in one place.',
};

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <HomeThemeRegistry>{children}</HomeThemeRegistry>;
}
