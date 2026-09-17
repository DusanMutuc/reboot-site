'use client';

import { useCallback, useEffect, useRef } from 'react';

import { recordDiscoveryEvent } from '@/lib/discoveryClient';

type Attribution = {
  resultSetId?: string | null;
  logicalSearchId?: string | null;
  position?: number | null;
};

export function useDiscoveryItemTracking(attribution: Attribution) {
  const elementRef = useRef<HTMLElement | null>(null);
  const impressedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const visibleSinceRef = useRef<number | null>(null);
  const visibleFractionRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    visibleSinceRef.current = null;
  }, []);

  useEffect(() => {
    impressedRef.current = false;
    clearTimer();

    const element = elementRef.current;
    if (!element || !attribution.resultSetId || !attribution.position) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry || impressedRef.current) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          visibleFractionRef.current = entry.intersectionRatio;
          if (timerRef.current !== null) return;
          visibleSinceRef.current = performance.now();
          timerRef.current = window.setTimeout(() => {
            impressedRef.current = true;
            const visibleMs = Math.max(
              1000,
              Math.round(performance.now() - (visibleSinceRef.current ?? performance.now())),
            );
            recordDiscoveryEvent({
              eventType: 'item_impression',
              resultSetId: attribution.resultSetId,
              logicalSearchId: attribution.logicalSearchId,
              itemPosition: attribution.position,
              visibleFraction: Math.max(0.5, visibleFractionRef.current),
              visibleMs,
            });
            clearTimer();
          }, 1000);
        } else {
          clearTimer();
        }
      },
      { threshold: [0, 0.5, 1] },
    );

    observer.observe(element);
    return () => {
      clearTimer();
      observer.disconnect();
    };
  }, [attribution.logicalSearchId, attribution.position, attribution.resultSetId, clearTimer]);

  const recordOpen = useCallback(() => {
    if (!attribution.resultSetId || !attribution.position) return;

    if (!impressedRef.current) {
      impressedRef.current = true;
      clearTimer();
      recordDiscoveryEvent({
        eventType: 'item_impression',
        resultSetId: attribution.resultSetId,
        logicalSearchId: attribution.logicalSearchId,
        itemPosition: attribution.position,
        visibleFraction: 1,
        visibleMs: 0,
        metadata: { fast_click: true },
      }, { keepalive: true });
    }

    recordDiscoveryEvent(
      {
        eventType: 'item_open',
        resultSetId: attribution.resultSetId,
        logicalSearchId: attribution.logicalSearchId,
        itemPosition: attribution.position,
      },
      { keepalive: true },
    );
  }, [attribution.logicalSearchId, attribution.position, attribution.resultSetId, clearTimer]);

  return { elementRef, recordOpen };
}
