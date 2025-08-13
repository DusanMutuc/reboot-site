'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Link as MuiLink, Typography, Alert } from '@mui/material';
import { supabase } from '@/lib/supabaseClient';

type LinkItem = { label: string; href?: string };

const links: LinkItem[] = [
  { label: 'REBOOT TRAINING,\nTOOLS & COURSE', href: 'https://agentfromwithin.upcoach.com/' },
  { label: 'REBOOT CALENDAR', href: 'https://www.addevent.com/calendar/ez616853' },
  { label: 'MOMENTUM COACH \nBOOKING LINK' },
  { label: 'REBOOT COACHING \nZOOM LINK', href: 'https://zoom.us/j/93233351653' },
  { label: 'ASSISTANT WORKROOM \nZOOM LINK', href: 'https://zoom.us/j/99652221215' },
  { label: 'MOMENTUM COACH 15 MIN CALL LINK' },
  { label: 'ASSISTANT ONBOARDING', href: 'https://api.leadconnectorhq.com/widget/bookings/assistant_on' },
  { label: 'REBOOT SYSTEMS EXPLAINERS', href: 'https://vimeo.com/showcase/11715034' },
  { label: 'REBOOT FACEBOOK GROUP', href: 'https://www.facebook.com/groups/realestatereboot' },
  { label: 'FIND A REBOOT AGENT TO REFER YOUR CLIENTS' },
];

const BOOKING_LABEL = 'MOMENTUM COACH \nBOOKING LINK';
const CALL15_LABEL  = 'MOMENTUM COACH 15 MIN CALL LINK';
const bookingIdx = links.findIndex(l => l.label === BOOKING_LABEL);
const call15Idx  = links.findIndex(l => l.label === CALL15_LABEL);

const iconNumbers = [5, 6, 7, 8, 8, 9, 10, 11, 12, 13];

function normalizeUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w.-]+\.[a-z]{2,}([/:].*)?$/i.test(t)) return `https://${t}`;
  return t;
}

export default function ImportantLinks() {
  const [m2Url, setM2Url] = useState<string | null>(null);
  const [call15Url, setCall15Url] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.rpc('get_my_coach_links');
      if (!mounted) return;

      const row = Array.isArray(data) ? data[0] : data;
      const m2 = normalizeUrl(row?.m2_booking_url ?? null);
      const c15 = normalizeUrl(row?.call15_url ?? null);

      setM2Url(m2);
      setCall15Url(c15);
    })();

    return () => { mounted = false; };
  }, []);

  const resolvedLinks = useMemo(() => {
    const out = links.map((item) => ({ ...item }));
    if (bookingIdx >= 0) out[bookingIdx].href = m2Url ?? out[bookingIdx].href;
    if (call15Idx  >= 0) out[call15Idx].href  = call15Url ?? out[call15Idx].href;
    return out;
  }, [m2Url, call15Url]);

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
          fontSize: { xs: 'clamp(2.25rem, 8vw, 4rem)', md: 'clamp(4rem, 6vw, 8rem)' },
        }}
      >
        COACHING LINKS
      </Typography>

      <Box
        sx={{
          maxWidth: '60rem',
          mx: 'auto',
          px: 2,
          display: 'grid',
          gap: 5,
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
        }}
      >
        {resolvedLinks.map(({ label, href }, i) => {
          const isRight = i % 2 === 1;
          const clickable = Boolean(href);

          return (
            <Box
              key={`${i}-${label}`}
              sx={{
                display: 'flex',
                flexDirection: isRight ? 'row-reverse' : 'row',
                alignItems: 'center',
                gap: 2,
                height: '6.875rem',
                bgcolor: '#fff',
                whiteSpace: 'pre-line',
                borderRadius: '2.5rem',
                border: '.75rem solid #d7d7d7',
                boxShadow: '0 .25rem .625rem rgba(0,0,0,.25)',
                px: isRight ? '4.5rem 1rem 1rem 2rem' : '2rem 1rem 1rem 4.5rem',
                py: 1,
                position: 'relative',
                transition: 'transform .15s',
                '&:hover': { transform: clickable ? 'scale(1.03)' : 'none' },
                opacity: 1
              }}
            >
              <Box
                component="img"
                src={`/${iconNumbers[i]}.svg`}
                alt=""
                sx={{
                  width: '6.25rem',
                  height: '6.25rem',
                  flexShrink: 0,
                  position: 'absolute',
                  marginLeft: isRight ? 0 : '-3.75rem',
                  marginRight: isRight ? '-3.75rem' : 0,
                  borderRadius: '50%',
                }}
              />

              {clickable ? (
                <MuiLink
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="none"
                  sx={{
                    fontWeight: 'bolder',
                    color: '#000',
                    px: 5,
                    flex: 1,
                    textAlign: 'center',
                    fontSize: { xs: '1rem', md: '1.4rem' },
                  }}
                >
                  {label}
                </MuiLink>
              ) : (
                <Typography
                  sx={{
                    ml: 6,
                    fontWeight: 'bolder',
                    px: 5,
                    flex: 1,
                    textAlign: 'center',
                    fontSize: { xs: '1rem', md: '1.4rem' },
                  }}
                >
                  {label}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>

      <Box sx={{ mt: 4, mb: 3, textAlign: 'center' }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row-reverse',
            alignItems: 'center',
            gap: 2,
            height: '6.875rem',
            bgcolor: '#fff',
            whiteSpace: 'pre-line',
            borderRadius: '2.5rem',
            border: '.75rem solid #d7d7d7',
            boxShadow: '0 .25rem .625rem rgba(0,0,0,.25)',
            px: '2rem 1rem 1rem 4.5rem',
            py: 1,
            position: 'relative',
            transition: 'transform .15s',
            '&:hover': { transform: 'scale(1.03)' },
            maxWidth: '35rem',
            mx: 'auto',
          }}
        >
          <Box
            component="img"
            src="/14.svg"
            alt=""
            sx={{
              width: '8rem',
              height: '8rem',
              position: 'absolute',
              marginRight: '-4.5rem',
              marginTop: '-1rem',
              borderRadius: '50%',
            }}
          />
          <Typography
            sx={{
              fontWeight: 'bolder',
              px: 5,
              flex: 1,
              textAlign: 'center',
              fontSize: { xs: '1rem', md: '1.4rem' },
            }}
          >
            REFER AN AGENT TO OUR PROGRAM
          </Typography>
        </Box>
      </Box>
    </section>
  );
}
