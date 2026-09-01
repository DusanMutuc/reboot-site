'use client';

import Link from 'next/link';
import { Box, Container, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
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
        <Box sx={{ py: { xs: 4, md: 5 } }}>
          <Typography
            variant="sectionLabel"
            component="h2"
            sx={{ fontSize: 17, color: brand.turquoise, mb: 2.25 }}
          >
            Stuck on something?
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0,1fr))' },
              gap: { xs: 2.5, md: 4 },
              mb: { xs: 4, md: 5 },
            }}
          >
            {helpSteps.map((step) => (
              <Box key={step.title}>
                <Typography sx={{ fontSize: 16, fontWeight: 500, color: '#ffffff', mb: 0.625 }}>
                  {step.title}
                </Typography>
                <Typography
                  sx={{ fontSize: 14, color: 'rgba(255,255,255,0.62)', lineHeight: 1.5, mb: 1 }}
                >
                  {step.detail}
                </Typography>
                <Box
                  component={Link}
                  href={step.href}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    fontSize: 14,
                    fontWeight: 500,
                    color: brand.turquoise,
                    '&:hover': { color: '#ffffff' },
                  }}
                >
                  {step.actionLabel}
                  <ArrowForwardRoundedIcon sx={{ fontSize: 15 }} />
                </Box>
              </Box>
            ))}
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
