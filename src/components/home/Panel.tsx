'use client';

import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { brand, CARD_RADIUS } from '@/lib/homeTheme';

export function Panel({
  label,
  children,
  delayMs = 0,
  id,
}: {
  label: string;
  children: React.ReactNode;
  delayMs?: number;
  id?: string;
}) {
  return (
    <Box
      component="section"
      id={id}
      sx={{
        bgcolor: brand.card,
        border: `1px solid ${brand.border}`,
        borderRadius: CARD_RADIUS,
        p: { xs: 2.5, md: 3 },
        animation: 'homeRise .38s ease-out both',
        animationDelay: `${delayMs}ms`,
      }}
    >
      <Typography variant="sectionLabel" component="h2" sx={{ color: brand.ink, mb: 2.25 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}

export function GroupLabel({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return (
    <Typography
      variant="kicker"
      sx={{
        display: 'block',
        color: brand.inkMuted,
        mb: 1,
        ...sx,
      }}
    >
      {children}
    </Typography>
  );
}

/**
 * A single tappable destination. Large hit area and an explicit chevron, since
 * the audience skims rather than reads.
 */
export function ActionRow({
  icon,
  label,
  sublabel,
  href,
  emphasis = false,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  href: string;
  emphasis?: boolean;
}) {
  return (
    <Box
      component={Link}
      href={href}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 1.75,
        py: 1.5,
        minHeight: 54,
        borderRadius: '10px',
        border: `1px solid ${emphasis ? brand.borderStrong : brand.border}`,
        bgcolor: brand.card,
        transition: 'border-color .16s ease, background-color .16s ease, transform .16s ease',
        '&:hover': {
          borderColor: brand.turquoise,
          bgcolor: brand.turquoiseTint,
          transform: 'translateY(-1px)',
        },
        '&:hover .home-action-arrow': { opacity: 1, transform: 'translateX(2px)' },
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          display: 'grid',
          placeItems: 'center',
          color: brand.turquoiseDeep,
          fontSize: 20,
          '& svg': { fontSize: 21 },
        }}
      >
        {icon}
      </Box>

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="cardTitle" sx={{ fontSize: 16, color: brand.ink }}>
          {label}
        </Typography>
        {sublabel ? (
          <Typography sx={{ fontSize: 13, color: brand.inkMuted, mt: 0.125 }}>{sublabel}</Typography>
        ) : null}
      </Box>

      <ArrowForwardRoundedIcon
        className="home-action-arrow"
        aria-hidden="true"
        sx={{
          fontSize: 18,
          color: brand.inkMuted,
          opacity: 0.45,
          transition: 'opacity .16s ease, transform .16s ease',
        }}
      />
    </Box>
  );
}
