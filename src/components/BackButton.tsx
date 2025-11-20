'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, IconButton, Tooltip, Paper, type SxProps } from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';

const containerGutterLeft = 'max(16px, calc((100vw - 1200px)/2 + 16px))';

type Props = {
  variant?: 'button' | 'icon';
  label?: string;
  fallbackHref?: string;        // where to go if there's no history
  size?: 'small' | 'medium' | 'large';
  color?: 'inherit' | 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error';
  sx?: SxProps;
  replace?: boolean;            // use router.replace for fallback nav
  onBeforeBack?: () => boolean | Promise<boolean>; // return false to cancel

  // New: fixed chip placement identical to BackToHomeButton
  fixed?: boolean;              // render as a fixed chip in the top-left
  top?: number | null;          // px from top; null => auto under #appbar
  left?: string | number;       // left offset; defaults to content gutter
  zIndex?: number;
};

export default function BackButton({
  variant = 'button',
  label = 'Back',
  fallbackHref = '/',
  size = 'medium',
  color = 'inherit',
  sx,
  replace = false,
  onBeforeBack,
  fixed = false,
  top = null,
  left,
  zIndex = 1200,
}: Props) {
  const router = useRouter();
  const [computedTop, setComputedTop] = React.useState<number>(typeof top === 'number' ? top : 16);

  React.useEffect(() => {
    if (!fixed) return;
    if (top !== null) return; // explicit top provided
    const el = document.getElementById('appbar');
    const calc = () => {
      const safe =
        Number(
          getComputedStyle(document.documentElement)
            .getPropertyValue('--safe-area-inset-top')
            .replace('px', ''),
        ) || 0;
      const h = el?.offsetHeight ?? 0;
      setComputedTop(12 + safe + h); // sit just below the app bar
    };
    calc();
    const ro = el ? new ResizeObserver(calc) : null;
    ro?.observe(el as Element);
    window.addEventListener('resize', calc);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', calc);
    };
  }, [fixed, top]);

  const goBack = React.useCallback(async () => {
    if (onBeforeBack) {
      const ok = await onBeforeBack();
      if (!ok) return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else if (fallbackHref) {
      replace ? router.replace(fallbackHref) : router.push(fallbackHref);
    }
  }, [onBeforeBack, router, fallbackHref, replace]);

  if (variant === 'icon') {
    const chip = (
      <Tooltip title={label}>
        <IconButton aria-label={label} onClick={goBack} size={size} color={color} sx={sx}>
          <ArrowBackIosNewIcon fontSize={size === 'small' ? 'small' : 'medium'} />
        </IconButton>
      </Tooltip>
    );

    if (fixed) {
      return (
        <Paper
          elevation={6}
          sx={{
            position: 'fixed',
            top: computedTop,
            left: left ?? containerGutterLeft,
            zIndex,
            p: 0.5,
            borderRadius: 999,
            backdropFilter: 'blur(6px)',
          }}
        >
          {chip}
        </Paper>
      );
    }

    return chip;
  }

  return (
    <Button onClick={goBack} startIcon={<ArrowBackIosNewIcon />} size={size} color={color} sx={sx}>
      {label}
    </Button>
  );
}
