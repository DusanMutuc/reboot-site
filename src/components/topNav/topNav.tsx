// src/components/topNav/topNav.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AppBar, Toolbar, Button, Box, Typography,
  IconButton, Drawer, List, ListItemButton, Divider
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { supabase } from '@/lib/supabaseClient';
import type { Theme } from '@mui/material/styles';
import type { SystemStyleObject } from '@mui/system';

type Section = { id: string; label: string };
type Role = 'user' | 'coach' | 'admin' | 'assistant' | 'unknown';

const DEFAULT_SECTIONS: Section[] = [
  { id: 'links',     label: 'COACHING LINKS' },
  { id: 'podcast',   label: 'PRIVATE PODCAST' },
  { id: 'library',   label: 'SEARCH ENGINE' },
  { id: 'dashboard', label: 'DASHBOARD' },
  { id: 'help',      label: 'HOW TO GET HELP' },
];

export default function TopNav({
  sections = DEFAULT_SECTIONS,
  title = "REBOOT MEMBER'S HUB",
  role: roleProp, // optional override
}: {
  sections?: Section[];
  title?: string;
  role?: Role;
}) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? '');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [role, setRole] = useState<Role>(roleProp ?? 'unknown');

  // -------- Role lookup using your schema (user_roles -> roles.code) --------
  useEffect(() => {
    if (roleProp) { setRole(roleProp); return; }

    let mounted = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) { if (mounted) setRole('user'); return; }

      const { data: rolesRows, error: rolesErr } = await supabase
        .from('user_roles')
        .select('roles ( code )')
        .eq('user_id', uid);

      if (!mounted) return;
      if (rolesErr || !rolesRows?.length) { setRole('user'); return; }

      const codes = (rolesRows ?? [])
        .flatMap((row) => {
          const r = row.roles;
          return Array.isArray(r) ? r : r ? [r] : [];
        })
        .map((role) => role?.code)
        .filter((code): code is string => typeof code === 'string');

      if (codes.includes('admin')) setRole('admin');
      else if (codes.includes('coach')) setRole('coach');
      else if (codes.includes('assistant')) setRole('assistant');
      else setRole('user');
    })();

    return () => { mounted = false; };
  }, [roleProp]);

  const coachLike = role === 'coach' || role === 'admin';

  const rightLinks = useMemo(() => {
    if (coachLike) {
      return [
        { label: 'RESOURCES →', href: '/resources' },
        { label: 'STUDENT OVERVIEW →', href: '/coach/students-overview' },
      ];
    }
    return [
      { label: 'RESOURCES →', href: '/resources' },
      { label: 'TRACKER →', href: '/tracker' },
    ];
  }, [coachLike]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
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

    const appBar = document.getElementById('appbar');
    const offset = appBar ? appBar.offsetHeight : 120;

    const elementPosition = el.getBoundingClientRect().top + window.pageYOffset;
    const offsetPosition = elementPosition - offset;

    window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    history.replaceState(null, '', `#${id}`);
  };

  // Safe access to optional theme palette extension (no `any`)
  type MaybeTurquoise = { palette?: { turquoise?: { main?: string } } };
  const getTurquoise = (theme: Theme) =>
    (theme as unknown as MaybeTurquoise).palette?.turquoise?.main ?? '#5cbca8';

  // Return type MUST be SystemStyleObject for sx callback
  const arrowBtnSx = (theme: Theme): SystemStyleObject<Theme> => ({
    px: { md: 3, lg: 3.25 },
    py: { md: 1.4, lg: 1.5 },
    fontSize: { md: '1.2rem', lg: '1.3rem' },
    lineHeight: 1.15,
    fontWeight: 800,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: getTurquoise(theme),
    color: getTurquoise(theme),
    bgcolor: 'transparent',
    borderRadius: 2.5,
    transition: 'transform .15s, background-color .15s, border-color .15s',
    '&:hover': {
      transform: 'translateY(-2px)',
      bgcolor: 'rgba(92,188,168,0.08)',
      borderColor: getTurquoise(theme),
    },
  });

  const pillBtnSx = (isActive: boolean): SystemStyleObject<Theme> => ({
    px: { md: 3.5, lg: 4 },
    py: { md: 1.6, lg: 1.8 },
    fontSize: { md: '1.4rem', lg: '1.6rem' },
    lineHeight: 1.2,
    fontWeight: 700,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif',
    bgcolor: isActive ? '#000 !important' : '#f1f1f1 !important',
    color: isActive ? '#fff !important' : '#000 !important',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
    transition: 'all .15s',
    borderRadius: 2.5,
    '&:hover': {
      bgcolor: isActive ? '#000 !important' : '#d0d0d0',
      color: isActive ? '#fff !important' : '#000',
      transform: 'translateY(-2px)',
    },
  });

  return (
    <>
      <AppBar
        id="appbar"
        position="fixed"
        elevation={0}
        sx={{ bgcolor: '#000', py: 2, borderRadius: 0, left: 0, right: 0, width: '100%' }}
      >
        <Toolbar disableGutters sx={{ px: 3, display: 'flex', justifyContent: 'center' }}>
          <Box
            sx={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 2,
              width: { xs: '100%', md: 'max-content' },
            }}
          >
            {/* Header row */}
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
                sx={{ height: { xs: 28, sm: 32, md: 45 }, width: 'auto', order: { xs: 0, md: 2 } }}
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
                  color: getTurquoise(theme),
                  fontSize: { xs: '1.1rem', sm: '1.5rem', md: '3rem' },
                  order: { xs: 1, md: 0 },
                })}
              >
                {title}
              </Typography>

              {/* Hamburger (mobile) */}
              <Box sx={{ justifySelf: 'end', display: { xs: 'block', md: 'none' }, order: { xs: 2 } }}>
                <IconButton aria-label="Open menu" onClick={() => setDrawerOpen(true)} sx={{ color: '#fff' }}>
                  <MenuIcon />
                </IconButton>
              </Box>
            </Box>

            {/* DESKTOP NAV */}
            <Box
              sx={{
                display: { xs: 'none', md: 'flex' },
                alignSelf: 'center',
                gap: { md: 4, lg: 5 },
                alignItems: 'center',
              }}
            >
              {/* Left pills (scroll) */}
              <Box sx={{ display: 'inline-flex', gap: { md: 4, lg: 5 } }}>
                {sections.map(({ id, label }) => {
                  const isActive = active === id;
                  return (
                    <Button
                      key={id}
                      onClick={() => scrollTo(id)}
                      disableElevation
                      sx={pillBtnSx(isActive)}
                    >
                      {label}
                    </Button>
                  );
                })}
              </Box>

              {/* Spacer */}
              <Box sx={{ width: 1, maxWidth: 24 }} />

              {/* Right “arrow” buttons */}
              <Box sx={{ display: 'inline-flex', gap: 2 }}>
                {rightLinks.map(({ label, href }) => (
                  <Button
                    key={href}
                    component={Link}
                    href={href}
                    prefetch={false}
                    sx={(theme) => arrowBtnSx(theme)}
                  >
                    {label}
                  </Button>
                ))}
              </Box>
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

          <Divider sx={{ my: 1.5, opacity: 0.25 }} />

          {rightLinks.map(({ label, href }) => (
            <ListItemButton
              key={href}
              component={Link}
              href={href}
              prefetch={false}
              sx={{
                py: 2.25, px: 3,
                border: '1px solid rgba(92,188,168,0.8)',
                borderRadius: 2,
                mx: 2, my: 1,
              }}
              onClick={() => setDrawerOpen(false)}
            >
              {label}
            </ListItemButton>
          ))}
        </List>
      </Drawer>
    </>
  );
}
