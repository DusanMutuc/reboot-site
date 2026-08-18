'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { brand } from '@/lib/homeTheme';
import type { CallStatus } from './types';

/**
 * Every switch is a link, so a page navigation resets component state. The
 * open/closed choice is persisted so collapsing it once actually sticks
 * instead of springing back on the next click.
 */
const PANEL_KEY = 'reboot-review-panel';

/**
 * The layout/state switcher is a design-review harness, not member-facing UI.
 * It renders in development, and on a deployed build only when
 * NEXT_PUBLIC_DESIGN_REVIEW=1 is set — so a preview deploy can still be
 * driven, while a production build never shows it.
 */
const DESIGN_REVIEW_ENABLED =
  process.env.NODE_ENV !== 'production' ||
  process.env.NEXT_PUBLIC_DESIGN_REVIEW === '1';

const VERSIONS = [
  { path: '/home', label: 'Separate destinations' },
  { path: '/home/onepage', label: 'One-pager' },
  { path: '/home/hub', label: 'One-pager, hierarchy' },
  { path: '/home/momentum', label: 'Momentum (next step)' },
];

const COURSE_ROW = [
  { key: 'on', label: 'With courses row' },
  { key: 'off', label: 'Without courses row' },
];

const ACCENTS = [
  { key: 'none', label: 'Turquoise only' },
  { key: 'brand', label: 'Logo red accents' },
];

const SURFACES = [
  { key: 'none', label: 'No tint · banner only' },
  { key: 'soft', label: 'Soft · #eef2f1' },
  { key: 'neutral', label: 'Neutral · #e8eeec' },
  { key: 'deep', label: 'Deep · #e0e8e6' },
  { key: 'tint', label: 'Brand tint · #eaf6f3' },
];

const NEXT_STEPS = [
  { key: 'action_step', label: 'Coach action step' },
  { key: 'numbers', label: 'Numbers missing' },
  { key: 'browse', label: 'Nothing outstanding' },
];

const STATES: Array<{ key: CallStatus; label: string }> = [
  { key: 'imminent', label: 'Call starting soon' },
  { key: 'booked', label: 'Booked, further out' },
  { key: 'none', label: 'Nothing booked' },
];

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box
      component={Link}
      href={href}
      sx={{
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        px: 1.25,
        py: 0.5,
        borderRadius: '6px',
        border: `1px solid ${active ? brand.turquoise : brand.border}`,
        bgcolor: active ? brand.turquoiseTint : 'transparent',
        color: active ? brand.turquoiseDeep : brand.inkSoft,
        whiteSpace: 'nowrap',
        '&:hover': { borderColor: brand.turquoise },
      }}
    >
      {children}
    </Box>
  );
}

const VOLUMES = [
  { key: 'typical', label: 'Typical content' },
  { key: 'heavy', label: 'Heavy (20 steps, 40 episodes)' },
  { key: 'empty', label: 'Brand-new member' },
];

/** Review-only affordance. Remove before this ships to members. */
export default function CompareStrip({
  currentPath,
  status,
  volume,
  nextStep,
  surface,
  courseRow,
  accent,
}: {
  currentPath: string;
  status: CallStatus;
  /** Only the one-page variants carry the content-volume switch. */
  volume?: string;
  /** Only the momentum variant carries the next-step resolver switch. */
  nextStep?: string;
  /** Only the momentum variant carries the content-surface switch. */
  surface?: string;
  /** Only the momentum variant carries the courses-row switch. */
  courseRow?: string;
  /** Only the momentum variant carries the colour-treatment switch. */
  accent?: string;
}) {

  const qs = (overrides: Record<string, string>) => {
    const params = new URLSearchParams({ state: status });
    if (volume) params.set('volume', volume);
    if (nextStep) params.set('next', nextStep);
    if (surface) params.set('surface', surface);
    if (courseRow) params.set('courses', courseRow);
    if (accent) params.set('accent', accent);
    Object.entries(overrides).forEach(([k, v]) => params.set(k, v));
    return `?${params.toString()}`;
  };

  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (window.localStorage.getItem(PANEL_KEY) === 'closed') setOpen(false);
  }, []);

  // After the hooks: bailing earlier would make hook order conditional.
  if (!DESIGN_REVIEW_ENABLED) return null;

  const toggle = () => {
    setOpen((wasOpen) => {
      window.localStorage.setItem(PANEL_KEY, wasOpen ? 'closed' : 'open');
      return !wasOpen;
    });
  };

  return (
    <Box
      sx={{
        p: open ? 2 : 1.25,
        borderRadius: '10px',
        border: `1px dashed ${brand.borderStrong}`,
        display: 'flex',
        flexDirection: 'column',
        gap: open ? 1.25 : 0,
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={toggle}
        aria-expanded={open}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          p: 0,
          mb: open ? 0.5 : 0,
          alignSelf: 'flex-start',
          color: brand.inkMuted,
          '&:hover': { color: brand.ink },
        }}
      >
        <ExpandMoreRoundedIcon
          sx={{
            fontSize: 18,
            transition: 'transform .18s ease',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        />
        <Typography sx={{ fontSize: 13, color: 'inherit' }}>Design review</Typography>
      </Box>

      {open ? (
        <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
        <Typography sx={{ fontSize: 13, color: brand.inkMuted, minWidth: 96 }}>
          Layout version
        </Typography>
        {VERSIONS.map((version) => (
          <Chip
            key={version.path}
            href={`${version.path}${qs({})}`}
            active={version.path === currentPath}
          >
            {version.label}
          </Chip>
        ))}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
        <Typography sx={{ fontSize: 13, color: brand.inkMuted, minWidth: 96 }}>
          Call band state
        </Typography>
        {STATES.map((state) => (
          <Chip
            key={state.key}
            href={`${currentPath}${qs({ state: state.key })}`}
            active={state.key === status}
          >
            {state.label}
          </Chip>
        ))}
      </Box>

      {volume ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
          <Typography sx={{ fontSize: 13, color: brand.inkMuted, minWidth: 96 }}>
            Content volume
          </Typography>
          {VOLUMES.map((option) => (
            <Chip
              key={option.key}
              href={`${currentPath}${qs({ volume: option.key })}`}
              active={option.key === volume}
            >
              {option.label}
            </Chip>
          ))}
        </Box>
      ) : null}

      {courseRow ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
          <Typography sx={{ fontSize: 13, color: brand.inkMuted, minWidth: 96 }}>
            Courses row
          </Typography>
          {COURSE_ROW.map((option) => (
            <Chip
              key={option.key}
              href={`${currentPath}${qs({ courses: option.key })}`}
              active={option.key === courseRow}
            >
              {option.label}
            </Chip>
          ))}
        </Box>
      ) : null}

      {accent ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
          <Typography sx={{ fontSize: 13, color: brand.inkMuted, minWidth: 96 }}>
            Colour
          </Typography>
          {ACCENTS.map((option) => (
            <Chip
              key={option.key}
              href={`${currentPath}${qs({ accent: option.key })}`}
              active={option.key === accent}
            >
              {option.label}
            </Chip>
          ))}
        </Box>
      ) : null}

      {surface ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
          <Typography sx={{ fontSize: 13, color: brand.inkMuted, minWidth: 96 }}>
            Content surface
          </Typography>
          {SURFACES.map((option) => (
            <Chip
              key={option.key}
              href={`${currentPath}${qs({ surface: option.key })}`}
              active={option.key === surface}
            >
              {option.label}
            </Chip>
          ))}
        </Box>
      ) : null}

      {nextStep ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
          <Typography sx={{ fontSize: 13, color: brand.inkMuted, minWidth: 96 }}>
            Next step is
          </Typography>
          {NEXT_STEPS.map((option) => (
            <Chip
              key={option.key}
              href={`${currentPath}${qs({ next: option.key })}`}
              active={option.key === nextStep}
            >
              {option.label}
            </Chip>
          ))}
            </Box>
          ) : null}
        </>
      ) : null}
    </Box>
  );
}
