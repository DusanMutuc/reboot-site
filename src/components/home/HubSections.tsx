'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Box, Container, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { brand, HOME_MAX_WIDTH } from '@/lib/homeTheme';
import SearchWithResults from './SearchWithResults';
import type {
  Achievement,
  ActionStep,
  Attendance,
  BookingOption,
  BrowseTile,
  ContinueItem,
  Episode,
  HelpStep,
  Metric,
  RoomOption,
  SearchItem,
  UtilityLink,
  Win,
} from './types';

/* --------------------------------------------------------------- shared ---- */

export function Region({
  label,
  action,
  id,
  children,
  quiet = false,
}: {
  label: string;
  action?: { label: string; href: string };
  id?: string;
  children: React.ReactNode;
  /** Lower-tier regions get a smaller heading so scanning reveals priority. */
  quiet?: boolean;
}) {
  return (
    <Box component="section" id={id}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 2,
          mb: quiet ? 2 : 2.5,
        }}
      >
        <Typography
          variant="sectionLabel"
          component="h2"
          sx={{ color: quiet ? brand.inkSoft : brand.ink, fontSize: quiet ? 17 : undefined }}
        >
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
              flexShrink: 0,
              fontSize: 14,
              fontWeight: 500,
              color: brand.turquoiseDeep,
              '&:hover': { color: brand.ink },
            }}
          >
            {action.label}
            <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
          </Box>
        ) : null}
      </Box>
      {children}
    </Box>
  );
}

/* ------------------------------------------------------------- training ---- */

/**
 * The centerpiece. Search is the single most prominent interactive element on
 * the page because search adoption is one of the two outcomes this redesign is
 * trying to move. Everything else here is a suggestion beneath it.
 */
export function TrainingHero({
  searchIndex,
  continueItem,
  browseTiles,
  latestEpisode,
}: {
  searchIndex: SearchItem[];
  continueItem: ContinueItem | null;
  browseTiles: BrowseTile[];
  latestEpisode: Episode | null;
}) {
  return (
    <Box component="section" id="training">
      <Typography
        variant="slabTitle"
        component="h2"
        sx={{ fontSize: 27, color: brand.ink, mb: 2, maxWidth: 640 }}
      >
        What do you need help with?
      </Typography>

      <SearchWithResults index={searchIndex} large />

      <Box
        sx={{
          mt: 2.5,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: { xs: 1, md: 1.25 },
        }}
      >
        {browseTiles.map((tile) => (
          <Box
            key={tile.key}
            component={Link}
            href={tile.href}
            sx={{
              px: 1.75,
              py: 0.875,
              borderRadius: '999px',
              border: `1px solid ${brand.border}`,
              fontSize: 14,
              color: brand.inkSoft,
              transition: 'border-color .16s ease, color .16s ease',
              '&:hover': { borderColor: brand.turquoise, color: brand.ink },
            }}
          >
            {tile.label}
          </Box>
        ))}
      </Box>

      {(continueItem || latestEpisode) ? (
        <Box
          sx={{
            mt: 3,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: continueItem && latestEpisode ? '1fr 1fr' : '1fr' },
            gap: { xs: 2, md: 3 },
          }}
        >
          {continueItem ? (
            <Box component={Link} href={continueItem.href} sx={{ display: 'block' }}>
              <Typography sx={{ fontSize: 12, color: brand.inkMuted, mb: 0.75 }}>
                Continue where you left off
              </Typography>
              <Typography
                sx={{
                  fontSize: 16,
                  fontWeight: 500,
                  color: brand.ink,
                  mb: 1,
                  '&:hover': { color: brand.turquoiseDeep },
                }}
              >
                {continueItem.title} · {continueItem.contextLabel}
              </Typography>
              <Box sx={{ height: 5, bgcolor: '#e7ebea', borderRadius: 3, overflow: 'hidden' }}>
                <Box
                  sx={{ width: `${continueItem.progressPct}%`, height: '100%', bgcolor: brand.turquoise }}
                />
              </Box>
            </Box>
          ) : null}

          {latestEpisode ? (
            <Box
              component={Link}
              href={latestEpisode.href}
              sx={{ display: 'block', '&:hover .ep-t': { color: brand.turquoiseDeep } }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                <Typography sx={{ fontSize: 12, color: brand.inkMuted }}>Newest episode</Typography>
                {latestEpisode.isNew ? (
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: brand.ink,
                      bgcolor: brand.turquoise,
                      borderRadius: '3px',
                      px: 0.625,
                    }}
                  >
                    New
                  </Typography>
                ) : null}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <PlayArrowRoundedIcon
                  aria-hidden="true"
                  sx={{ fontSize: 20, color: brand.turquoiseDeep, flexShrink: 0 }}
                />
                <Typography className="ep-t" sx={{ fontSize: 16, fontWeight: 500, color: brand.ink, minWidth: 0 }}>
                  {latestEpisode.title}
                </Typography>
                <Typography sx={{ fontSize: 13, color: brand.inkMuted, flexShrink: 0 }}>
                  {latestEpisode.durationLabel}
                </Typography>
              </Box>
            </Box>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}

/* ---------------------------------------------------------------- calls ---- */

/**
 * The band above already carries the urgent booking action, so this is the
 * complete list rather than a competing call to action — a single row instead
 * of a tall panel.
 */
export function CallsRow({
  bookingOptions,
  roomOptions,
}: {
  bookingOptions: BookingOption[];
  roomOptions: RoomOption[];
}) {
  // The verb is an eyebrow rather than part of the label, so brand names keep
  // their capitalisation and the tiles stay one line.
  const items = [
    ...bookingOptions.map((o) => ({ verb: 'Book', label: o.label, href: o.href, book: true })),
    ...roomOptions.map((o) => ({ verb: 'Join', label: o.label, href: o.href, book: false })),
  ];

  return (
    <Region label="Your calls" id="calls">
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0,1fr))', md: 'repeat(4, minmax(0,1fr))' },
          gap: 1.25,
        }}
      >
        {items.map((item) => (
          <Box
            key={item.label}
            component={Link}
            href={item.href ?? '#'}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              px: 1.75,
              py: 1.75,
              minHeight: 60,
              borderRadius: '12px',
              border: `1px solid ${brand.border}`,
              bgcolor: brand.card,
              transition: 'border-color .16s ease, transform .16s ease',
              '&:hover': { borderColor: brand.turquoise, transform: 'translateY(-1px)' },
            }}
          >
            <Box
              aria-hidden="true"
              sx={{ display: 'grid', placeItems: 'center', color: brand.turquoiseDeep, flexShrink: 0 }}
            >
              {item.book ? (
                <EventAvailableRoundedIcon sx={{ fontSize: 21 }} />
              ) : /workroom/i.test(item.label) ? (
                <GroupsRoundedIcon sx={{ fontSize: 21 }} />
              ) : (
                <VideocamRoundedIcon sx={{ fontSize: 21 }} />
              )}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="kicker"
                sx={{
                  color: brand.inkMuted,
                  mb: 0.25,
                }}
              >
                {item.verb}
              </Typography>
              <Typography sx={{ fontSize: 15, fontWeight: 500, color: brand.ink, lineHeight: 1.25 }}>
                {item.label}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Region>
  );
}

/* ------------------------------------------------------------- progress ---- */

function Delta({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) {
    return <Typography sx={{ fontSize: 12, color: brand.inkMuted }}>no prior period</Typography>;
  }
  const up = deltaPct >= 0;
  const Icon = up ? ArrowUpwardRoundedIcon : ArrowDownwardRoundedIcon;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
      <Icon aria-hidden="true" sx={{ fontSize: 13, color: up ? brand.positive : brand.negative }} />
      <Typography sx={{ fontSize: 12, color: up ? brand.positive : brand.negative }}>
        {Math.abs(Math.round(deltaPct))}%
      </Typography>
    </Box>
  );
}

const STEP_LABEL: Record<ActionStep['status'], string> = {
  complete: 'Done',
  in_progress: 'In progress',
  not_started: 'Not started',
};

export function ProgressRegion({
  metrics,
  steps,
  attendance,
  wins,
  achievements,
}: {
  metrics: Metric[];
  steps: ActionStep[];
  attendance: Attendance;
  wins: Win[];
  achievements: Achievement[];
}) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const visibleSteps = stepsOpen ? steps : steps.slice(0, 4);
  const pct = attendance.totalCount > 0
    ? Math.round((attendance.attendedCount / attendance.totalCount) * 100)
    : 0;

  return (
    <Region label="Your progress" id="numbers" quiet action={{ label: 'View and update', href: '/tracker' }}>
      {/* A data strip, not cards: one hairline rule groups the figures. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(4, minmax(0,1fr))' },
          gap: { xs: 2.5, md: 3 },
          borderTop: `1px solid ${brand.border}`,
          pt: 2.25,
          mb: 4,
        }}
      >
        {metrics.map((metric) => (
          <Box key={metric.label}>
            <Typography sx={{ fontSize: 13, color: brand.inkSoft, mb: 0.5 }}>
              {metric.label}
            </Typography>
            <Typography
              variant="metricValue"
              sx={{ fontSize: 32, color: brand.ink, mb: 0.5, display: 'block' }}
            >
              {metric.value}
            </Typography>
            <Delta deltaPct={metric.deltaPct} />
          </Box>
        ))}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.7fr) minmax(0, 1fr)' },
          gap: { xs: 3, md: 5 },
          alignItems: 'start',
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 13, color: brand.inkMuted, mb: 1.25 }}>
            What your coach asked for
          </Typography>

          {steps.length === 0 ? (
            <Typography sx={{ fontSize: 15, color: brand.inkMuted }}>
              Nothing set yet — your coach will add steps after your next call.
            </Typography>
          ) : (
            <>
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {visibleSteps.map((step, index) => {
                  const done = step.status === 'complete';
                  return (
                    <Box
                      key={step.id}
                      component={step.href ? Link : 'div'}
                      href={step.href ?? undefined}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                        py: 1.25,
                        borderTop: index === 0 ? 'none' : `1px solid ${brand.border}`,
                        '&:hover .step-t': { color: brand.turquoiseDeep },
                      }}
                    >
                      <Box
                        aria-hidden="true"
                        sx={{
                          width: 18,
                          height: 18,
                          flexShrink: 0,
                          borderRadius: '50%',
                          border: `2px solid ${done ? brand.turquoise : brand.borderStrong}`,
                          bgcolor: done ? brand.turquoise : 'transparent',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        {done ? <CheckRoundedIcon sx={{ fontSize: 12, color: brand.ink }} /> : null}
                      </Box>
                      <Typography
                        className="step-t"
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 15,
                          color: done ? brand.inkMuted : brand.ink,
                          textDecoration: done ? 'line-through' : 'none',
                        }}
                      >
                        {step.label}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: brand.inkMuted, flexShrink: 0 }}>
                        {STEP_LABEL[step.status]}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
              {steps.length > 4 ? (
                <Box
                  component="button"
                  type="button"
                  onClick={() => setStepsOpen((v) => !v)}
                  sx={{
                    mt: 1.25,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    p: 0,
                    fontFamily: '"Poppins", Arial, sans-serif',
                    fontSize: 14,
                    fontWeight: 500,
                    color: brand.turquoiseDeep,
                    '&:hover': { color: brand.ink },
                  }}
                >
                  {stepsOpen ? 'Show fewer' : `Show all ${steps.length} steps`}
                </Box>
              ) : null}
            </>
          )}
        </Box>

        <Box>
          <Typography sx={{ fontSize: 13, color: brand.inkMuted, mb: 1.25 }}>
            Attendance
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mb: 1 }}>
            <Typography variant="metricValue" sx={{ fontSize: 24, color: brand.ink }}>
              {attendance.attendedCount}
            </Typography>
            <Typography sx={{ fontSize: 14, color: brand.inkMuted }}>
              of {attendance.totalCount} · {attendance.periodLabel}
            </Typography>
          </Box>
          <Box sx={{ height: 5, bgcolor: '#e7ebea', borderRadius: 3, overflow: 'hidden', mb: 3 }}>
            <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: brand.turquoise }} />
          </Box>

          {wins.length > 0 ? (
            <>
              <Typography sx={{ fontSize: 13, color: brand.inkMuted, mb: 1 }}>
                Latest win
              </Typography>
              <Typography sx={{ fontSize: 15, color: brand.ink, lineHeight: 1.45, mb: 0.375 }}>
                {wins[0].text}
              </Typography>
              <Typography sx={{ fontSize: 12, color: brand.inkMuted, mb: achievements.length ? 3 : 0 }}>
                {wins[0].dateLabel}
                {wins.length > 1 ? ` · ${wins.length - 1} more` : ''}
              </Typography>
            </>
          ) : null}

          {achievements.length > 0 ? (
            <>
              <Typography sx={{ fontSize: 13, color: brand.inkMuted, mb: 1 }}>
                Achievements · {achievements.length}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.875 }}>
                {achievements.slice(0, 6).map((achievement) =>
                  achievement.imageUrl ? (
                    <Box
                      key={achievement.title}
                      component="img"
                      src={achievement.imageUrl}
                      alt={achievement.title}
                      title={achievement.title}
                      sx={{ width: 42, height: 42, objectFit: 'contain', borderRadius: '8px' }}
                    />
                  ) : (
                    <Box
                      key={achievement.title}
                      title={achievement.title}
                      sx={{
                        width: 42,
                        height: 42,
                        borderRadius: '8px',
                        bgcolor: '#eef1f0',
                        border: `1px solid ${brand.border}`,
                      }}
                    />
                  ),
                )}
              </Box>
            </>
          ) : null}
        </Box>
      </Box>
    </Region>
  );
}

/* --------------------------------------------------------------- footer ---- */

/**
 * Help and community drop here. Both are needed a handful of times a year and
 * were previously occupying prime real estate.
 */
export function HubFooter({
  helpSteps,
  links,
  flush = false,
}: {
  helpSteps: HelpStep[];
  links: UtilityLink[];
  /**
   * Drop the leading margin, for a layout whose last section is a full-bleed
   * tinted surface rather than the page background. The margin is breathing
   * room on the hub, where content ends on the page colour; under a tinted
   * zone it exposes a band of a third colour between two committed surfaces,
   * which reads as an unfinished edge rather than as space.
   */
  flush?: boolean;
}) {
  return (
    <Box
      component="footer"
      id="help"
      sx={{
        mt: flush ? 0 : { xs: 6, md: 9 },
        bgcolor: brand.slate,
        color: '#ffffff',
      }}
    >
      <Container maxWidth={false} sx={{ maxWidth: HOME_MAX_WIDTH, px: { xs: 2.5, md: 4 } }}>
        <Box sx={{ py: { xs: 4, md: 5 } }}>
          <Typography
            variant="sectionLabel"
            component="h2"
            sx={{ fontSize: 17, color: brand.turquoise, mb: 2.25 }}
          >
            Stuck on something?
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0,1fr))' },
              gap: { xs: 2.5, md: 4 },
              mb: { xs: 4, md: 5 },
            }}
          >
            {helpSteps.map((step) => (
              <Box key={step.title}>
                <Typography sx={{ fontSize: 16, fontWeight: 500, color: '#ffffff', mb: 0.625 }}>
                  {step.title}
                </Typography>
                <Typography
                  sx={{ fontSize: 14, color: 'rgba(255,255,255,0.62)', lineHeight: 1.5, mb: 1 }}
                >
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
                    color: brand.turquoise,
                    '&:hover': { color: '#ffffff' },
                  }}
                >
                  {step.actionLabel}
                  <ArrowForwardRoundedIcon sx={{ fontSize: 15 }} />
                </Box>
              </Box>
            ))}
          </Box>

          <Box
            sx={{
              pt: 3,
              borderTop: '1px solid rgba(255,255,255,0.14)',
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(3, minmax(0,1fr))', lg: 'repeat(6, minmax(0,1fr))' },
              gap: { xs: 1.25, md: 2 },
              mb: 3,
            }}
          >
            {links.map((link) => (
              <Box
                key={link.label}
                component={Link}
                href={link.href}
                sx={{
                  fontSize: 14,
                  lineHeight: 1.45,
                  color: 'rgba(255,255,255,0.72)',
                  '&:hover': { color: brand.turquoise },
                }}
              >
                {link.label}
              </Box>
            ))}
          </Box>

          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography sx={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
              Real Estate Reboot Coaching
            </Typography>
            <Box sx={{ display: 'flex', gap: 2.5 }}>
              <Box
                component={Link}
                href="/privacy-policy"
                sx={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', '&:hover': { color: brand.turquoise } }}
              >
                Privacy policy
              </Box>
              <Box
                component={Link}
                href="/support"
                sx={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', '&:hover': { color: brand.turquoise } }}
              >
                Support
              </Box>
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
