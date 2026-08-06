'use client';

import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { Box, Chip, Paper, Stack, Typography } from '@mui/material';

import type { FocusFinderDimension } from '@/lib/businessReviews';

const BANDS = [
  { label: 'Superpower', fill: '#e3f2df', accent: '#57d624' },
  { label: 'Strength', fill: '#fff9d9', accent: '#ffdf20' },
  { label: 'Weakness', fill: '#fff0dc', accent: '#ff9500' },
  { label: 'Problem', fill: '#fde3e1', accent: '#f02212' },
] as const;

const WIDTH = 1240;
const HEIGHT = 646;
const LABEL_WIDTH = 142;
const PLOT_LEFT = LABEL_WIDTH;
const PLOT_RIGHT = 20;
const PLOT_WIDTH = WIDTH - PLOT_LEFT - PLOT_RIGHT;
const GROUP_HEADER_HEIGHT = 46;
const DIMENSION_HEADER_HEIGHT = 84;
const PLOT_TOP = GROUP_HEADER_HEIGHT + DIMENSION_HEADER_HEIGHT;
const BAND_HEIGHT = 124;
const PLOT_HEIGHT = BAND_HEIGHT * BANDS.length;
const PLOT_BOTTOM = PLOT_TOP + PLOT_HEIGHT;
const TOP_RATING_Y = PLOT_TOP + BAND_HEIGHT / 2;
const RATING_STEP = BAND_HEIGHT / 2;

export type FocusFinderSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type FocusFinderChartProps = {
  dimensions: FocusFinderDimension[];
  values: Record<number, number>;
  saveStatus?: FocusFinderSaveStatus;
  disabled?: boolean;
  onValueChange: (dimensionId: number, value: number) => void;
  onValueCommit: (dimensionId: number, value: number) => void;
};

type DimensionGroup = {
  key: string;
  label: string;
  start: number;
  span: number;
};

function clampRating(value: number) {
  return Math.min(7, Math.max(1, value));
}

function getRatingY(value: number) {
  return TOP_RATING_Y + (7 - value) * RATING_STEP;
}

function buildGroups(dimensions: FocusFinderDimension[]): DimensionGroup[] {
  return dimensions.reduce<DimensionGroup[]>((groups, dimension, index) => {
    const previous = groups.at(-1);

    if (previous?.key === dimension.groupKey) {
      previous.span += 1;
      return groups;
    }

    groups.push({
      key: dimension.groupKey,
      label: dimension.groupLabel,
      start: index,
      span: 1,
    });
    return groups;
  }, []);
}

function getStatusChip(
  saveStatus: FocusFinderSaveStatus,
  selectedCount: number,
  dimensionCount: number,
) {
  if (saveStatus === 'saving') {
    return { color: 'warning' as const, label: 'Saving changes…' };
  }

  if (saveStatus === 'error') {
    return { color: 'error' as const, label: 'Save failed' };
  }

  if (saveStatus === 'saved') {
    return { color: 'success' as const, label: 'All changes saved' };
  }

  return {
    color: 'default' as const,
    label: `${selectedCount} of ${dimensionCount} scored`,
  };
}

export default function FocusFinderChart({
  dimensions,
  values,
  saveStatus = 'idle',
  disabled = false,
  onValueChange,
  onValueCommit,
}: FocusFinderChartProps) {
  const [focusedDimensionId, setFocusedDimensionId] = useState<number | null>(null);
  const [hoveredDimensionId, setHoveredDimensionId] = useState<number | null>(null);
  const dragValuesRef = useRef<Record<number, number>>({});
  const columnWidth = PLOT_WIDTH / Math.max(dimensions.length, 1);
  const getDimensionX = (index: number) => PLOT_LEFT + columnWidth * (index + 0.5);
  const groups = useMemo(() => buildGroups(dimensions), [dimensions]);
  const selectedCount = dimensions.filter((dimension) => values[dimension.id] != null).length;
  const statusChip = getStatusChip(saveStatus, selectedCount, dimensions.length);

  const lineSegments = useMemo(() => {
    const segments: Array<Array<{ index: number; value: number }>> = [];
    let current: Array<{ index: number; value: number }> = [];

    dimensions.forEach((dimension, index) => {
      const value = values[dimension.id];

      if (Number.isInteger(value)) {
        current.push({ index, value });
        return;
      }

      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
    });

    if (current.length > 0) {
      segments.push(current);
    }

    return segments;
  }, [dimensions, values]);

  const getPointerRating = (event: PointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    const transform = svg?.getScreenCTM();

    if (!svg || !transform) return null;

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const svgPoint = point.matrixTransform(transform.inverse());
    const rating = Math.round(7 - (svgPoint.y - TOP_RATING_Y) / RATING_STEP);

    return clampRating(rating);
  };

  const updateFromPointer = (
    event: PointerEvent<SVGRectElement>,
    dimensionId: number,
  ) => {
    const rating = getPointerRating(event);
    if (rating == null) return null;

    dragValuesRef.current[dimensionId] = rating;
    onValueChange(dimensionId, rating);
    return rating;
  };

  const handlePointerDown = (
    event: PointerEvent<SVGRectElement>,
    dimensionId: number,
  ) => {
    if (disabled) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event, dimensionId);
  };

  const handlePointerMove = (
    event: PointerEvent<SVGRectElement>,
    dimensionId: number,
  ) => {
    if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateFromPointer(event, dimensionId);
  };

  const finishPointerInteraction = (
    event: PointerEvent<SVGRectElement>,
    dimensionId: number,
  ) => {
    if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;

    const rating = updateFromPointer(event, dimensionId) ?? dragValuesRef.current[dimensionId];
    event.currentTarget.releasePointerCapture(event.pointerId);
    delete dragValuesRef.current[dimensionId];

    if (rating != null) {
      onValueCommit(dimensionId, rating);
    }
  };

  const cancelPointerInteraction = (
    event: PointerEvent<SVGRectElement>,
    dimensionId: number,
  ) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

    const rating = dragValuesRef.current[dimensionId];
    event.currentTarget.releasePointerCapture(event.pointerId);
    delete dragValuesRef.current[dimensionId];

    if (!disabled && rating != null) {
      onValueCommit(dimensionId, rating);
    }
  };

  const handleKeyDown = (
    event: KeyboardEvent<SVGRectElement>,
    dimensionId: number,
  ) => {
    if (disabled) return;

    const currentValue = values[dimensionId] ?? 4;
    let nextValue: number | null = null;

    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      nextValue = clampRating(currentValue + 1);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      nextValue = clampRating(currentValue - 1);
    } else if (event.key === 'Home') {
      nextValue = 1;
    } else if (event.key === 'End') {
      nextValue = 7;
    }

    if (nextValue == null) return;

    event.preventDefault();
    onValueChange(dimensionId, nextValue);
    onValueCommit(dimensionId, nextValue);
  };

  return (
    <Paper
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'grey.200',
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        sx={{
          px: { xs: 2, md: 3 },
          py: 2.5,
          borderBottom: '1px solid',
          borderColor: 'grey.200',
          bgcolor: 'grey.50',
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Focus Finder
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Click or drag on each bar to score it from 1 to 7.
          </Typography>
        </Box>
        <Chip
          label={statusChip.label}
          color={statusChip.color}
          size="small"
          variant={statusChip.color === 'default' ? 'outlined' : 'filled'}
          sx={{ fontWeight: 700 }}
        />
      </Stack>

      <Box
        sx={{
          overflowX: 'auto',
          px: { xs: 1.5, md: 2.5 },
          py: { xs: 2, md: 3 },
          bgcolor: '#fff',
        }}
      >
        <Box sx={{ minWidth: 980 }}>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            width="100%"
            role="group"
            aria-labelledby="focus-finder-title focus-finder-description"
          >
            <title id="focus-finder-title">Interactive Focus Finder graph</title>
            <desc id="focus-finder-description">
              Nine business dimensions rated from Problem to Superpower. Each selected rating is
              saved to this business review.
            </desc>

            <rect
              x={0}
              y={0}
              width={WIDTH}
              height={PLOT_BOTTOM}
              rx={14}
              fill="#ffffff"
              stroke="#d8dddb"
              strokeWidth={2}
            />

            <rect
              x={0}
              y={0}
              width={PLOT_LEFT}
              height={GROUP_HEADER_HEIGHT + DIMENSION_HEADER_HEIGHT}
              fill="#f4f5f4"
            />

            {groups.map((group) => {
              const x = PLOT_LEFT + group.start * columnWidth;
              const width = group.span * columnWidth;

              return (
                <g key={group.key}>
                  <rect
                    x={x}
                    y={0}
                    width={width}
                    height={GROUP_HEADER_HEIGHT}
                    fill="#e5e7e6"
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                  <text
                    x={x + width / 2}
                    y={29}
                    textAnchor="middle"
                    fill="#4d5351"
                    fontSize={18}
                    fontWeight={800}
                  >
                    {group.label}
                  </text>
                </g>
              );
            })}

            {dimensions.map((dimension, index) => {
              const x = PLOT_LEFT + index * columnWidth;
              const centerX = getDimensionX(index);

              return (
                <g key={dimension.id}>
                  <rect
                    x={x}
                    y={GROUP_HEADER_HEIGHT}
                    width={columnWidth}
                    height={DIMENSION_HEADER_HEIGHT}
                    fill="#b9bdbc"
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                  <text
                    x={centerX}
                    y={GROUP_HEADER_HEIGHT + 34}
                    textAnchor="middle"
                    fill="#4a4f4d"
                    fontSize={15}
                    fontWeight={800}
                  >
                    {dimension.label}
                  </text>
                  <text
                    x={centerX}
                    y={GROUP_HEADER_HEIGHT + 57}
                    textAnchor="middle"
                    fill="#565c59"
                    fontSize={12}
                    fontWeight={700}
                  >
                    ({dimension.subtitle})
                  </text>
                </g>
              );
            })}

            {BANDS.map((band, index) => {
              const y = PLOT_TOP + index * BAND_HEIGHT;

              return (
                <g key={band.label}>
                  <rect
                    x={0}
                    y={y}
                    width={PLOT_LEFT}
                    height={BAND_HEIGHT}
                    fill={band.accent}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                  <rect
                    x={PLOT_LEFT}
                    y={y}
                    width={PLOT_WIDTH}
                    height={BAND_HEIGHT}
                    fill={band.fill}
                    stroke="#d7dcda"
                    strokeWidth={1.5}
                  />
                  <text
                    x={PLOT_LEFT / 2}
                    y={y + BAND_HEIGHT / 2 + 6}
                    textAnchor="middle"
                    fill={index === 1 ? '#624f00' : '#ffffff'}
                    fontSize={16}
                    fontWeight={900}
                    letterSpacing={0.6}
                  >
                    {band.label.toUpperCase()}
                  </text>
                </g>
              );
            })}

            {dimensions.map((dimension, index) =>
              hoveredDimensionId === dimension.id || focusedDimensionId === dimension.id ? (
                <rect
                  key={`highlight-${dimension.id}`}
                  x={PLOT_LEFT + index * columnWidth}
                  y={PLOT_TOP}
                  width={columnWidth}
                  height={PLOT_HEIGHT}
                  fill="#ffffff"
                  opacity={0.22}
                  pointerEvents="none"
                />
              ) : null,
            )}

            {Array.from({ length: dimensions.length + 1 }, (_, index) => {
              const x = PLOT_LEFT + index * columnWidth;
              const isGroupBoundary =
                index === 0 ||
                index === dimensions.length ||
                groups.some((group) => group.start === index);

              return (
                <line
                  key={`column-${index}`}
                  x1={x}
                  y1={PLOT_TOP}
                  x2={x}
                  y2={PLOT_BOTTOM}
                  stroke={isGroupBoundary ? '#c6ccca' : '#dce1df'}
                  strokeWidth={isGroupBoundary ? 3 : 1.5}
                />
              );
            })}

            {dimensions.map((dimension, index) => {
              const x = getDimensionX(index);
              const active =
                hoveredDimensionId === dimension.id || focusedDimensionId === dimension.id;

              return (
                <g key={`scale-${dimension.id}`}>
                  <line
                    x1={x}
                    y1={getRatingY(7)}
                    x2={x}
                    y2={getRatingY(1)}
                    stroke={active ? '#f7f8f7' : '#ffffff'}
                    strokeWidth={active ? 10 : 7}
                    strokeLinecap="round"
                  />

                  {[1, 3, 5, 7].map((value) => (
                    <circle
                      key={`anchor-${value}`}
                      cx={x}
                      cy={getRatingY(value)}
                      r={14}
                      fill="#ffffff"
                      stroke={active ? '#b5bbb8' : '#e1e5e3'}
                      strokeWidth={2}
                    />
                  ))}

                  {[2, 4, 6].map((value) => (
                    <circle
                      key={`midpoint-${value}`}
                      cx={x}
                      cy={getRatingY(value)}
                      r={5}
                      fill="#ffffff"
                      opacity={0.9}
                    />
                  ))}
                </g>
              );
            })}

            {lineSegments.map((segment, index) =>
              segment.length > 1 ? (
                <polyline
                  key={`segment-${index}`}
                  points={segment
                    .map((point) => `${getDimensionX(point.index)},${getRatingY(point.value)}`)
                    .join(' ')}
                  fill="none"
                  stroke="#202423"
                  strokeWidth={9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              ) : null,
            )}

            {dimensions.map((dimension, index) => {
              const value = values[dimension.id];
              if (!Number.isInteger(value)) return null;

              return (
                <g key={`selected-value-${dimension.id}`} pointerEvents="none">
                  <circle
                    cx={getDimensionX(index)}
                    cy={getRatingY(value)}
                    r={12}
                    fill="#202423"
                    stroke="#ffffff"
                    strokeWidth={4}
                  />
                </g>
              );
            })}

            {dimensions.map((dimension, index) => {
              const currentValue = values[dimension.id];
              const focused = focusedDimensionId === dimension.id;

              return (
                <g key={`control-${dimension.id}`}>
                  {focused ? (
                    <rect
                      x={PLOT_LEFT + index * columnWidth + 4}
                      y={PLOT_TOP + 4}
                      width={columnWidth - 8}
                      height={PLOT_HEIGHT - 8}
                      rx={8}
                      fill="none"
                      stroke="#202423"
                      strokeWidth={3}
                      strokeDasharray="8 7"
                      pointerEvents="none"
                    />
                  ) : null}
                  <rect
                    x={PLOT_LEFT + index * columnWidth}
                    y={PLOT_TOP}
                    width={columnWidth}
                    height={PLOT_HEIGHT}
                    fill="transparent"
                    role="slider"
                    tabIndex={disabled ? -1 : 0}
                    aria-label={`${dimension.groupLabel}: ${dimension.label}, ${dimension.subtitle}`}
                    aria-valuemin={1}
                    aria-valuemax={7}
                    aria-valuenow={currentValue}
                    aria-valuetext={
                      currentValue == null ? 'Not scored' : `${currentValue} out of 7`
                    }
                    style={{
                      cursor: disabled ? 'default' : 'pointer',
                      outline: 'none',
                      touchAction: 'none',
                    }}
                    onFocus={() => setFocusedDimensionId(dimension.id)}
                    onBlur={() => setFocusedDimensionId(null)}
                    onPointerEnter={() => setHoveredDimensionId(dimension.id)}
                    onPointerLeave={() => setHoveredDimensionId(null)}
                    onPointerDown={(event) => handlePointerDown(event, dimension.id)}
                    onPointerMove={(event) => handlePointerMove(event, dimension.id)}
                    onPointerUp={(event) => finishPointerInteraction(event, dimension.id)}
                    onPointerCancel={(event) => cancelPointerInteraction(event, dimension.id)}
                    onKeyDown={(event) => handleKeyDown(event, dimension.id)}
                  />
                </g>
              );
            })}

          </svg>
        </Box>
      </Box>
    </Paper>
  );
}
