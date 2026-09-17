'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Box, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import NotInterestedRoundedIcon from '@mui/icons-material/NotInterestedRounded';
import { brand } from '@/lib/homeTheme';
import { recordDiscoveryEvent } from '@/lib/discoveryClient';
import { thumbFor } from './thumbnails';
import type {
  BrowseDiscoverySelection,
  ContentItem,
  HomeDiscoveryResultSets,
} from './types';
import { useDiscoveryItemTracking } from './useDiscoveryItemTracking';

type Selection = BrowseDiscoverySelection;

const CATEGORIES: Array<{ key: Selection; label: string }> = [
  { key: 'for-you', label: 'For you' },
  { key: 'all', label: 'All' },
  { key: 'marketing', label: 'Marketing & sales' },
  { key: 'systems', label: 'Systems & operations' },
  { key: 'hiring', label: 'Hiring & team' },
  { key: 'mindset', label: 'Mindset & leadership' },
];

const PREVIEW_SIZE = 8;

type RecommendationPreference = 'finished' | 'not_interested';

function TrackedContentCard({
  entry,
  resultSetId,
  position,
  showFeedback,
  feedbackPending,
  onFeedback,
  children,
}: {
  entry: ContentItem;
  resultSetId: string | null;
  position: number | null;
  showFeedback: boolean;
  feedbackPending: boolean;
  onFeedback: (preference: RecommendationPreference) => void;
  children: ReactNode;
}) {
  const { elementRef, recordOpen } = useDiscoveryItemTracking({
    resultSetId,
    position,
  });

  return (
    <Box
      ref={elementRef}
      sx={{
        position: 'relative',
        borderRadius: '12px',
        overflow: 'hidden',
        border: `1px solid ${brand.border}`,
        bgcolor: brand.card,
        transition: 'border-color .16s ease, transform .16s ease',
        '&:hover': { borderColor: brand.turquoise, transform: 'translateY(-2px)' },
        '&:hover .ci-title': { color: brand.turquoiseDeep },
        '&:hover .discovery-feedback, &:focus-within .discovery-feedback': {
          opacity: 1,
          pointerEvents: 'auto',
        },
      }}
    >
      <Box component={Link} href={entry.href} onClick={recordOpen} sx={{ display: 'block' }}>
        {children}
      </Box>
      {entry.containerHref && entry.containerTitle ? (
        <Typography component={Link} href={entry.containerHref}
          sx={{ display: 'block', px: 2, pb: 1.5, fontSize: 12, color: brand.inkMuted, textDecoration: 'underline' }}>
          From {entry.containerTitle}
        </Typography>
      ) : null}

      {showFeedback ? (
        <Box
          className="discovery-feedback"
          sx={{
            position: 'absolute',
            top: 7,
            right: 7,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            p: 0.5,
            borderRadius: '8px',
            border: `1px solid ${brand.border}`,
            bgcolor: 'rgba(255,255,255,0.96)',
            boxShadow: '0 4px 16px rgba(18,20,20,0.14)',
            opacity: { xs: 1, md: 0 },
            pointerEvents: { xs: 'auto', md: 'none' },
            transition: 'opacity .14s ease',
          }}
        >
          <Box
            component="button"
            type="button"
            disabled={feedbackPending}
            onClick={() => onFeedback('finished')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 0.75,
              py: 0.5,
              border: 0,
              borderRadius: '5px',
              bgcolor: 'transparent',
              color: brand.ink,
              fontFamily: 'inherit',
              fontSize: 11,
              whiteSpace: 'nowrap',
              cursor: feedbackPending ? 'wait' : 'pointer',
              '&:hover': { bgcolor: brand.turquoiseTint },
            }}
          >
            <CheckCircleOutlineRoundedIcon sx={{ fontSize: 15 }} />
            I’ve finished this
          </Box>
          <Box
            component="button"
            type="button"
            disabled={feedbackPending}
            onClick={() => onFeedback('not_interested')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 0.75,
              py: 0.5,
              border: 0,
              borderRadius: '5px',
              bgcolor: 'transparent',
              color: brand.ink,
              fontFamily: 'inherit',
              fontSize: 11,
              whiteSpace: 'nowrap',
              cursor: feedbackPending ? 'wait' : 'pointer',
              '&:hover': { bgcolor: brand.turquoiseTint },
            }}
          >
            <NotInterestedRoundedIcon sx={{ fontSize: 15 }} />
            Not interested right now
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * The one place on this page where content is browsed.
 *
 * Recommendations used to sit above this in a rail of their own. Two
 * collections drawn in identical cards but driven by different mechanics — one
 * scrolled sideways, one filtered in place — read as a seam rather than a
 * sequence, and the chips underneath a labelled row had nothing saying what
 * they acted on. So "For you" is simply the first chip and the default view:
 * one object, one mechanic, and the recommendations are what they always
 * were — a selection of the same catalogue.
 *
 * The chips convey the *shape* of the library without needing its size, which
 * is what lets this stay a preview. Items belong to several categories at
 * once, the way a film sits in several genres.
 */
export default function ContentBrowser({
  items,
  recommended,
  resultSets,
  discoveryEnabled = false,
}: {
  items: ContentItem[];
  /** The relatedness algorithm's picks. Falls back to All when empty. */
  recommended: ContentItem[];
  /** Ordered server responses for accurate category presentation and attribution. */
  resultSets: HomeDiscoveryResultSets;
  /** Keeps member discovery interactions dormant during the admin curation period. */
  discoveryEnabled?: boolean;
}) {
  const [category, setCategory] = useState<Selection>(
    recommended.length > 0 ? 'for-you' : 'all',
  );
  const [hiddenRecommendations, setHiddenRecommendations] = useState(() => new Set<string>());
  const [feedbackPendingId, setFeedbackPendingId] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const hasCoachRecommendations = recommended.some((item) => item.recommendationSource === 'coach');
  const hasAlgorithmicRecommendations = recommended.some((item) => item.recommendationSource !== 'coach');
  const lastShownViewRef = useRef<string | null>(null);

  const itemById = useMemo(
    () => new Map([...items, ...recommended].map((item) => [item.id, item])),
    [items, recommended],
  );

  const availableCategories = useMemo(() => {
    const available = new Set(items.flatMap((item) => item.categories));
    CATEGORIES.forEach((option) => {
      if (option.key === 'all' || option.key === 'for-you') return;
      if (Object.keys(resultSets[option.key]?.itemPositions ?? {}).length > 0) {
        available.add(option.key);
      }
    });
    return available;
  }, [items, resultSets]);

  const filtered = useMemo(() => {
    const positions = resultSets[category]?.itemPositions;
    if (positions) {
      const ordered = Object.entries(positions)
        .sort((left, right) => left[1] - right[1])
        .flatMap(([itemId]) => {
          const item = itemById.get(itemId);
          return item ? [item] : [];
        });
      return category === 'for-you'
        ? ordered.filter((item) => !hiddenRecommendations.has(item.id))
        : ordered;
    }

    if (category === 'for-you') return recommended;
    if (category === 'all') return items;
    return items.filter((item) => item.categories.includes(category));
  }, [category, hiddenRecommendations, itemById, items, recommended, resultSets]);

  const activeResultSet = resultSets[category];

  useEffect(() => {
    const resultSetId = activeResultSet?.id;
    const viewKey = resultSetId ? `${category}:${resultSetId}` : null;
    if (!resultSetId || lastShownViewRef.current === viewKey) return;
    lastShownViewRef.current = viewKey;
    recordDiscoveryEvent({
      eventType: 'result_set_shown',
      resultSetId,
      metadata: {
        surface: 'member_home_browser',
        selection: category,
        returnedCount: Object.keys(activeResultSet.itemPositions).length,
      },
    });
  }, [activeResultSet, category]);

  async function saveRecommendationFeedback(
    entry: ContentItem,
    preference: RecommendationPreference,
  ) {
    if (!entry.resourceId || feedbackPendingId) return;
    setFeedbackPendingId(entry.id);
    setFeedbackError(null);

    try {
      const response = await fetch('/api/discovery/preferences', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resourceId: entry.resourceId, preference }),
      });
      if (!response.ok) throw new Error('Could not save that feedback.');

      const position = activeResultSet?.itemPositions[entry.id];
      if (activeResultSet?.id && position) {
        recordDiscoveryEvent({
          eventType:
            preference === 'finished' ? 'feedback_finished' : 'feedback_not_interested',
          resultSetId: activeResultSet.id,
          itemPosition: position,
        });
      }

      setHiddenRecommendations((current) => new Set(current).add(entry.id));
    } catch (error) {
      setFeedbackError(
        error instanceof Error ? error.message : 'Could not save that feedback.',
      );
    } finally {
      setFeedbackPendingId(null);
    }
  }

  const visible = filtered.slice(0, PREVIEW_SIZE);

  return (
    <Box component="section" id="browse">
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          mb: 1.25,
        }}
      >
        {CATEGORIES.filter((option) => {
          if (option.key === 'all') return true;
          if (option.key === 'for-you') return recommended.length > 0;
          return availableCategories.has(option.key);
        }).map((option) => {
          const isActive = option.key === category;
          return (
            <Box
              key={option.key}
              component="button"
              type="button"
              onClick={() => {
                setCategory(option.key);
                if (!discoveryEnabled) return;
                recordDiscoveryEvent({
                  eventType: 'category_selected',
                  resultSetId: resultSets[option.key]?.id,
                  metadata: { selection: option.key, surface: 'member_home_browser' },
                });
              }}
              aria-pressed={isActive}
              sx={{
                cursor: 'pointer',
                px: 1.875,
                py: 1,
                borderRadius: '999px',
                fontFamily: '"Poppins", Arial, sans-serif',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                border: `1px solid ${isActive ? brand.slate : brand.border}`,
                bgcolor: isActive ? brand.slate : brand.card,
                color: isActive ? '#ffffff' : brand.inkSoft,
                transition: 'background-color .16s ease, border-color .16s ease, color .16s ease',
                '&:hover': isActive ? {} : { borderColor: brand.turquoise, color: brand.ink },
              }}
            >
              {option.label}
            </Box>
          );
        })}
      </Box>

      {/* Names the algorithm's reason rather than letting the chip imply
          curation. Height is reserved so switching chips does not shift the
          grid directly under the control just clicked. */}
      <Typography
        sx={{ minHeight: 22, mb: 2, fontSize: 14, lineHeight: '22px', color: brand.inkMuted }}
      >
        {category === 'for-you'
          ? hasCoachRecommendations
            ? hasAlgorithmicRecommendations
              ? 'Suggestions from your coach appear first, followed by material related to your current priorities.'
              : 'Resources your coach selected for you.'
            : 'Supplementary material related to your current priorities.'
          : ''}
      </Typography>

      {filtered.length === 0 ? (
        <Typography sx={{ fontSize: 15, color: brand.inkMuted }}>
          {category === 'for-you'
            ? 'No more recommendations to show right now.'
            : 'Supplementary resources will appear here once reviewed. You can still use search or the guide library.'}
        </Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(3, minmax(0, 1fr))',
              lg: 'repeat(4, minmax(0, 1fr))',
            },
            gap: { xs: 1.75, md: 2.25 },
          }}
        >
          {visible.map((entry) => (
            <TrackedContentCard
              key={entry.id}
              entry={entry}
              resultSetId={activeResultSet?.id ?? null}
              position={activeResultSet?.itemPositions[entry.id] ?? null}
              showFeedback={category === 'for-you' && Boolean(entry.resourceId)}
              feedbackPending={feedbackPendingId === entry.id}
              onFeedback={(preference) => void saveRecommendationFeedback(entry, preference)}
            >
              <Box
                sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', bgcolor: '#e7ebea' }}
              >
                {entry.thumbnailUrl ? (
                  <Box
                    component="img"
                    src={entry.thumbnailUrl}
                    alt=""
                    aria-hidden="true"
                    sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <Image
                    src={thumbFor(entry.thumbIndex).src}
                    alt=""
                    aria-hidden="true"
                    fill
                    quality={55}
                    sizes="(max-width: 900px) 50vw, 280px"
                    style={{
                      objectFit: 'cover',
                      objectPosition: thumbFor(entry.thumbIndex).objectPosition,
                    }}
                  />
                )}
                {entry.metaLabel ? (
                  <Typography
                    component="span"
                    sx={{
                      position: 'absolute',
                      right: 6,
                      bottom: 10,
                      px: 0.75,
                      py: 0.125,
                      borderRadius: '4px',
                      bgcolor: 'rgba(18,20,20,0.78)',
                      color: '#ffffff',
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                  >
                    {entry.metaLabel}
                  </Typography>
                ) : null}

                {entry.typeLabel === 'Training' ? (
                  <Typography
                    component="span"
                    sx={{
                      position: 'absolute',
                      left: 6,
                      bottom: 10,
                      px: 0.75,
                      py: 0.25,
                      borderRadius: '4px',
                      bgcolor: brand.turquoise,
                      color: brand.ink,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Training
                  </Typography>
                ) : null}

                {/* On the artwork, not under it. As a sibling block this added
                    four pixels to every card that had progress and none to the
                    rest, so within a single row the kickers and titles sat on
                    different lines — a wobble you can see across the grid
                    without being able to point at what is causing it. Riding
                    the thumbnail costs no layout at all, and it matches the
                    required-training card, which has always drawn it this
                    way. */}
                {entry.progressPct !== null ? (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 5,
                      bgcolor: 'rgba(18,20,20,0.35)',
                    }}
                  >
                    <Box
                      sx={{ width: `${entry.progressPct}%`, height: '100%', bgcolor: brand.turquoise }}
                    />
                  </Box>
                ) : null}
              </Box>

              <Box sx={{ p: 1.5 }}>
                <Typography sx={{ minHeight: 18, mb: 0.25, fontSize: 11, lineHeight: '16px', fontWeight: 600, color: entry.recommendationSource === 'coach' ? brand.turquoiseDeep : 'transparent' }}>
                  {entry.recommendationSource === 'coach' ? `${entry.coachName ?? 'Your coach'} wanted you to check this out.` : 'Recommendation'}
                </Typography>
                <Typography
                  variant="kicker"
                  sx={{
                    color: brand.inkMuted,
                    mb: 0.5,
                  }}
                >
                  {entry.typeLabel}
                </Typography>
                <Typography
                  className="ci-title"
                  sx={{
                    fontSize: 15,
                    fontWeight: 500,
                    lineHeight: 1.35,
                    color: brand.ink,
                    transition: 'color .16s ease',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    minHeight: 39,
                  }}
                >
                  {entry.title}
                </Typography>
              </Box>
            </TrackedContentCard>
          ))}
        </Box>
      )}

      {feedbackError ? (
        <Typography role="alert" sx={{ mt: 1.5, fontSize: 13, color: '#a13b2c' }}>
          {feedbackError}
        </Typography>
      ) : null}

      {/* Discovery continues separately from the structured guide library. */}
      <Box sx={{ mt: 3 }}>
        <Box
          component={Link}
          href={!discoveryEnabled
            ? '/library'
            : category === 'all' || category === 'for-you'
              ? '/discover'
              : `/discover?category=${encodeURIComponent(category)}`}
          onClick={() => {
            if (!discoveryEnabled) return;
            recordDiscoveryEvent(
              {
                eventType: 'discovery_opened',
                resultSetId: activeResultSet?.id,
                metadata: { source: 'member_home_browser', selection: category },
              },
              { keepalive: true },
            );
          }}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            px: 2.25,
            py: 1.125,
            borderRadius: '10px',
            border: `1px solid ${brand.borderStrong}`,
            bgcolor: brand.card,
            fontSize: 15,
            fontWeight: 500,
            color: brand.ink,
            transition: 'border-color .16s ease',
            '&:hover': { borderColor: brand.turquoise },
          }}
        >
          {discoveryEnabled ? 'Continue exploring' : 'Open the library'}
          <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
        </Box>
        <Box
          component={Link}
          href="/library"
          onClick={() => {
            if (!discoveryEnabled) return;
            recordDiscoveryEvent({
              eventType: 'full_library_opened',
              metadata: { source: 'member_home_browser' },
            }, { keepalive: true });
          }}
          sx={{ display: 'inline-block', ml: 2, fontSize: 14, color: brand.inkMuted }}
        >
          Open guide library
        </Box>
      </Box>
    </Box>
  );
}
