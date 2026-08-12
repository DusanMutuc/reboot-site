'use client';

import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { brand } from '@/lib/homeTheme';
import type { Achievement, ActionStep, Attendance, Episode, HelpStep, Win } from './types';

function SectionHeading({
  label,
  action,
  id,
}: {
  label: string;
  action?: { label: string; href: string };
  id?: string;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 2,
        mb: 1.75,
      }}
    >
      <Typography variant="sectionLabel" component="h2" id={id} sx={{ color: brand.ink }}>
        {label}
      </Typography>
      {action ? (
        <Box
          component={Link}
          href={action.href}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            fontSize: 14,
            fontWeight: 500,
            color: brand.turquoiseDeep,
            flexShrink: 0,
            '&:hover': { color: brand.ink },
          }}
        >
          {action.label}
          <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
        </Box>
      ) : null}
    </Box>
  );
}

function Card({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return (
    <Box
      sx={{
        bgcolor: brand.card,
        border: `1px solid ${brand.border}`,
        borderRadius: '14px',
        p: { xs: 2, md: 2.5 },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/* ---------------------------------------------------------------- focus ---- */

const STATUS_STYLES: Record<ActionStep['status'], { label: string; fg: string; bg: string; border: string }> = {
  complete: { label: 'Done', fg: brand.turquoiseDeep, bg: brand.turquoiseTint, border: brand.turquoise },
  in_progress: { label: 'In progress', fg: brand.ink, bg: '#ffffff', border: brand.borderStrong },
  not_started: { label: 'Not started', fg: brand.inkMuted, bg: '#fbfcfc', border: brand.border },
};

export function FocusSection({ steps }: { steps: ActionStep[] }) {
  return (
    <Box component="section" id="focus">
      <SectionHeading label="Your focus" />
      <Card>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {steps.map((step) => {
            const tone = STATUS_STYLES[step.status];
            const done = step.status === 'complete';
            return (
              <Box
                key={step.id}
                component={step.href ? Link : 'div'}
                href={step.href ?? undefined}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 1.75,
                  py: 1.5,
                  borderRadius: '10px',
                  border: `1px solid ${tone.border}`,
                  bgcolor: tone.bg,
                  transition: 'border-color .16s ease',
                  '&:hover': step.href ? { borderColor: brand.turquoise } : undefined,
                }}
              >
                <Box
                  aria-hidden="true"
                  sx={{
                    width: 20,
                    height: 20,
                    flexShrink: 0,
                    borderRadius: '50%',
                    border: `2px solid ${done ? brand.turquoise : brand.borderStrong}`,
                    bgcolor: done ? brand.turquoise : 'transparent',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {done ? <CheckRoundedIcon sx={{ fontSize: 13, color: brand.ink }} /> : null}
                </Box>

                <Typography
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 15.5,
                    fontWeight: 500,
                    color: done ? brand.inkSoft : brand.ink,
                    textDecoration: done ? 'line-through' : 'none',
                  }}
                >
                  {step.label}
                </Typography>

                <Typography sx={{ fontSize: 12.5, color: tone.fg, flexShrink: 0 }}>
                  {tone.label}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Card>
    </Box>
  );
}

/* -------------------------------------------------------------- podcast ---- */

export function PodcastSection({ episodes }: { episodes: Episode[] }) {
  if (episodes.length === 0) return null;
  const [latest, ...rest] = episodes;

  return (
    <Box component="section" id="podcast">
      <SectionHeading label="Private podcast" action={{ label: 'All episodes', href: '#' }} />
      <Card>
        <Box
          component={Link}
          href={latest.href}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            p: 1.75,
            mb: 1.5,
            borderRadius: '12px',
            border: `1px solid ${brand.turquoise}`,
            bgcolor: brand.turquoiseTint,
            '&:hover': { bgcolor: '#e0f1ed' },
          }}
        >
          <Box
            aria-hidden="true"
            sx={{
              width: 46,
              height: 46,
              flexShrink: 0,
              borderRadius: '50%',
              bgcolor: brand.turquoise,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <PlayArrowRoundedIcon sx={{ fontSize: 27, color: brand.ink }} />
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
              {latest.isNew ? (
                <Typography
                  component="span"
                  sx={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: '0.09em',
                    textTransform: 'uppercase',
                    color: brand.ink,
                    bgcolor: brand.turquoise,
                    borderRadius: '4px',
                    px: 0.75,
                    py: 0.125,
                  }}
                >
                  New
                </Typography>
              ) : null}
              <Typography sx={{ fontSize: 12, color: brand.turquoiseDeep }}>
                {latest.episodeLabel} · {latest.durationLabel} · {latest.publishedLabel}
              </Typography>
            </Box>
            <Typography variant="cardTitle" sx={{ color: brand.ink }}>
              {latest.title}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {rest.map((episode, index) => (
            <Box
              key={episode.episodeLabel}
              component={Link}
              href={episode.href}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                py: 1.25,
                px: 0.5,
                borderTop: index === 0 ? 'none' : `1px solid ${brand.border}`,
                '&:hover .ep-title': { color: brand.turquoiseDeep },
              }}
            >
              <PlayArrowRoundedIcon
                aria-hidden="true"
                sx={{ fontSize: 18, color: brand.inkMuted, flexShrink: 0 }}
              />
              <Typography
                className="ep-title"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 14.5,
                  color: brand.ink,
                  transition: 'color .14s ease',
                }}
              >
                {episode.title}
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: brand.inkMuted, flexShrink: 0 }}>
                {episode.durationLabel}
              </Typography>
            </Box>
          ))}
        </Box>
      </Card>
    </Box>
  );
}

/* ------------------------------------------------------------- progress ---- */

export function ProgressSection({
  attendance,
  wins,
  achievements,
}: {
  attendance: Attendance;
  wins: Win[];
  achievements: Achievement[];
}) {
  const pct = attendance.totalCount > 0
    ? Math.round((attendance.attendedCount / attendance.totalCount) * 100)
    : 0;

  return (
    <Box component="section">
      <SectionHeading label="Your progress" />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
          gap: 1.5,
          alignItems: 'start',
        }}
      >
        <Card>
          <Typography variant="metricLabel" sx={{ display: 'block', color: brand.inkSoft, mb: 1 }}>
            Calls attended · {attendance.periodLabel}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mb: 1.25 }}>
            <Typography variant="metricValue" sx={{ color: brand.ink }}>
              {attendance.attendedCount}
            </Typography>
            <Typography sx={{ fontSize: 15, color: brand.inkMuted }}>
              of {attendance.totalCount}
            </Typography>
          </Box>
          <Box sx={{ height: 6, bgcolor: '#eceff0', borderRadius: 3, overflow: 'hidden', mb: 1 }}>
            <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: brand.turquoise }} />
          </Box>
          {attendance.streakLabel ? (
            <Typography sx={{ fontSize: 12.5, color: brand.turquoiseDeep }}>
              {attendance.streakLabel}
            </Typography>
          ) : null}
        </Card>

        <Card>
          <Typography variant="metricLabel" sx={{ display: 'block', color: brand.inkSoft, mb: 1.25 }}>
            Recent wins
          </Typography>
          {wins.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: brand.inkMuted }}>
              No wins logged yet.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {wins.map((win) => (
                <Box key={win.text} sx={{ borderLeft: `3px solid ${brand.turquoise}`, pl: 1.25 }}>
                  <Typography sx={{ fontSize: 14.5, color: brand.ink, lineHeight: 1.4 }}>
                    {win.text}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: brand.inkMuted, mt: 0.25 }}>
                    {win.dateLabel}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Card>

        <Card>
          <Typography variant="metricLabel" sx={{ display: 'block', color: brand.inkSoft, mb: 1.25 }}>
            Achievements
          </Typography>
          {achievements.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: brand.inkMuted }}>
              None earned yet.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {achievements.map((achievement) => (
                <Box
                  key={achievement.title}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}
                >
                  <Box
                    aria-hidden="true"
                    sx={{
                      width: 30,
                      height: 30,
                      flexShrink: 0,
                      borderRadius: '8px',
                      bgcolor: brand.turquoiseTint,
                      border: `1px solid ${brand.turquoise}`,
                    }}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 500, color: brand.ink }}>
                      {achievement.title}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: brand.inkMuted }}>
                      {achievement.dateLabel}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Card>
      </Box>
    </Box>
  );
}

/* ----------------------------------------------------------------- help ---- */

export function HelpSection({ steps }: { steps: HelpStep[] }) {
  return (
    <Box component="section" id="help">
      <SectionHeading label="How to get help" />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
          gap: 1.5,
          alignItems: 'start',
        }}
      >
        {steps.map((step, index) => (
          <Card key={step.title}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
              <Box
                aria-hidden="true"
                sx={{
                  width: 24,
                  height: 24,
                  flexShrink: 0,
                  borderRadius: '50%',
                  bgcolor: brand.turquoise,
                  color: brand.ink,
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: '"League Spartan", Arial, sans-serif',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {index + 1}
              </Box>
              <Typography variant="cardTitle" sx={{ fontSize: 16, color: brand.ink }}>
                {step.title}
              </Typography>
            </Box>

            <Typography sx={{ fontSize: 14, color: brand.inkSoft, lineHeight: 1.55, mb: 1.5 }}>
              {step.detail}
            </Typography>

            <Box
              component={Link}
              href={step.href}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                fontSize: 14,
                fontWeight: 500,
                color: brand.turquoiseDeep,
                '&:hover': { color: brand.ink },
              }}
            >
              {step.actionLabel}
              <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
            </Box>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
