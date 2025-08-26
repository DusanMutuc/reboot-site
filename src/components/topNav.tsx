'use client';

import { useEffect, useState } from 'react';
import {
  AppBar, Toolbar, Button, Box, Typography,
  IconButton, Drawer, List, ListItemButton
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';

type Section = { id: string; label: string };

const DEFAULT_SECTIONS: Section[] = [
  { id: 'links',     label: 'COACHING LINKS' },
  { id: 'podcast',   label: 'REPLAY PODCAST' },
  { id: 'library',   label: 'PROGRAM SEARCH ENGINE' },
  { id: 'dashboard', label: 'YOUR M2 TRACKER' },
  { id: 'help',      label: 'HOW TO GET HELP' },
];

export default function TopNav({
  sections = DEFAULT_SECTIONS,
  title = "REBOOT MEMBER'S HUB",
}: {
  sections?: Section[];
  title?: string;
}) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? '');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => e.isIntersecting && setActive(e.target.id)),
      { threshold: 0.25, rootMargin: '-40% 0px 0px 0px' }
    );

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sections]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // keep the URL hash in sync without a full jump
    history.replaceState(null, '', `#${id}`);
  };

  return (
    <>
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
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 2,
              width: { xs: '100%', md: 'max-content' },
            }}
          >
            {/* Header row — grid on mobile (logo | title | menu), flex on desktop (title ... logo) */}
            <Box
              sx={{
                display: { xs: 'grid', md: 'flex' },
                gridTemplateColumns: { xs: 'auto 1fr auto', md: 'unset' },
                alignItems: 'center',
                justifyContent: { xs: 'unset', md: 'space-between' },
                gap: 2,
                width: '100%',
                minWidth: 0,
              }}
            >
              {/* Logo */}
              <Box
                component="img"
                src="/Reboot Logo - Color.png"
                alt="Reboot logo"
                sx={{
                  height: { xs: 28, sm: 32, md: 45 },
                  width: 'auto',
                  order: { xs: 0, md: 2 },
                }}
              />

              {/* Title */}
              <Typography
                variant="h6"
                sx={(theme) => ({
                  justifySelf: { xs: 'center', md: 'unset' },
                  fontWeight: 900,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  color: theme.palette.turquoise?.main || '#5cbca8',
                  fontSize: { xs: '1.1rem', sm: '1.5rem', md: '3rem' },
                  order: { xs: 1, md: 0 },
                })}
              >
                {title}
              </Typography>

              {/* Hamburger (mobile) */}
              <Box sx={{ justifySelf: 'end', display: { xs: 'block', md: 'none' }, order: { xs: 2 } }}>
                <IconButton
                  aria-label="Open menu"
                  onClick={() => setDrawerOpen(true)}
                  sx={{ color: '#fff' }}
                >
                  <MenuIcon />
                </IconButton>
              </Box>
            </Box>

            {/* DESKTOP NAV (pills) */}
            <Box
              sx={{
                display: { xs: 'none', md: 'inline-flex' },
                alignSelf: 'center',
                gap: { md: 4, lg: 5 },
              }}
            >
              {sections.map(({ id, label }) => {
                const isActive = active === id;
                return (
                  <Button
                    key={id}
                    onClick={() => scrollTo(id)}
                    disableElevation
                    sx={{
                      px: { md: 3.5, lg: 4 },
                      py: { md: 1.6, lg: 1.8 },
                      fontSize: { md: '1.4rem', lg: '1.6rem' },
                      lineHeight: 1.2,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                      fontFamily:
                        '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif',
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
                );
              })}
            </Box>
          </Box>
        </Toolbar>
      </AppBar>

      {/* MOBILE DRAWER NAV */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { bgcolor: '#111', color: '#fff', width: 300 } }}
      >
        <List sx={{ pt: 2 }}>
          {sections.map(({ id, label }) => (
            <ListItemButton
              key={id}
              sx={{ py: 2.25, px: 3 }}
              onClick={() => {
                scrollTo(id);
                setDrawerOpen(false);
              }}
            >
              {label}
            </ListItemButton>
          ))}
        </List>
      </Drawer>
    </>
  );
}
