'use client';

import Link from 'next/link';
import { Box, Container, Typography } from '@mui/material';
import { brand, HOME_MAX_WIDTH } from '@/lib/homeTheme';
import type { UtilityLink } from './types';

/**
 * Everything a member touches a handful of times a year. Present and findable,
 * but not competing with booking or training for attention.
 */
export default function UtilityFooter({ links }: { links: UtilityLink[] }) {
  return (
    <Box component="footer" sx={{ mt: { xs: 5, md: 7 }, bgcolor: brand.slate, color: '#ffffff' }}>
      <Container maxWidth={false} sx={{ maxWidth: HOME_MAX_WIDTH, px: { xs: 2.5, md: 4 } }}>
        <Box sx={{ py: { xs: 3.5, md: 4 } }}>
          <Typography
            variant="sectionLabel"
            component="h2"
            sx={{ fontSize: 12.5, letterSpacing: '0.14em', color: brand.turquoise, mb: 2 }}
          >
            Everything else
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(3, minmax(0, 1fr))',
                lg: 'repeat(6, minmax(0, 1fr))',
              },
              gap: { xs: 1.25, md: 2 },
            }}
          >
            {links.map((link) => (
              <Box
                key={link.label}
                component={Link}
                href={link.href}
                sx={{
                  fontFamily: '"Poppins", Arial, sans-serif',
                  fontSize: 14,
                  lineHeight: 1.45,
                  color: 'rgba(255,255,255,0.78)',
                  transition: 'color .16s ease',
                  '&:hover': { color: brand.turquoise },
                }}
              >
                {link.label}
              </Box>
            ))}
          </Box>

          <Box
            sx={{
              mt: { xs: 3, md: 3.5 },
              pt: 2.25,
              borderTop: '1px solid rgba(255,255,255,0.14)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography sx={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)' }}>
              Real Estate Reboot Coaching
            </Typography>
            <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap' }}>
              <Box
                component={Link}
                href="/privacy-policy"
                sx={{
                  fontSize: 12.5,
                  color: 'rgba(255,255,255,0.5)',
                  '&:hover': { color: brand.turquoise },
                }}
              >
                Privacy policy
              </Box>
              <Box
                component={Link}
                href="/support"
                sx={{
                  fontSize: 12.5,
                  color: 'rgba(255,255,255,0.5)',
                  '&:hover': { color: brand.turquoise },
                }}
              >
                Support
              </Box>
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
