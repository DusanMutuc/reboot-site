'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Container } from '@mui/material';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import { brand, HOME_MAX_WIDTH } from '@/lib/homeTheme';
import type { CallStatus, NextCall } from './types';

const JUMP_LINKS = [
  { id: 'calls', label: 'Calls' },
  { id: 'training', label: 'Training' },
  { id: 'numbers', label: 'Numbers' },
  { id: 'podcast', label: 'Podcast' },
  { id: 'help', label: 'Help' },
];

/** Id of the band the chip mirrors — the chip appears once it scrolls away. */
const BAND_ID = 'now';

type Props = {
  memberFirstName: string;
  status: CallStatus;
  nextCall: NextCall | null;
};

export default function StickyBar({ memberFirstName, status, nextCall }: Props) {
  const [showChip, setShowChip] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

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

  // Position indicator for the jump links.
  useEffect(() => {
    const sections = JUMP_LINKS.map(({ id }) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const jumpTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const offset = (barRef.current?.offsetHeight ?? 56) + 12;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - offset,
      behavior: 'smooth',
    });
  };

  const chipUrgent = status === 'imminent' || status === 'none';

  const chipLabel =
    status === 'imminent'
      ? `Join call · ${nextCall?.whenLabel?.replace(/^Today at /, '') ?? 'now'}`
      : status === 'none'
        ? 'Book a call'
        : nextCall
          ? `Next call ${nextCall.relativeLabel}`
          : null;

  const chipHref =
    status === 'imminent' ? (nextCall?.joinUrl ?? '#now') : status === 'none' ? '#calls' : '#calls';

  return (
    <Box
      ref={barRef}
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
            minHeight: 56,
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 1.5, md: 2.5 },
          }}
        >
          <Box
            component="img"
            src="/Reboot Coaching Logo - White.png"
            alt="Reboot Coaching"
            sx={{ height: 22, width: 'auto', flexShrink: 0, display: 'block' }}
          />

          <Box
            component="nav"
            aria-label="Jump to section"
            sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.25, ml: 1 }}
          >
            {JUMP_LINKS.map((link) => {
              const isActive = active === link.id;
              return (
                <Box
                  key={link.id}
                  component="button"
                  type="button"
                  onClick={() => jumpTo(link.id)}
                  aria-current={isActive ? 'true' : undefined}
                  sx={{
                    position: 'relative',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    px: 1.5,
                    py: 1.75,
                    fontFamily: '"Poppins", Arial, sans-serif',
                    fontSize: 14.5,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#ffffff' : 'rgba(255,255,255,0.7)',
                    transition: 'color .16s ease',
                    '&:hover': { color: '#ffffff' },
                    '&::after': isActive
                      ? {
                          content: '""',
                          position: 'absolute',
                          left: 12,
                          right: 12,
                          bottom: 0,
                          height: 2,
                          bgcolor: brand.turquoise,
                        }
                      : undefined,
                  }}
                >
                  {link.label}
                </Box>
              );
            })}
          </Box>

          <Box sx={{ flex: 1 }} />

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
                flexShrink: 0,
                px: chipUrgent ? 1.75 : 1.25,
                py: 0.875,
                borderRadius: '8px',
                fontFamily: '"Poppins", Arial, sans-serif',
                fontSize: 13.5,
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
              {chipLabel}
            </Box>
          ) : null}

          <Box
            aria-hidden="true"
            sx={{
              width: 30,
              height: 30,
              flexShrink: 0,
              borderRadius: '50%',
              bgcolor: 'rgba(255,255,255,0.14)',
              color: '#ffffff',
              display: 'grid',
              placeItems: 'center',
              fontFamily: '"League Spartan", Arial, sans-serif',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {memberFirstName.slice(0, 1).toUpperCase()}
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
