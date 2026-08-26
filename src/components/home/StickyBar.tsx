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
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import { brand, HOME_MAX_WIDTH } from '@/lib/homeTheme';
import { supabase } from '@/lib/supabaseClient';
import type { BookingOption, CalendarLink, CallStatus, NextCall, RoomOption } from './types';

/**
 * Everything in this bar goes somewhere.
 *
 * It used to hold scroll-anchors — Training, Numbers, Podcast, Help — inherited
 * from the live nav, which paired them with two arrow buttons that actually
 * left the page. Keeping the anchors and dropping the arrows left every item
 * the same kind of thing with nothing to contrast against, which is what made
 * the bar read as arbitrary; and it meant the tracker, the library and courses
 * had no permanent route anywhere on the page.
 *
 * The page is about four screens tall, so scrolling beats reading a menu. The
 * bar spends its width on destinations instead.
 */

const TRAINING_LINKS: Array<{ label: string; href: string; kind: 'course' | 'library' }> = [
  // Label, not route: "trainings" is the agreed word for learning content.
  { label: 'Trainings', href: '/courses', kind: 'course' },
  { label: 'Library', href: '/library', kind: 'library' },
];

const DIRECT_LINKS = [
  { label: 'Tracker', href: '/tracker' },
  { label: 'Help', href: '/support' },
];

const LEGEND_LIBRARY = { label: 'Legend library', href: '/library/legend' };

/**
 * The gated row, in both its states.
 *
 * Gold is the only place a fourth hue appears on this surface, and it is here
 * because entitlement is a real category — legend already gates course
 * audiences elsewhere in this codebase — that none of the other three tiers
 * can express. The shine is a single sweep on hover rather than a loop: a
 * menu is open for about two seconds, and something that glitters the whole
 * time reads as a banner ad rather than as a privilege.
 *
 * The locked state deliberately carries no gold at all. Showing the reward
 * greyed out is the point of the pattern — a member who cannot open it should
 * see the shape of the thing they do not have, not a dimmed version of the
 * thing they do. It stays legible rather than dropping to the usual disabled
 * opacity, because it is text a member is meant to read and act on.
 */
const legendItemSx = (unlocked: boolean) => ({
  gap: 1.25,
  py: 1.25,
  fontSize: 15,
  position: 'relative' as const,
  overflow: 'hidden' as const,
  borderTop: `1px solid ${brand.border}`,
  ...(unlocked
    ? {
        color: brand.gold,
        fontWeight: 600,
        backgroundImage: `linear-gradient(100deg, ${brand.goldTint} 0%, #f7ead0 100%)`,
        '&:hover': { backgroundImage: `linear-gradient(100deg, #f9efdc 0%, #f3e3c2 100%)` },
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage: `linear-gradient(105deg, transparent 34%, ${brand.goldBright}00 40%, #ffffffd9 50%, ${brand.goldBright}00 60%, transparent 66%)`,
          transform: 'translateX(-120%)',
        },
        '&:hover::after': { transform: 'translateX(120%)', transition: 'transform .65s ease' },
        '@media (prefers-reduced-motion: reduce)': {
          '&::after': { display: 'none' },
        },
      }
    : {
        color: brand.inkMuted,
        cursor: 'default',
        backgroundColor: '#f4f6f5',
        '&:hover': { backgroundColor: '#f4f6f5' },
      }),
});

/** Id of the band the chip mirrors — the chip appears once it scrolls away. */
const BAND_ID = 'now';

type Props = {
  memberFirstName: string;
  status: CallStatus;
  nextCall: NextCall | null;
  /** Booking and joining links, surfaced as a dropdown rather than a page row. */
  bookingOptions?: BookingOption[];
  roomOptions?: RoomOption[];
  /** The published schedule of group sessions. */
  calendar?: CalendarLink | null;
  /** Whether this member holds the legend role. Gates the legend library. */
  isLegend?: boolean;
};

export default function StickyBar({
  memberFirstName,
  status,
  nextCall,
  bookingOptions = [],
  roomOptions = [],
  calendar = null,
  isLegend = false,
}: Props) {
  const router = useRouter();
  const [showChip, setShowChip] = useState(false);
  const [callsAnchor, setCallsAnchor] = useState<HTMLElement | null>(null);
  const [trainingAnchor, setTrainingAnchor] = useState<HTMLElement | null>(null);
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const hasCallsMenu = bookingOptions.length > 0 || roomOptions.length > 0 || calendar !== null;

  const handleSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);
    setAccountAnchor(null);
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
            href="/home"
            aria-label="Reboot Coaching home"
            sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            <Box
              component="img"
              src="/Reboot Logo - Color.png"
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

            {/* Courses and the library behind one control, mirroring Calls.
                This is also the only route to /courses in the layout. */}
            <Box
              component="button"
              type="button"
              onClick={(event: React.MouseEvent<HTMLElement>) =>
                setTrainingAnchor(event.currentTarget)
              }
              aria-haspopup="true"
              aria-expanded={Boolean(trainingAnchor)}
              sx={navButtonSx(Boolean(trainingAnchor))}
            >
              Training library
              <ExpandMoreRoundedIcon
                sx={{
                  fontSize: 17,
                  transition: 'transform .16s ease',
                  transform: trainingAnchor ? 'rotate(180deg)' : 'none',
                }}
              />
            </Box>

            {DIRECT_LINKS.map((link) => (
              <Box
                key={link.href}
                component={Link}
                href={link.href}
                sx={{
                  px: 1.5,
                  py: 1.75,
                  fontSize: 15,
                  color: 'rgba(255,255,255,0.7)',
                  transition: 'color .16s ease',
                  '&:hover': { color: '#ffffff' },
                }}
              >
                {link.label}
              </Box>
            ))}
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

          <Menu
            anchorEl={trainingAnchor}
            open={Boolean(trainingAnchor)}
            onClose={() => setTrainingAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{ paper: { sx: menuPaperSx } }}
          >
            {TRAINING_LINKS.map((link) => (
              <MenuItem
                key={link.href}
                component={Link}
                href={link.href}
                onClick={() => setTrainingAnchor(null)}
                sx={menuItemSx}
              >
                {link.kind === 'course' ? (
                  <SchoolRoundedIcon sx={{ fontSize: 19, color: brand.turquoiseDeep }} />
                ) : (
                  <MenuBookRoundedIcon sx={{ fontSize: 19, color: brand.turquoiseDeep }} />
                )}
                {link.label}
              </MenuItem>
            ))}

            {isLegend ? (
              <MenuItem
                component={Link}
                href={LEGEND_LIBRARY.href}
                onClick={() => setTrainingAnchor(null)}
                sx={legendItemSx(true)}
              >
                <WorkspacePremiumRoundedIcon sx={{ fontSize: 19, color: brand.gold }} />
                {LEGEND_LIBRARY.label}
              </MenuItem>
            ) : (
              <MenuItem
                component="div"
                aria-disabled="true"
                onClick={(event: React.MouseEvent) => event.preventDefault()}
                sx={legendItemSx(false)}
              >
                <LockRoundedIcon sx={{ fontSize: 19, color: brand.inkMuted }} />
                {LEGEND_LIBRARY.label}
                <Typography
                  component="span"
                  sx={{ ml: 'auto', pl: 2, fontSize: 12.5, color: brand.inkMuted }}
                >
                  Legends only
                </Typography>
              </MenuItem>
            )}
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

          <Box
            component="button"
            type="button"
            onClick={(event: React.MouseEvent<HTMLElement>) => setAccountAnchor(event.currentTarget)}
            aria-haspopup="true"
            aria-expanded={Boolean(accountAnchor)}
            aria-label="Your account"
            sx={{
              width: 32,
              height: 32,
              flexShrink: 0,
              p: 0,
              border: 'none',
              cursor: 'pointer',
              borderRadius: '50%',
              bgcolor: accountAnchor ? brand.turquoise : 'rgba(255,255,255,0.14)',
              color: accountAnchor ? brand.ink : '#ffffff',
              display: { xs: 'none', md: 'grid' },
              placeItems: 'center',
              fontFamily: '"League Spartan", Arial, sans-serif',
              fontSize: 14,
              fontWeight: 700,
              transition: 'background-color .16s ease, color .16s ease',
              '&:hover': { bgcolor: brand.turquoise, color: brand.ink },
            }}
          >
            {memberFirstName.slice(0, 1).toUpperCase()}
          </Box>

          <Menu
            anchorEl={accountAnchor}
            open={Boolean(accountAnchor)}
            onClose={() => setAccountAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { ...menuPaperSx, minWidth: 208 } } }}
          >
            <Typography sx={{ ...groupHeadingSx, pb: 1.25 }}>
              Signed in as {memberFirstName}
            </Typography>
            <MenuItem
              onClick={handleSignOut}
              disabled={signingOut}
              sx={{ ...menuItemSx, borderTop: `1px solid ${brand.border}` }}
            >
              <LogoutRoundedIcon sx={{ fontSize: 19, color: brand.inkMuted }} />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </MenuItem>
          </Menu>

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

          <Typography sx={{ ...groupHeadingSx, pt: 1.5 }}>Training</Typography>
          {TRAINING_LINKS.map((link) => (
            <MenuItem
              key={link.href}
              component={Link}
              href={link.href}
              onClick={() => setDrawerOpen(false)}
              sx={menuItemSx}
            >
              {link.kind === 'course' ? (
                <SchoolRoundedIcon sx={{ fontSize: 19, color: brand.turquoiseDeep }} />
              ) : (
                <MenuBookRoundedIcon sx={{ fontSize: 19, color: brand.turquoiseDeep }} />
              )}
              {link.label}
            </MenuItem>
          ))}

          {isLegend ? (
            <MenuItem
              component={Link}
              href={LEGEND_LIBRARY.href}
              onClick={() => setDrawerOpen(false)}
              sx={legendItemSx(true)}
            >
              <WorkspacePremiumRoundedIcon sx={{ fontSize: 19, color: brand.gold }} />
              {LEGEND_LIBRARY.label}
            </MenuItem>
          ) : (
            <MenuItem
              component="div"
              aria-disabled="true"
              onClick={(event: React.MouseEvent) => event.preventDefault()}
              sx={legendItemSx(false)}
            >
              <LockRoundedIcon sx={{ fontSize: 19, color: brand.inkMuted }} />
              {LEGEND_LIBRARY.label}
              <Typography
                component="span"
                sx={{ ml: 'auto', pl: 2, fontSize: 12.5, color: brand.inkMuted }}
              >
                Legends only
              </Typography>
            </MenuItem>
          )}

          <Divider sx={{ my: 1 }} />

          {DIRECT_LINKS.map((link) => (
            <MenuItem
              key={link.href}
              component={Link}
              href={link.href}
              onClick={() => setDrawerOpen(false)}
              sx={menuItemSx}
            >
              {link.label}
            </MenuItem>
          ))}

          <MenuItem onClick={handleSignOut} disabled={signingOut} sx={menuItemSx}>
            <LogoutRoundedIcon sx={{ fontSize: 19, color: brand.inkMuted }} />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </MenuItem>
        </Box>
      </Drawer>
    </Box>
  );
}
