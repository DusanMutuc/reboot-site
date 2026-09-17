'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, Button, Divider, Paper, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

/**
 * Selection bar shared by the catalogue and vocabulary tabs.
 *
 * Fixed rather than sticky: the admin shell wraps pages in a container with `overflow: auto`
 * that never actually scrolls, which leaves `position: sticky` with no range to work in.
 * The in-flow anchor supplies the content column's left edge and width, and reserves the
 * space the floating bar would otherwise cover.
 */
export default function DiscoveryFloatingBar({ selectedCount, onClear, children, footnote, busy = false }: {
  selectedCount: number;
  onClear: () => void;
  children: React.ReactNode;
  footnote?: React.ReactNode;
  busy?: boolean;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<{ left: number; width: number } | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  const visible = selectedCount > 0;

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return undefined;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      setBounds({ left: rect.left, width: rect.width });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    window.addEventListener('resize', update);
    // The shell scrolls an ancestor, so listen in the capture phase to catch it.
    window.addEventListener('scroll', update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [visible]);

  // The bar's height changes when its controls wrap, so the spacer is measured from the
  // bar itself. Only writing on an actual change keeps this from looping.
  useEffect(() => {
    if (!barRef.current) return undefined;
    const measure = () => {
      const height = barRef.current?.getBoundingClientRect().height ?? 0;
      setBarHeight((current) => (Math.abs(current - height) > 1 ? height : current));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(barRef.current);
    return () => observer.disconnect();
  }, [visible]);

  if (!visible) return null;

  return <>
    {/* Reserves the space the floating bar covers, and measures the content column. */}
    <Box ref={anchorRef} sx={{ height: barHeight ? barHeight + 24 : 112 }} aria-hidden />

    <Paper ref={barRef} elevation={8} sx={{
      position: 'fixed', bottom: 24, zIndex: 1200, p: 2, borderRadius: 2,
      border: '1px solid', borderColor: 'divider',
      left: bounds?.left ?? 0, width: bounds?.width ?? '100%',
    }}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography variant="subtitle2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            {selectedCount} selected
          </Typography>
          <Button size="small" disabled={busy} onClick={onClear} startIcon={<CloseIcon fontSize="small" />} sx={{ minWidth: 0 }}>
            Clear
          </Button>
        </Stack>
        <Divider orientation="vertical" flexItem />
        {children}
      </Stack>
      {footnote && <Box sx={{ mt: 1.5 }}>{footnote}</Box>}
    </Paper>
  </>;
}
