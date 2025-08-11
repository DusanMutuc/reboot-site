'use client';

import { Box, Link as MuiLink, Typography } from '@mui/material';

type LinkItem = { label: string; href?: string };

const links: LinkItem[] = [
  { label: 'REBOOT TRAINING,\nTOOLS & COURSE', href: 'https://agentfromwithin.upcoach.com/' },
  { label: 'REBOOT CALENDAR', href: 'https://www.addevent.com/calendar/ez616853' },
  { label: 'MOMENTUM COACH \nBOOKING LINK', href: 'https://api.leadconnectorhq.com/widget/bookings/assistant_on' },
  { label: 'REBOOT COACHING \nZOOM LINK', href: 'https://zoom.us/j/93233351653' },
  { label: 'ASSISTANT WORKROOM \nZOOM LINK', href: 'https://zoom.us/j/99652221215' },
  { label: 'MOMENTUM COACH 15 MIN CALL LINK' },
  { label: 'ASSISTANT ONBOARDING', href: 'https://api.leadconnectorhq.com/widget/bookings/assistant_on' },
  { label: 'REBOOT SYSTEMS EXPLAINERS', href: 'https://vimeo.com/showcase/11715034' },
  { label: 'REBOOT FACEBOOK GROUP', href: 'https://www.facebook.com/groups/realestatereboot' },
  { label: 'FIND A REBOOT AGENT TO REFER YOUR CLIENTS' },
];

const iconNumbers = [5, 6, 7, 8, 8, 9, 10, 11, 12, 13];

// px → rem conversions (16px base):
// 80 → 5rem, 960 → 60rem, 110 → 6.875rem, 100 → 6.25rem, 120 → 7.5rem
// 72 → 4.5rem, 32 → 2rem, 16 → 1rem, 60 → 3.75rem, 90 → 5.625rem
// border 12px → 0.75rem, radius 40px → 2.5rem, shadow (4px/10px) → .25rem/.625rem

export default function ImportantLinks() {
  return (
    <section
      style={{
        background: "url('dark wall.png') center/cover, #111",
        paddingBottom: '5rem',
        width: '100%',
      }}
    >
      {/* ── Section title ──────────────────────────────── */}
      <Typography
        variant="h3"
        align="center"
        sx={{
          color: '#fff',
          fontWeight: 800,
          pt: 6, // theme spacing-friendly
          mb: 6,
          letterSpacing: 1.5,
          // responsive, rem-based
          fontSize: { xs: 'clamp(2.25rem, 8vw, 4rem)', md: 'clamp(4rem, 6vw, 8rem)' },
        }}
      >
        COACHING LINKS
      </Typography>

      {/* ── Links grid (CSS Grid) ──────────────────────── */}
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
        {links.map(({ label, href }, i) => {
          const isRight = i % 2 === 1;
          return (
            <Box
              key={label}
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
                px: isRight
                  ? '4.5rem 1rem 1rem 2rem' // R-heavy padding
                  : '2rem 1rem 1rem 4.5rem', // L-heavy padding
                py: 1,
                position: 'relative',
                transition: 'transform .15s',
                '&:hover': { transform: href ? 'scale(1.03)' : 'none' },
              }}
            >
              {/* icon */}
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

              {/* label */}
              {href ? (
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
                    fontSize: { xs: '1rem', md: '1.4rem' }, // rem-based already
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

      {/* ── Refer-an-agent CTA ─────────────────────────── */}
      <Box sx={{ mt: 4, mb: 3, textAlign: 'center' }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row-reverse', // icon on right
            alignItems: 'center',
            gap: 2,
            height: '6.875rem', // same height as others
            bgcolor: '#fff',
            whiteSpace: 'pre-line',
            borderRadius: '2.5rem',
            border: '.75rem solid #d7d7d7',
            boxShadow: '0 .25rem .625rem rgba(0,0,0,.25)',
            px: '2rem 1rem 1rem 4.5rem', // same as "isRight" padding
            py: 1,
            position: 'relative',
            transition: 'transform .15s',
            '&:hover': { transform: 'scale(1.03)' },
            maxWidth: '35rem', // match grid container width
            mx: 'auto',
          }}
        >
          {/* icon */}
          <Box
            component="img"
            src="/14.svg"
            alt=""
            sx={{
              width: '8rem', // match others
              height: '8rem',
              flexShrink: 0,
              position: 'absolute',
              marginRight: '-4.5rem', // match "isRight" margin
              marginTop: '-1rem',
              borderRadius: '50%',
            }}
          />

          {/* label */}
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
