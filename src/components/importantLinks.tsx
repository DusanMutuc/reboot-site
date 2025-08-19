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
      const { data, error } = await supabase.rpc('get_my_coach_links');
      if (!mounted) return;
      if (error) {
        console.error('get_my_coach_links error:', error);
        setM2Url(null);
        setCall15Url(null);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      const m2  = normalizeUrl(row?.m2_booking_url ?? null);
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
          fontSize: { xs: 'clamp(2.25rem, 8vw, 3rem)', md: 'clamp(4rem, 6vw, 8rem)' },
        }}
      >
        COACHING LINKS
      </Typography>

      {/* ───────────────────── MOBILE (xs–sm): LIST CARDS ───────────────────── */}
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
        src={`/${iconNumbers[i]}.svg`}
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

      {/* ───────────────────── DESKTOP (md+): ORIGINAL PILLS ───────────────────── */}
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
    boxShadow: '0 .25rem .625rem rgba(0,0,0,.25)',
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
        src={`/${iconNumbers[i]}.svg`}
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
          px: 5,
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

      {/* Bottom referral card — unchanged, but you can give it the same mobile treatment later */}
      <Box sx={{ mt: 4, mb: 3, textAlign: 'center', display: { xs: 'none', md: 'block' } }}>
        <Box
          sx={{
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
            REFER AN AGENT TO OUR PROGRAM
          </Typography>
        </Box>
      </Box>
    </section>
  );
}
