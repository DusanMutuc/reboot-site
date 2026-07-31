'use client';

import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import {
  Box,
  Link as MuiLink,
  Typography,
} from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { supabase } from '@/lib/supabaseClient';

type LinkItem = { label: string; href?: string };

// Labels you already use
const BOOKING_LABEL = 'MOMENTUM COACH \nBOOKING LINK';
// Renamed: this pill will now be the implementation coach booking link
const IMPL_LABEL  = 'IMPLEMENTATION COACH \nBOOKING LINK';

// New labels for coach mode additions
const REFERRAL_PILL_LABEL = 'REFER AN AGENT TO OUR PROGRAM';
const COACH_NOTES_LABEL   = 'IMPLEMENTATION';

const baseLinks: LinkItem[] = [
  { label: 'REBOOT TRAINING,\nTOOLS & COURSE', href: 'https://hub.rebootmembers.com/resources' },
  { label: 'REBOOT CALENDAR', href: 'https://www.addevent.com/calendar/ez616853' },
  { label: BOOKING_LABEL },
  { label: IMPL_LABEL },
  { label: 'ASSISTANT WORKROOM \nZOOM LINK', href: 'https://zoom.us/j/99652221215' },
  { label: 'REBOOT COACHING \nZOOM LINK', href: 'https://zoom.us/j/93233351653' },
  { label: 'ASSISTANT ONBOARDING', href: 'https://api.leadconnectorhq.com/widget/bookings/assistant_on' },
  { label: 'REBOOT SYSTEMS EXPLAINERS', href: 'https://vimeo.com/showcase/11715034' },
  { label: 'REBOOT FACEBOOK GROUP', href: 'https://www.facebook.com/groups/realestatereboot' },
  { label: 'FIND A REBOOT AGENT TO REFER YOUR CLIENTS', href: 'https://rebootmembers.com/legends' },
];

// ICON MAPS
// User mode (original 10)
const iconNumbersUser = [5, 6, 7, 9, 8, 8, 10, 11, 12, 13];
// Coach mode (12 total): the same 10 + 14 for Referral + 15 for Notes
const iconNumbersCoach = [...iconNumbersUser, 14, 15];

function normalizeUrl(raw?: string | null): string | null {
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
    return typeof payload.url === 'string' ? normalizeUrl(payload.url) : null;
  } catch (error) {
    console.error('Ambassador hub link fetch error:', error);
    return null;
  }
}

type Props = {
  /** 'coach' on /coach page to pull the logged-in coach's links; default 'user' uses get_my_coach + get_my_implementation_coach */
  mode?: 'user' | 'coach';
  /** optional course filter for get_my_coach / get_my_implementation_coach */
  courseId?: number | null;
};

export default function ImportantLinks({ mode = 'user', courseId = null }: Props) {
  const [m2Url, setM2Url] = useState<string | null>(null);
  const [implUrl, setImplUrl] = useState<string | null>(null);
  const [coachNotesUrl, setCoachNotesUrl] = useState<string | null>(null);
  const [ambassadorHubUrl, setAmbassadorHubUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (mode === 'coach') {
          // Logged-in coach: read their own coach_profiles row
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
          setM2Url(normalizeUrl(data?.m2_booking_url ?? null));
          // Prefer the new impl_booking_url, but gracefully fall back to call15_url if it exists
          setImplUrl(
            normalizeUrl(data?.impl_booking_url ?? data?.call15_url ?? null)
          );
          setCoachNotesUrl(normalizeUrl(data?.coaching_notes_url ?? null));
        } else {
          // Regular user: primary coach via get_my_coach, implementation coach via get_my_implementation_coach
          // 1) Primary / momentum coach link (unchanged)
          const { data: primaryData, error: primaryErr } = await supabase.rpc(
            'get_my_coach',
            {
              _course_id: courseId ?? null,
            }
          );
          if (primaryErr) throw primaryErr;
          const primaryRow = Array.isArray(primaryData) ? primaryData[0] : primaryData;

          // 2) Implementation coach link (new)
          const { data: implData, error: implErr } = await supabase.rpc(
            'get_my_implementation_coach',
            {
              _course_id: courseId ?? null,
            }
          );
          if (implErr) throw implErr;
          const implRow = Array.isArray(implData) ? implData[0] : implData;

          if (!mounted) return;
          setM2Url(normalizeUrl(primaryRow?.m2_booking_url ?? null));
          setImplUrl(normalizeUrl(implRow?.impl_booking_url ?? null));
          setCoachNotesUrl(null); // not shown/used in user mode
        }
      } catch (e) {
        if (!mounted) return;
        console.error('ImportantLinks fetch error:', e);
        setM2Url(null);
        setImplUrl(null);
        setCoachNotesUrl(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [mode, courseId]);

  useEffect(() => {
    let mounted = true;

    if (mode === 'coach') {
      setAmbassadorHubUrl(null);
      return () => {
        mounted = false;
      };
    }

    setAmbassadorHubUrl(null);
    (async () => {
      const nextAmbassadorHubUrl = await fetchAmbassadorHubUrl();
      if (!mounted) return;
      setAmbassadorHubUrl(nextAmbassadorHubUrl);
    })();

    return () => {
      mounted = false;
    };
  }, [mode]);

  const { resolvedLinks, icons } = useMemo(() => {
    const items = baseLinks.map((item) => ({ ...item }));

    // Fill in the dynamic links if available
    const bookingIdx = items.findIndex((l) => l.label === BOOKING_LABEL);
    const implIdx = items.findIndex((l) => l.label === IMPL_LABEL);
    if (bookingIdx >= 0) items[bookingIdx].href = m2Url ?? items[bookingIdx].href;
    if (implIdx >= 0) items[implIdx].href = implUrl ?? items[implIdx].href;

    if (mode === 'coach') {
      // 1) Columnize the "Refer an agent..." pill: add it as a regular button
      items.push({ label: REFERRAL_PILL_LABEL }); // no href provided (same behavior as before)

      // 2) Add the active Business Audit implementation workspace
      items.push({ label: COACH_NOTES_LABEL, href: coachNotesUrl ?? undefined });
    }

    return {
      resolvedLinks: items,
      icons: mode === 'coach' ? iconNumbersCoach : iconNumbersUser,
    };
  }, [mode, m2Url, implUrl, coachNotesUrl]);

  // Utility to pick the correct icon number per index (guards if arrays drift)
  const iconForIndex = (i: number) => icons[i] ?? icons[icons.length - 1];
  const referralPillContent = (
    <>
      <Box
        component="img"
        src="/14.svg"
        alt=""
        sx={{
          width: '8rem',
          height: '8rem',
          position: 'absolute',
          right: '-4.5rem',
          top: '-1rem',
          borderRadius: '50%',
        }}
      />
      <Typography
        sx={{
          fontWeight: 'bolder',
          px: 5,
          flex: 1,
          textAlign: 'center',
          fontSize: '1.4rem',
        }}
      >
        {REFERRAL_PILL_LABEL}
      </Typography>
    </>
  );
  const referralPillSx = {
    display: 'flex',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
    bgcolor: '#fff',
    borderRadius: '2.5rem',
    border: '.75rem solid #d7d7d7',
    boxShadow: '0 .25rem .625rem rgba(0,0,0,.25)',
    p: 1,
    pl: 2,
    pr: 6,
    minHeight: '6.875rem',
    position: 'relative',
    transition: 'transform .15s',
    maxWidth: '35rem',
    mx: 'auto',
    color: '#000',
    textDecoration: 'none',
    '@media (hover: hover)': {
      '&:hover': { transform: ambassadorHubUrl ? 'scale(1.03)' : 'none' },
    },
  } as const;

  return (
    <section
      style={{
        background: "url('dark wall.png') center/cover, #111",
        paddingBottom: '5rem',
        width: '100%',
      }}
    >
      <Typography
        variant="h3"
        align="center"
        sx={{
          color: '#fff',
          fontWeight: 800,
          pt: 6,
          mb: 6,
          letterSpacing: 1.5,
          fontSize: { xs: 'clamp(2.25rem, 8vw, 3rem)', md: 'clamp(4rem, 6vw, 8rem)' },
        }}
      >
        COACHING LINKS
      </Typography>

      {/* MOBILE list */}
      <Box
        sx={{
          display: { xs: 'grid', md: 'none' },
          gridTemplateColumns: '1fr',
          gap: 2,
          maxWidth: '42rem',
          mx: 'auto',
          px: 2,
        }}
      >
        {resolvedLinks.map(({ label, href }, i) => {
          const clickable = Boolean(href);

          const commonSx = {
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.5,
            borderRadius: 2,
            bgcolor: clickable ? '#fff' : '#f3f3f3',
            color: '#000',
            boxShadow: clickable ? '0 4px 12px rgba(0,0,0,.20)' : 'none',
            textDecoration: 'none',
            '@media (hover: hover)': {
              '&:hover': { transform: clickable ? 'translateY(-1px)' : 'none' },
            },
            transition: 'transform .12s',
          } as const;

          const content = (
            <>
              <Box
                component="img"
                src={`/${iconForIndex(i)}.svg`}
                alt=""
                sx={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }}
              />
              <Typography
                sx={{
                  whiteSpace: 'pre-line',
                  fontWeight: 800,
                  fontSize: '1rem',
                  lineHeight: 1.3,
                  flex: 1,
                }}
              >
                {label}
              </Typography>
              {clickable && <ChevronRightIcon sx={{ flexShrink: 0, opacity: 0.5 }} aria-hidden />}
            </>
          );

          return clickable ? (
            <MuiLink
              key={`m-${i}-${label}`}
              component={NextLink}
              href={href!}
              target="_blank"
              rel="noopener noreferrer"
              underline="none"
              aria-label={`Open ${label.replace(/\n/g, ' ')}`}
              sx={commonSx}
            >
              {content}
            </MuiLink>
          ) : (
            <Box key={`m-${i}-${label}`} aria-disabled sx={commonSx}>
              {content}
            </Box>
          );
        })}
      </Box>

      {/* DESKTOP pills */}
      <Box
        sx={{
          display: { xs: 'none', md: 'grid' },
          maxWidth: '60rem',
          mx: 'auto',
          px: 2,
          gap: 5,
          gridTemplateColumns: '1fr 1fr',
        }}
      >
        {resolvedLinks.map(({ label, href }, i) => {
          const isRight = i % 2 === 1;
          const clickable = Boolean(href);

          const pillSx = {
            display: 'flex',
            flexDirection: isRight ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: 2,
            bgcolor: '#fff',
            borderRadius: '2.5rem',
            border: '.75rem solid #d7d7d7',
            boxShadow: '0 .25rem .625rem rgba(0,0,0,.25)%',
            position: 'relative',
            p: 1,
            pl: isRight ? 2 : 6,
            pr: isRight ? 6 : 2,
            minHeight: '6.875rem',
            transition: 'transform .15s',
            color: '#000',
            textDecoration: 'none',
            '@media (hover: hover)': {
              '&:hover': { transform: clickable ? 'scale(1.03)' : 'none' },
            },
          } as const;

          const content = (
            <>
              <Box
                component="img"
                src={`/${iconForIndex(i)}.svg`}
                alt=""
                sx={{
                  width: '6.25rem',
                  height: '6.25rem',
                  flexShrink: 0,
                  position: 'absolute',
                  left: isRight ? 'auto' : '-3.75rem',
                  right: isRight ? '-3.75rem' : 'auto',
                  borderRadius: '50%',
                }}
              />
              <Typography
                sx={{
                  whiteSpace: 'pre-line',
                  fontWeight: 'bolder',
                  px: 4,
                  flex: 1,
                  textAlign: 'center',
                  fontSize: '1.4rem',
                }}
              >
                {label}
              </Typography>
            </>
          );

          return clickable ? (
            <MuiLink
              key={`d-${i}-${label}`}
              component={NextLink}
              href={href!}
              target="_blank"
              rel="noopener noreferrer"
              underline="none"
              sx={pillSx}
            >
              {content}
            </MuiLink>
          ) : (
            <Box key={`d-${i}-${label}`} sx={pillSx}>
              {content}
            </Box>
          );
        })}
      </Box>

      {/* Referral pill remains ONLY in user mode (unchanged visual) */}
      {mode !== 'coach' && (
        <Box sx={{ mt: 4, mb: 3, textAlign: 'center', display: { xs: 'none', md: 'block' } }}>
          {ambassadorHubUrl ? (
            <MuiLink
              component={NextLink}
              href={ambassadorHubUrl}
              target="_blank"
              rel="noopener noreferrer"
              underline="none"
              aria-label={`Open ${REFERRAL_PILL_LABEL}`}
              sx={referralPillSx}
            >
              {referralPillContent}
            </MuiLink>
          ) : (
            <Box
              aria-disabled
              sx={{
                ...referralPillSx,
                bgcolor: '#f3f3f3',
                boxShadow: 'none',
                opacity: 0.75,
              }}
            >
              {referralPillContent}
            </Box>
          )}
        </Box>
      )}
    </section>
  );
}
