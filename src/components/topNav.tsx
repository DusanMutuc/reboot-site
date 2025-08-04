'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppBar, Toolbar, Button } from '@mui/material';

const SECTIONS = [
  { id: 'calendar',  label: 'Calendar / News' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'podcast',   label: 'Podcast' },
  { id: 'links',     label: 'Links' },
  { id: 'library',   label: 'Library' },
  { id: 'help',      label: 'Help' },
];

export default function TopNav() {
  const [active, setActive] = useState<string>('dashboard');

  // --- ScrollSpy: watch which section is in view
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        });
      },
      {
        /** 25 % of the section visible is enough to “count” */
        threshold: 0.25,
        /** only shrink the *top* margin; leave the bottom alone  */
        rootMargin: '-40% 0px 0px 0px',
      }
    );

    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <AppBar position="fixed" elevation={1} sx={{ backgroundColor: '#fff' }}>
      <Toolbar sx={{ gap: 2 }}>
        {SECTIONS.map(s => (
          <Link key={s.id} href={`#${s.id}`} passHref>
            <Button
              size="small"
              sx={{
                fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif',
                fontSize: '1.25rem',
                textTransform: 'none',
                fontWeight: active === s.id ? 600 : 400,
                borderBottom: active === s.id ? '2px solid #1976d2' : 'none',
              }}
            >
              {s.label}
            </Button>
          </Link>
        ))}
      </Toolbar>
    </AppBar>
  );
}
