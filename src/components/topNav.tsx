'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppBar, Toolbar, Button, Box, Typography } from '@mui/material';

const SECTIONS = [
  { id: 'links',     label: 'COACHING LINKS' },
  { id: 'podcast',   label: 'REPLAY PODCAST' },
  { id: 'library',   label: 'PROGRAM SEARCH ENGINE' },
  { id: 'dashboard', label: 'YOUR M2 TRACKER' },
  { id: 'help',      label: 'HOW TO GET HELP' },
];

export default function TopNav() {
  const [active, setActive] = useState<string>('dashboard');

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => e.isIntersecting && setActive(e.target.id)),
      { threshold: 0.25, rootMargin: '-40% 0px 0px 0px' }
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <AppBar
      id="appbar"
      position="fixed"
      elevation={0}
      sx={{ bgcolor: '#000', py: 2, borderRadius: 0, left: 0, right: 0, width: '100%' }}
    >
      <Toolbar
        disableGutters
        sx={{
          px: 3,
          display: 'flex',
          justifyContent: 'center', // center the shrinking inner container
        }}
      >
        {/* Shrinking inner container: width equals the buttons' natural width */}
        <Box
          sx={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: 2,
            width: 'max-content', // <-- key: shrink to content (the buttons row)
          }}
        >
          {/* Top row: spans same width as buttons; title left, logo right */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              // optional small side padding to visually match button paddings:
              // px: { xs: 1, sm: 1.5, md: 2 },
            }}
          >
            <Typography
              variant="h6"
              sx={(theme) => ({
                fontWeight: 900,
                letterSpacing: 1,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                color: theme.palette.turquoise?.main || '#5cbca8',
                fontSize: { xs: '1.1rem', sm: '2rem', md: '3rem' },
              })}
            >
              REBOOT MEMBER&apos;S HUB
            </Typography>

            <Box
              component="img"
              src="/Reboot Logo - Color.png"
              alt="Reboot logo"
              sx={{ height: { xs: 33, sm: 39, md: 45 }, width: 'auto' }}
            />
          </Box>

          {/* Buttons row: centered with fixed gap; defines the container width */}
          <Box
            sx={{
              display: 'inline-flex',
              gap: { xs: 2, sm: 3, md: 4, lg: 5 },
              whiteSpace: 'nowrap',
              alignSelf: 'center',
            }}
          >
            {SECTIONS.map(({ id, label }) => {
              const isActive = active === id;
              return (
                <Link key={id} href={`#${id}`} passHref>
                  <Button
                    disableElevation
                    sx={{
                      px: { xs: 2.25, sm: 2.75, md: 3.5, lg: 4 },
                      py: { xs: 1.2, sm: 1.3, md: 1.6, lg: 1.8 },
                      fontSize: { xs: '1.05rem', sm: '1.2rem', md: '1.4rem', lg: '1.6rem' },
                      lineHeight: 1.2,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                      fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif',
                      bgcolor: isActive ? '#000 !important' : '#f1f1f1 !important',
                      color: isActive ? '#fff !important' : '#000 !important',
                      boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
                      transition: 'all .15s',
                      '&:hover': {
                        bgcolor: isActive ? '#000 !important' : '#d0d0d0',
                        color: isActive ? '#fff !important' : '#000',
                        transform: 'translateY(-2px)',
                      },
                    }}
                  >
                    {label}
                  </Button>
                </Link>
              );
            })}
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
