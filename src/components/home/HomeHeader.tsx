'use client';

import Link from 'next/link';
import { Box, Container, Typography } from '@mui/material';
import { brand, HOME_MAX_WIDTH } from '@/lib/homeTheme';

const NAV_ITEMS = [
  { label: 'Home', href: '/home', active: true },
  { label: 'Training', href: '#training', active: false },
  { label: 'Calls', href: '#calls', active: false },
  { label: 'My numbers', href: '/tracker', active: false },
  { label: 'Help', href: '/support', active: false },
];

export default function HomeHeader({ memberFirstName }: { memberFirstName: string }) {
  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        bgcolor: brand.slate,
        borderBottom: `3px solid ${brand.turquoise}`,
      }}
    >
      <Container maxWidth={false} sx={{ maxWidth: HOME_MAX_WIDTH, px: { xs: 2.5, md: 4 } }}>
        <Box
          sx={{
            minHeight: 72,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 3,
          }}
        >
          <Box
            component={Link}
            href="/home"
            sx={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
          >
            <Box
              component="img"
              src="/Reboot Coaching Logo - White.png"
              alt="Reboot Coaching"
              sx={{ height: 30, width: 'auto', display: 'block' }}
            />
          </Box>

          <Box
            component="nav"
            sx={{
              display: { xs: 'none', md: 'flex' },
              alignItems: 'center',
              gap: 0.5,
              ml: 'auto',
            }}
          >
            {NAV_ITEMS.map((item) => (
              <Box
                key={item.label}
                component={Link}
                href={item.href}
                sx={{
                  position: 'relative',
                  px: 1.75,
                  py: 1,
                  fontFamily: '"Poppins", Arial, sans-serif',
                  fontSize: 15,
                  fontWeight: item.active ? 600 : 400,
                  color: item.active ? '#ffffff' : 'rgba(255,255,255,0.72)',
                  borderRadius: '8px',
                  transition: 'color .16s ease, background-color .16s ease',
                  '&:hover': { color: '#ffffff', bgcolor: 'rgba(255,255,255,0.08)' },
                  '&::after': item.active
                    ? {
                        content: '""',
                        position: 'absolute',
                        left: 14,
                        right: 14,
                        bottom: -2,
                        height: 3,
                        bgcolor: brand.turquoise,
                        borderRadius: '2px 2px 0 0',
                      }
                    : undefined,
                }}
              >
                {item.label}
              </Box>
            ))}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexShrink: 0 }}>
            <Typography
              sx={{
                display: { xs: 'none', lg: 'block' },
                fontSize: 14,
                color: 'rgba(255,255,255,0.72)',
              }}
            >
              {memberFirstName}
            </Typography>
            <Box
              aria-hidden="true"
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                bgcolor: brand.turquoise,
                color: brand.ink,
                display: 'grid',
                placeItems: 'center',
                fontFamily: '"League Spartan", Arial, sans-serif',
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              {memberFirstName.slice(0, 1).toUpperCase()}
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
