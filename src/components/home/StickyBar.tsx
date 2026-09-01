'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Divider,
  Drawer,
  IconButton,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import { brand, HOME_MAX_WIDTH } from '@/lib/homeTheme';
import { supabase } from '@/lib/supabaseClient';
import type { BookingOption, CalendarLink, CallStatus, NextCall, RoomOption } from './types';
import rebootLogo from '../../../public/Reboot Logo - Color.png';

/** The programme content and tracker are already present on this page. */

/** Id of the band the chip mirrors — the chip appears once it scrolls away. */
const BAND_ID = 'now';

type Props = {
  /** The signed-in member's role-aware home route. */
  homeHref?: string;
  memberFirstName: string;
  status: CallStatus;
  nextCall: NextCall | null;
  /** Booking and joining links, surfaced as a dropdown rather than a page row. */
  bookingOptions?: BookingOption[];
  roomOptions?: RoomOption[];
  /** The published schedule of group sessions. */
  calendar?: CalendarLink | null;
};

export default function StickyBar({
  homeHref = '/home',
  memberFirstName,
  status,
  nextCall,
  bookingOptions = [],
  roomOptions = [],
  calendar = null,
}: Props) {
  const router = useRouter();
  const [showChip, setShowChip] = useState(false);
  const [callsAnchor, setCallsAnchor] = useState<HTMLElement | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const hasCallsMenu = bookingOptions.length > 0 || roomOptions.length > 0 || calendar !== null;

  const handleSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);
    setDrawerOpen(false);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[momentum-home] sign out', error);
      setSigningOut(false);
      return;
    }

    router.replace('/login');
    router.refresh();
  };

  // Chip appears only once the band itself is off screen, so the call-to-action
  // is never duplicated on the first screen.
  useEffect(() => {
    const band = document.getElementById(BAND_ID);
    if (!band) return;

    const observer = new IntersectionObserver(
      ([entry]) => setShowChip(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-70px 0px 0px 0px' },
    );
    observer.observe(band);
    return () => observer.disconnect();
  }, []);

  const chipUrgent = status === 'imminent' || status === 'none';

  // Split so the detail can drop on a narrow bar. The colour lockup is wide,
  // and "Join call · 2:00 pm" beside it overflowed a 375px screen; the time is
  // on the band itself, so the phone loses nothing by showing only the verb.
  const chipLabel =
    status === 'imminent'
      ? 'Join your call'
      : status === 'none'
        ? 'Book a call'
        : nextCall
          ? 'Next call'
          : null;

  const chipDetail =
    status === 'imminent'
      ? `· ${nextCall?.whenLabel?.replace(/^Today at /, '') ?? 'now'}`
      : status === 'booked' && nextCall
        ? nextCall.relativeLabel
        : null;

  // Points at the band, which owns booking in every state. It used to point at
  // a #calls section that no longer exists on this layout.
  const chipHref = status === 'imminent' ? (nextCall?.joinUrl ?? `#${BAND_ID}`) : `#${BAND_ID}`;

  const navButtonSx = (open: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.375,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    px: 1.5,
    py: 1.75,
    fontFamily: '"Poppins", Arial, sans-serif',
    fontSize: 15,
    color: open ? '#ffffff' : 'rgba(255,255,255,0.7)',
    transition: 'color .16s ease',
    '&:hover': { color: '#ffffff' },
  });

  const menuPaperSx = {
    mt: 0.5,
    minWidth: 268,
    border: `1px solid ${brand.border}`,
    borderRadius: '12px',
    boxShadow: '0 12px 32px rgba(16,20,19,0.14)',
  };

  const groupHeadingSx = {
    px: 2,
    pt: 1.25,
    pb: 0.75,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.09em',
    textTransform: 'uppercase' as const,
    color: brand.inkMuted,
  };

  const menuItemSx = { gap: 1.25, py: 1.25, fontSize: 15, color: brand.ink };

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        bgcolor: brand.slate,
        borderBottom: `2px solid ${brand.turquoise}`,
      }}
    >
      <Container maxWidth={false} sx={{ maxWidth: HOME_MAX_WIDTH, px: { xs: 2, md: 3 } }}>
        <Box
          sx={{
            minHeight: { xs: 64, md: 78 },
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 1.5, md: 2.5 },
          }}
        >
          {/* The mark is the brand's presence on every screen, and every member
              expects it to be the way home.

              The colour asset, not the flat white one: the red rosette is the
              signature, and this version already pairs it with a white wordmark
              for dark backgrounds. It is wider than the white lockup (4.74:1
              against 3.31:1), which is why the mobile step is small — at 375px
              the bar also has to hold the burger and the booking chip. */}
          <Box
            component={Link}
            href={homeHref}
            aria-label="Reboot Coaching home"
            sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            <Box
              component="img"
              src={rebootLogo.src}
              alt="Reboot Coaching"
              sx={{ height: { xs: 30, md: 50 }, width: 'auto', display: 'block' }}
            />
          </Box>

          <Box sx={{ flex: 1 }} />

          <Box
            component="nav"
            aria-label="Main"
            sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.25 }}
          >
            {hasCallsMenu ? (
              <Box
                component="button"
                type="button"
                onClick={(event: React.MouseEvent<HTMLElement>) =>
                  setCallsAnchor(event.currentTarget)
                }
                aria-haspopup="true"
                aria-expanded={Boolean(callsAnchor)}
                sx={navButtonSx(Boolean(callsAnchor))}
              >
                Call links
                <ExpandMoreRoundedIcon
                  sx={{
                    fontSize: 17,
                    transition: 'transform .16s ease',
                    transform: callsAnchor ? 'rotate(180deg)' : 'none',
                  }}
                />
              </Box>
            ) : null}

          </Box>

          <Menu
            anchorEl={callsAnchor}
            open={Boolean(callsAnchor)}
            onClose={() => setCallsAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{ paper: { sx: menuPaperSx } }}
          >
            <Typography sx={groupHeadingSx}>Book a call</Typography>
            {bookingOptions.map((option) => (
              <MenuItem
                key={option.label}
                component={Link}
                href={option.href ?? '#'}
                onClick={() => setCallsAnchor(null)}
                sx={menuItemSx}
              >
                <EventAvailableRoundedIcon sx={{ fontSize: 19, color: brand.turquoiseDeep }} />
                {option.label}
              </MenuItem>
            ))}

            <Typography
              sx={{ ...groupHeadingSx, pt: 1.5, borderTop: `1px solid ${brand.border}`, mt: 0.5 }}
            >
              Join a room
            </Typography>
            {roomOptions.map((option, index) => (
              <MenuItem
                key={option.label}
                component={Link}
                href={option.href ?? '#'}
                onClick={() => setCallsAnchor(null)}
                sx={menuItemSx}
              >
                {index === 1 ? (
                  <GroupsRoundedIcon sx={{ fontSize: 19, color: brand.turquoiseDeep }} />
                ) : (
                  <VideocamRoundedIcon sx={{ fontSize: 19, color: brand.turquoiseDeep }} />
                )}
                {option.label}
              </MenuItem>
            ))}

            {/* Rendered as siblings rather than wrapped in a fragment: Menu
                reads its children directly to manage focus. */}
            {calendar ? (
              <Typography
                key="calendar-heading"
                sx={{ ...groupHeadingSx, pt: 1.5, borderTop: `1px solid ${brand.border}`, mt: 0.5 }}
              >
                What&apos;s on
              </Typography>
            ) : null}
            {calendar ? (
              <MenuItem
                key="calendar-item"
                component={Link}
                href={calendar.href ?? '#'}
                onClick={() => setCallsAnchor(null)}
                sx={menuItemSx}
              >
                <CalendarMonthRoundedIcon sx={{ fontSize: 19, color: brand.turquoiseDeep }} />
                {calendar.label}
              </MenuItem>
            ) : null}
          </Menu>

          {chipLabel ? (
            <Box
              component="a"
              href={chipHref}
              target={status === 'imminent' && nextCall?.joinUrl ? '_blank' : undefined}
              rel={status === 'imminent' && nextCall?.joinUrl ? 'noopener noreferrer' : undefined}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                flexShrink: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
                px: chipUrgent ? 1.75 : 1.25,
                py: 0.875,
                borderRadius: '8px',
                fontFamily: '"Poppins", Arial, sans-serif',
                fontSize: 14,
                fontWeight: chipUrgent ? 600 : 400,
                bgcolor: chipUrgent ? brand.turquoise : 'transparent',
                color: chipUrgent ? brand.ink : 'rgba(255,255,255,0.72)',
                border: chipUrgent ? 'none' : '1px solid rgba(255,255,255,0.24)',
                opacity: showChip ? 1 : 0,
                visibility: showChip ? 'visible' : 'hidden',
                transform: showChip ? 'translateY(0)' : 'translateY(-4px)',
                transition: 'opacity .2s ease, transform .2s ease, visibility .2s',
                '&:hover': { bgcolor: chipUrgent ? brand.turquoiseDark : 'rgba(255,255,255,0.08)' },
                '& svg': { fontSize: 17 },
              }}
            >
              {status === 'imminent' ? <VideocamRoundedIcon /> : null}
              {status === 'none' ? <EventAvailableRoundedIcon /> : null}
              <Box component="span">{chipLabel}</Box>
              {chipDetail ? (
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                  {chipDetail}
                </Box>
              ) : null}
            </Box>
          ) : null}

          <IconButton
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
            sx={{ display: { xs: 'inline-flex', md: 'none' }, color: '#ffffff', flexShrink: 0 }}
          >
            <MenuRoundedIcon />
          </IconButton>
        </Box>
      </Container>

      {/* The nav block is desktop-only, so without this a phone got the logo,
          the chip and nothing else — no calls, no rooms, no calendar. */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{ paper: { sx: { width: 292, bgcolor: brand.card } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5 }}>
          <Typography sx={{ pl: 1, fontSize: 14, fontWeight: 600, color: brand.ink }}>
            {memberFirstName}
          </Typography>
          <IconButton aria-label="Close menu" onClick={() => setDrawerOpen(false)}>
            <CloseRoundedIcon sx={{ color: brand.ink }} />
          </IconButton>
        </Box>

        <Divider />

        <Box sx={{ py: 1 }}>
          {bookingOptions.length > 0 ? (
            <Typography sx={groupHeadingSx}>Book a call</Typography>
          ) : null}
          {bookingOptions.map((option) => (
            <MenuItem
              key={option.label}
              component={Link}
              href={option.href ?? '#'}
              onClick={() => setDrawerOpen(false)}
              sx={menuItemSx}
            >
              <EventAvailableRoundedIcon sx={{ fontSize: 19, color: brand.turquoiseDeep }} />
              {option.label}
            </MenuItem>
          ))}

          {roomOptions.length > 0 ? (
            <Typography sx={{ ...groupHeadingSx, pt: 1.5 }}>Join a room</Typography>
          ) : null}
          {roomOptions.map((option, index) => (
            <MenuItem
              key={option.label}
              component={Link}
              href={option.href ?? '#'}
              onClick={() => setDrawerOpen(false)}
              sx={menuItemSx}
            >
              {index === 1 ? (
                <GroupsRoundedIcon sx={{ fontSize: 19, color: brand.turquoiseDeep }} />
              ) : (
                <VideocamRoundedIcon sx={{ fontSize: 19, color: brand.turquoiseDeep }} />
              )}
              {option.label}
            </MenuItem>
          ))}

          {calendar ? <Typography sx={{ ...groupHeadingSx, pt: 1.5 }}>What&apos;s on</Typography> : null}
          {calendar ? (
            <MenuItem
              component={Link}
              href={calendar.href ?? '#'}
              onClick={() => setDrawerOpen(false)}
              sx={menuItemSx}
            >
              <CalendarMonthRoundedIcon sx={{ fontSize: 19, color: brand.turquoiseDeep }} />
              {calendar.label}
            </MenuItem>
          ) : null}

          <Divider sx={{ my: 1 }} />

          <MenuItem onClick={handleSignOut} disabled={signingOut} sx={menuItemSx}>
            <LogoutRoundedIcon sx={{ fontSize: 19, color: brand.inkMuted }} />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </MenuItem>
        </Box>
      </Drawer>
    </Box>
  );
}
