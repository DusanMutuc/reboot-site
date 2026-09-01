'use client';

import Link from 'next/link';
import { Box, Container, Typography } from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { brand, HOME_MAX_WIDTH } from '@/lib/homeTheme';
import type { HelpStep, UtilityLink } from './types';

/** Help and community links from the redesigned member-home baseline. */
export function HubFooter({
  helpSteps,
  links,
  flush = false,
}: {
  helpSteps: HelpStep[];
  links: UtilityLink[];
  flush?: boolean;
}) {
  const supportStep = helpSteps.find((step) => step.title === 'Something is broken') ?? {
    title: 'Something is broken',
    detail: 'Login trouble, a missing training, or numbers that look wrong.',
    actionLabel: 'Contact support',
    href: '/support',
  };

  return (
    <Box
      component="footer"
      id="help"
      sx={{
        mt: flush ? 0 : { xs: 6, md: 9 },
        bgcolor: brand.slate,
        color: '#ffffff',
      }}
    >
      <Container maxWidth={false} sx={{ maxWidth: HOME_MAX_WIDTH, px: { xs: 2.5, md: 4 } }}>
        <Box sx={{ py: { xs: 3.5, md: 4.5 } }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'auto minmax(0,1fr)', md: 'auto minmax(0,1fr) auto' },
              alignItems: 'center',
              columnGap: { xs: 1.75, md: 2.25 },
              rowGap: 2,
              mb: { xs: 3.5, md: 4.5 },
            }}
          >
            <WarningAmberRoundedIcon sx={{ fontSize: 28, color: '#69b7ff' }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 600, color: '#ffffff', mb: 0.375 }}>
                {supportStep.title}
              </Typography>
              <Typography sx={{ fontSize: 14, color: 'rgba(255,255,255,0.66)', lineHeight: 1.45 }}>
                {supportStep.detail}
              </Typography>
            </Box>
            <Box
              component={Link}
              href={supportStep.href}
              sx={{
                gridColumn: { xs: '1 / -1', md: 'auto' },
                justifySelf: { xs: 'stretch', sm: 'start', md: 'end' },
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 40,
                px: 2.25,
                border: '1px solid rgba(255,255,255,0.24)',
                borderRadius: '9px',
                fontSize: 14.5,
                fontWeight: 600,
                color: '#ffffff',
                transition: 'border-color .16s ease, background-color .16s ease',
                '&:hover': {
                  borderColor: 'rgba(255,255,255,0.5)',
                  bgcolor: 'rgba(255,255,255,0.06)',
                },
              }}
            >
              {supportStep.actionLabel}
            </Box>
          </Box>

          <Box
            sx={{
              pt: 3,
              borderTop: '1px solid rgba(255,255,255,0.14)',
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0,1fr))',
                md: 'repeat(3, minmax(0,1fr))',
                lg: 'repeat(6, minmax(0,1fr))',
              },
              gap: { xs: 1.25, md: 2 },
              mb: 3,
            }}
          >
            {links.map((link) => (
              <Box
                key={link.label}
                component={Link}
                href={link.href}
                sx={{
                  fontSize: 14,
                  lineHeight: 1.45,
                  color: 'rgba(255,255,255,0.72)',
                  '&:hover': { color: brand.turquoise },
                }}
              >
                {link.label}
              </Box>
            ))}
          </Box>

          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography sx={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
              Real Estate Reboot Coaching
            </Typography>
            <Box sx={{ display: 'flex', gap: 2.5 }}>
              <Box component={Link} href="/privacy-policy" sx={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', '&:hover': { color: brand.turquoise } }}>
                Privacy policy
              </Box>
              <Box component={Link} href="/support" sx={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', '&:hover': { color: brand.turquoise } }}>
                Support
              </Box>
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
