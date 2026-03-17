'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { fetchDashboardData } from '@/lib/dashboard';
import type { UserDashboardData } from '@/types/dashboard';

export type DashboardRefreshMode = 'chart-only' | 'full';

type UseDashboardDataArgs = {
  userId: string;
  refreshSignal?: number | string;
  refreshMode?: DashboardRefreshMode;
};

type UseDashboardDataResult = {
  data: UserDashboardData | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  chartVersion: number;
};

export default function useDashboardData({
  userId,
  refreshSignal,
  refreshMode = 'full',
}: UseDashboardDataArgs): UseDashboardDataResult {
  const [data, setData] = useState<UserDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [chartVersion, setChartVersion] = useState(0);

  const lastRefreshSignalRef = useRef<number | string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    lastRefreshSignalRef.current = undefined;
    setData(null);
    setLoading(true);
    setError(null);
    setRefreshing(false);
    setChartVersion(0);

    (async () => {
      try {
        const result = await fetchDashboardData(supabase, userId);
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        console.error('Error loading dashboard data', err);
        if (!cancelled) {
          setError('There was a problem loading your dashboard.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || refreshSignal == null || refreshSignal === '') return;

    if (lastRefreshSignalRef.current === undefined) {
      lastRefreshSignalRef.current = refreshSignal;
      return;
    }

    if (lastRefreshSignalRef.current === refreshSignal) {
      return;
    }

    lastRefreshSignalRef.current = refreshSignal;

    let cancelled = false;

    (async () => {
      try {
        setRefreshing(true);
        const result = await fetchDashboardData(supabase, userId);
        if (cancelled) return;

        setData((prev) => {
          if (refreshMode === 'chart-only' && prev) {
            return { ...prev, kpiChart: result.kpiChart };
          }

          return result;
        });
        setChartVersion((prev) => prev + 1);
      } catch (err) {
        console.error('Error refreshing dashboard data', err);
      } finally {
        if (!cancelled) {
          setRefreshing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshMode, refreshSignal, userId]);

  return {
    data,
    loading,
    error,
    refreshing,
    chartVersion,
  };
}
