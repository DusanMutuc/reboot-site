'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export type ProgramLinkMode = 'user' | 'coach';

export type ProgramLinkUrls = {
  m2Url: string | null;
  implUrl: string | null;
  coachNotesUrl: string | null;
  ambassadorHubUrl: string | null;
  loading: boolean;
};

export const REBOOT_TRAINING_URL = 'https://hub.rebootmembers.com/resources';
export const REBOOT_CALENDAR_URL = 'https://www.addevent.com/calendar/ez616853';
export const ASSISTANT_WORKROOM_URL = 'https://zoom.us/j/99652221215';
export const REBOOT_COACHING_URL = 'https://zoom.us/j/93233351653';
export const ASSISTANT_ONBOARDING_URL = 'https://api.leadconnectorhq.com/widget/bookings/assistant_on';
export const SYSTEMS_EXPLAINERS_URL = 'https://vimeo.com/showcase/11715034';
export const FACEBOOK_GROUP_URL = 'https://www.facebook.com/groups/realestatereboot';
export const REFER_AGENT_URL = 'https://rebootmembers.com/legends';

const EMPTY_URLS: Omit<ProgramLinkUrls, 'loading'> = {
  m2Url: null,
  implUrl: null,
  coachNotesUrl: null,
  ambassadorHubUrl: null,
};

export function normalizeProgramUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w.-]+\.[a-z]{2,}([/:].*)?$/i.test(t)) return `https://${t}`;
  return t;
}

async function fetchAmbassadorHubUrl(): Promise<string | null> {
  try {
    const response = await fetch('/api/user/ambassador-hub', {
      cache: 'no-store',
    });

    if (!response.ok) {
      console.warn('Ambassador hub link unavailable.');
      return null;
    }

    const payload = (await response.json()) as { url?: unknown };
    return typeof payload.url === 'string' ? normalizeProgramUrl(payload.url) : null;
  } catch (error) {
    console.error('Ambassador hub link fetch error:', error);
    return null;
  }
}

type UseProgramLinkUrlsOptions = {
  mode?: ProgramLinkMode;
  courseId?: number | null;
  enabled?: boolean;
};

export function useProgramLinkUrls({
  mode = 'user',
  courseId = null,
  enabled = true,
}: UseProgramLinkUrlsOptions = {}): ProgramLinkUrls {
  const [urls, setUrls] = useState(EMPTY_URLS);
  const [coachLinksLoading, setCoachLinksLoading] = useState(enabled);
  const [ambassadorLinkLoading, setAmbassadorLinkLoading] = useState(
    enabled && mode === 'user'
  );

  useEffect(() => {
    let mounted = true;

    if (!enabled) {
      setCoachLinksLoading(false);
      return () => {
        mounted = false;
      };
    }

    setCoachLinksLoading(true);

    (async () => {
      try {
        if (mode === 'coach') {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error('Not authenticated');

          const { data, error } = await supabase
            .from('coach_profiles')
            .select('m2_booking_url, call15_url, coaching_notes_url, impl_booking_url')
            .eq('user_id', user.id)
            .maybeSingle();
          if (error) throw error;

          if (!mounted) return;
          setUrls((current) => ({
            ...current,
            m2Url: normalizeProgramUrl(data?.m2_booking_url ?? null),
            implUrl: normalizeProgramUrl(data?.impl_booking_url ?? data?.call15_url ?? null),
            coachNotesUrl: normalizeProgramUrl(data?.coaching_notes_url ?? null),
            ambassadorHubUrl: null,
          }));
          return;
        }

        const params = new URLSearchParams();
        if (courseId !== null) params.set('courseId', String(courseId));
        const query = params.size > 0 ? `?${params.toString()}` : '';
        const response = await fetch(`/api/user/program-links${query}`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`Program links request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as {
          m2Url?: unknown;
          implUrl?: unknown;
        };

        if (!mounted) return;
        setUrls((current) => ({
          ...current,
          m2Url:
            typeof payload.m2Url === 'string' ? normalizeProgramUrl(payload.m2Url) : null,
          implUrl:
            typeof payload.implUrl === 'string' ? normalizeProgramUrl(payload.implUrl) : null,
          coachNotesUrl: null,
        }));
      } catch (error) {
        if (!mounted) return;
        console.error('Coach link fetch error:', error);
        setUrls((current) => ({
          ...current,
          m2Url: null,
          implUrl: null,
          coachNotesUrl: null,
        }));
      } finally {
        if (mounted) setCoachLinksLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [mode, courseId, enabled]);

  useEffect(() => {
    let mounted = true;

    if (!enabled || mode === 'coach') {
      setUrls((current) => ({ ...current, ambassadorHubUrl: null }));
      setAmbassadorLinkLoading(false);
      return () => {
        mounted = false;
      };
    }

    setAmbassadorLinkLoading(true);

    (async () => {
      const ambassadorHubUrl = await fetchAmbassadorHubUrl();
      if (!mounted) return;
      setUrls((current) => ({ ...current, ambassadorHubUrl }));
      setAmbassadorLinkLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [mode, enabled]);

  return { ...urls, loading: coachLinksLoading || ambassadorLinkLoading };
}
