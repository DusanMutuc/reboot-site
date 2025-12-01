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

    const w = window as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(run, { timeout: 1200 });
      return () => {
        if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(id);
      };
    } else {
      const t = window.setTimeout(run, 300);
      return () => window.clearTimeout(t);
    }
  }, [router]);

  return null;
}
