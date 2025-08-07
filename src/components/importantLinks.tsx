'use client';

import {
  Box,
  Button,
  Link as MuiLink,
  Typography,
} from '@mui/material';

type LinkItem = { label: string; href?: string };

const links: LinkItem[] = [
  {
    label: 'REBOOT TRAINING,\nTOOLS & COURSE',
    href: 'https://agentfromwithin.upcoach.com/',
  },
  { label: 'REBOOT CALENDAR', href: 'https://www.addevent.com/calendar/ez616853' },
  {
    label: 'MOMENTUM COACH \nBOOKING LINK',
    href: 'https://api.leadconnectorhq.com/widget/bookings/assistant_on',
  },
  { label: 'REBOOT COACHING \nZOOM LINK', href: 'https://zoom.us/j/93233351653' },
  { label: 'ASSISTANT WORKROOM \nZOOM LINK', href: 'https://zoom.us/j/99652221215' },
  { label: 'MOMENTUM COACH 15 MIN CALL LINK' },
  {
    label: 'ASSISTANT ONBOARDING',
    href: 'https://api.leadconnectorhq.com/widget/bookings/assistant_on',
  },
  { label: 'REBOOT SYSTEMS EXPLAINERS', href: 'https://vimeo.com/showcase/11715034' },
  {
    label: 'REBOOT FACEBOOK GROUP',
    href: 'https://www.facebook.com/groups/realestatereboot',
  },
  { label: 'FIND A REBOOT AGENT TO REFER YOUR CLIENTS' },
];
const iconNumbers = [5, 6, 7, 8, 8, 9, 10, 11, 12, 13];
export default function ImportantLinks() {
  return (
    <section
      style={{
        background:
          "url('dark wall.png') center/cover, #111",
        paddingBottom: 80,
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
          pt: 6,
          mb: 6,
          letterSpacing: 1.5,
          fontSize: { xs: '4rem', md: '8rem' },
        }}
      >
        COACHING LINKS
      </Typography>

      {/* ── Links grid (CSS Grid) ──────────────────────── */}
      <Box
  sx={{
    maxWidth: 960,
    mx: 'auto',
    px: 2,
    display: 'grid',
    gap: 3,
    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
  }}
>
  {links.map(({ label, href }, i) => {
    const isRight = i % 2 === 1;        // right-hand column?
    return (
      <Box
        key={label}
        sx={{
          display: 'flex',
          flexDirection: isRight ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: 2,
          height: 110,
          bgcolor: '#fff',
          whiteSpace: 'pre-line',
          borderRadius: 40,               // pill
          border: '12px solid #d7d7d7',   // light grey ring
          boxShadow: '0 4px 10px rgba(0,0,0,.25)',
          px: isRight ? '72px 16px 16px 32px' : '32px 16px 16px 72px', // L / R padding
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
            width: 100,
            height: 100,
            flexShrink: 0,
            position: 'absolute',
            marginLeft: isRight ? 0 : '-60px',   // half-overlap
            marginRight: isRight ? '-60px' : 0,
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
            sx={{ fontWeight: 'bolder', color: '#000',px: 5, flex: 1, textAlign: 'center', fontSize: { xs: '1rem', md: '1.4rem' }  }}
          >
            {label}
          </MuiLink>
        ) : (
          <Typography sx={{ml: 6, fontWeight: 'bolder', px: 5, flex: 1, textAlign: 'center', fontSize: { xs: '1rem', md: '1.4rem' }  }}>
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
      display: 'inline-flex',
      flexDirection: 'row-reverse',     // Changed to row-reverse
      alignItems: 'left',
      gap: 2,
      bgcolor: '#fff',
      borderRadius: 40,               // pill
      border: '12px solid #d7d7d7',   // light grey ring
      boxShadow: '0 4px 10px rgba(0,0,0,.25)',
      px: '72px 16px 16px 32px',     // Changed padding for right-aligned
      py: 4,
      position: 'relative',
      transition: 'transform .15s',
      '&:hover': { transform: 'scale(1.03)' },
    }}
  >
    {/* icon */}
    <Box
      component="img"
      src="/14.svg"
      alt=""
      sx={{
        width: 120,
        height: 120,
        position: 'absolute',          // Remove from normal flow
        right: -90,                    // Position from right edge
        top: '40%',                    // Center vertically
        transform: 'translateY(-50%)', // Perfect vertical centering
        zIndex: 1,                     // Ensure it's visible
      }}
    />

    {/* label */}
    <Typography sx={{ fontWeight: 'bolder' ,ml: 1, paddingLeft: 4, paddingRight: 5, flex: 1, textAlign: 'left', fontSize: { xs: '1rem', md: '1.3rem' } }}>
       REFER AN AGENT TO OUR PROGRAM
    </Typography>
  </Box>
</Box>





    </section>
  );
}
