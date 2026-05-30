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
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    let mounted = true;

    if (!enabled) {
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    setLoading(true);

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
          setUrls({
            m2Url: normalizeProgramUrl(data?.m2_booking_url ?? null),
            implUrl: normalizeProgramUrl(data?.impl_booking_url ?? data?.call15_url ?? null),
            coachNotesUrl: normalizeProgramUrl(data?.coaching_notes_url ?? null),
            ambassadorHubUrl: null,
          });
          return;
        }

        const [{ data: primaryData, error: primaryErr }, { data: implData, error: implErr }, ambassadorHubUrl] =
          await Promise.all([
            supabase.rpc('get_my_coach', {
              _course_id: courseId ?? null,
            }),
            supabase.rpc('get_my_implementation_coach', {
              _course_id: courseId ?? null,
            }),
            fetchAmbassadorHubUrl(),
          ]);

        if (primaryErr) throw primaryErr;
        if (implErr) throw implErr;

        const primaryRow = Array.isArray(primaryData) ? primaryData[0] : primaryData;
        const implRow = Array.isArray(implData) ? implData[0] : implData;

        if (!mounted) return;
        setUrls({
          m2Url: normalizeProgramUrl(primaryRow?.m2_booking_url ?? null),
          implUrl: normalizeProgramUrl(implRow?.impl_booking_url ?? null),
          coachNotesUrl: null,
          ambassadorHubUrl,
        });
      } catch (error) {
        if (!mounted) return;
        console.error('Program link fetch error:', error);
        setUrls(EMPTY_URLS);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [mode, courseId, enabled]);

  return { ...urls, loading };
}
