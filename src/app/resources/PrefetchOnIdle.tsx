'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PrefetchOnIdle() {
  const router = useRouter();
  useEffect(() => {
    const run = () => {
      router.prefetch('/courses');
      router.prefetch('/library');
    };
    // Warm on idle (fallback to small timeout)
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(run, { timeout: 1200 });
    } else {
      const t = setTimeout(run, 300);
      return () => clearTimeout(t);
    }
  }, [router]);
  return null;
}
