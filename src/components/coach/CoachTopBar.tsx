'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Alert, Box, Button, Divider, Drawer, IconButton, Menu, MenuItem, Snackbar, Typography } from '@mui/material';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import { brand, HOME_MAX_WIDTH } from '@/lib/homeTheme';
import { supabase } from '@/lib/supabaseClient';
import rebootLogo from '../../../public/Reboot Logo - Color.png';
import AccountSettingsLink from '@/components/account/AccountSettingsLink';

const navigation = [
  { label: 'Home', href: '/coach' },
  { label: 'Coaching space', href: '/coach/students-overview' },
  { label: 'Members', href: '/coach/members' },
  { label: 'Schedule', href: '/coach/schedule' },
  { label: 'Resources', href: '/coach/resources' },
];

export default function CoachTopBar({ coachName, roleLabel = 'Coach workspace' }: {
  coachName?: string;
  roleLabel?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const isActive = (href: string) => href === '/coach'
    ? pathname === href || pathname === `${href}/`
    : pathname === href || pathname.startsWith(`${href}/`);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setAccountAnchor(null);
    setDrawerOpen(false);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace('/login');
      router.refresh();
    } catch {
      setSignOutError(true);
      setSigningOut(false);
    }
  }

  return (
    <>
      <Box component="header" sx={{ position: 'sticky', top: 0, zIndex: 30, bgcolor: brand.slate }}>
        <Box sx={{ maxWidth: HOME_MAX_WIDTH, mx: 'auto', px: { xs: 2.5, md: 4 }, minHeight: { xs: 70, md: 84 }, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box component={Link} href="/coach" aria-label="Reboot coach home" sx={{ display: 'block', flexShrink: 0 }}>
            <Box component="img" src={rebootLogo.src} alt="Reboot Coaching" sx={{ display: 'block', height: { xs: 29, md: 35 }, width: 'auto' }} />
            <Typography sx={{ color: 'rgba(255,255,255,.68)', fontSize: 11, mt: 0.5, letterSpacing: '.04em' }}>{roleLabel}</Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Box component="nav" aria-label="Coach navigation" sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.25, alignItems: 'center' }}>
            {navigation.map(({ label, href }) => (
              <Button key={href} component={Link} href={href} prefetch={false} aria-current={isActive(href) ? 'page' : undefined}
                sx={{ color: isActive(href) ? '#fff' : 'rgba(255,255,255,.69)', fontSize: 13, fontWeight: isActive(href) ? 600 : 400, minWidth: 0, px: 1.35, py: 1.25, minHeight: 44, borderRadius: '6px', bgcolor: isActive(href) ? 'rgba(255,255,255,.08)' : 'transparent', '&:hover': { bgcolor: 'rgba(255,255,255,.12)', color: '#fff' } }}>
                {label}
              </Button>
            ))}
          </Box>
          <IconButton id="coach-account-button" aria-label={coachName ? `Account for ${coachName}` : 'Account'} aria-haspopup="menu" aria-controls={accountAnchor ? 'coach-account-menu' : undefined} aria-expanded={Boolean(accountAnchor)}
            onClick={(event) => setAccountAnchor(event.currentTarget)} sx={{ color: 'rgba(255,255,255,.8)', display: { xs: 'none', md: 'inline-flex' }, width: 44, height: 44 }}>
            <AccountCircleOutlinedIcon />
          </IconButton>
          <IconButton aria-label="Open coach navigation" onClick={() => setDrawerOpen(true)} sx={{ color: '#fff', display: { xs: 'inline-flex', md: 'none' }, width: 44, height: 44 }}>
            <MenuRoundedIcon />
          </IconButton>
        </Box>
      </Box>
      <Menu id="coach-account-menu" anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={() => setAccountAnchor(null)}
        slotProps={{ list: { 'aria-labelledby': 'coach-account-button' }, paper: { sx: { minWidth: 200, mt: 0.5, border: `1px solid ${brand.border}`, boxShadow: '0 12px 32px rgba(16,20,19,.12)' } } }}>
        {coachName ? <Typography sx={{ px: 2, py: 1, fontSize: 13, fontWeight: 600 }}>{coachName}</Typography> : null}
        <AccountSettingsLink menuItem onClick={() => setAccountAnchor(null)} sx={{ fontSize: 14, py: 1.5 }} />
        <MenuItem onClick={() => void signOut()} disabled={signingOut} sx={{ gap: 1.25, fontSize: 14, py: 1.5 }}>
          <LogoutRoundedIcon fontSize="small" />{signingOut ? 'Signing out…' : 'Sign out'}
        </MenuItem>
      </Menu>
      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)} slotProps={{ paper: { sx: { width: 'min(320px, 88vw)', bgcolor: brand.card } } }}>
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{coachName || 'Coach workspace'}</Typography>
          <IconButton aria-label="Close coach navigation" onClick={() => setDrawerOpen(false)} sx={{ width: 44, height: 44 }}><CloseRoundedIcon /></IconButton>
        </Box>
        <Divider />
        <Box component="nav" aria-label="Coach navigation" sx={{ p: 1 }}>
          {navigation.map(({ label, href }) => (
            <MenuItem key={href} component={Link} href={href} prefetch={false} selected={isActive(href)} aria-current={isActive(href) ? 'page' : undefined} onClick={() => setDrawerOpen(false)} sx={{ minHeight: 48, fontSize: 15, borderRadius: '8px', px: 2, my: 0.5 }}>{label}</MenuItem>
          ))}
        </Box>
        <Divider />
        <AccountSettingsLink menuItem onClick={() => setDrawerOpen(false)} sx={{ mx: 1, px: 2, minHeight: 48, fontSize: 14 }} />
        <MenuItem onClick={() => void signOut()} disabled={signingOut} sx={{ mx: 1, my: 1, px: 2, gap: 1.25, minHeight: 48, fontSize: 14 }}><LogoutRoundedIcon fontSize="small" />{signingOut ? 'Signing out…' : 'Sign out'}</MenuItem>
      </Drawer>
      <Snackbar open={signOutError} autoHideDuration={6000} onClose={() => setSignOutError(false)}><Alert severity="error" onClose={() => setSignOutError(false)}>Could not sign out. Please try again.</Alert></Snackbar>
    </>
  );
}
