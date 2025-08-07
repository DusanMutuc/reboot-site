'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppBar, Toolbar, Button } from '@mui/material';

const SECTIONS = [
  { id: 'links',     label: 'COACHING LINKS' },
  { id: 'podcast',   label: 'REPLAY PODCAST' },
  { id: 'library',   label: 'PROGRAM SEARCH ENGINE' },
  { id: 'dashboard', label: 'YOUR M2 TRACKER' },
  { id: 'help',      label: 'HOW TO GET HELP' },
];

export default function TopNav() {
  const [active, setActive] = useState<string>('dashboard');

  /* ── Scroll-spy ─────────────────────────────────────── */
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
      position="fixed" 
      square 
      elevation={0} 
      sx={{ 
        bgcolor: '#000', 
        py: 1,
        borderRadius: 0,  // Explicitly remove border radius
        left: 0,          // Ensure it starts at the very left edge
        right: 0,         // Ensure it extends to the very right edge
        width: '100%'     // Full width
      }}
    >
      <Toolbar sx={{ gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
        {SECTIONS.map(({ id, label }) => {
          const isActive = active === id;
          return (
            <Link key={id} href={`#${id}`} passHref>
              <Button
                size="small"
                disableElevation
                sx={{
                  px: 3.5,
                  py: 1.2,
                  bgcolor: isActive ? '#000 !important' : '#f1f1f1 !important ',
                  color: isActive ? '#fff !important' : '#000 !important',
                  fontWeight: 700,
                  fontFamily:
                    '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif',
                  fontSize: '0.85rem',
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
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
      </Toolbar>
    </AppBar>
  );
}
