'use client';

import * as React from 'react';
import Link from 'next/link';
import { IconButton, Tooltip, Paper } from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';

const containerGutterLeft = 'max(16px, calc((100vw - 1200px)/2 + 16px))';

type Props = {
  href?: string;                 // where "home" lives
  label?: string;                // tooltip/aria label
  left?: string | number;        // left offset; defaults to content gutter
  top?: number | null;           // px from top; null => auto under #appbar
  zIndex?: number;
};

export default function BackToHomeButton({
  href = '/user',
  label = 'Back to Home',
  left,                           // default applied in sx
  top = null,
  zIndex = 1200,
}: Props) {
  const [computedTop, setComputedTop] = React.useState<number>(typeof top === 'number' ? top : 16);

  React.useEffect(() => {
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
  }, [top]);

  return (
    <Paper
      elevation={6}
      sx={{
        position: 'fixed',
        top: computedTop,
        left: left ?? containerGutterLeft, // align to content gutter
        zIndex,
        p: 0.5,
        borderRadius: 999,
        backdropFilter: 'blur(6px)',
      }}
    >
      <Tooltip title={label}>
        <IconButton aria-label={label} component={Link} href={href} size="small" sx={{ color: 'inherit' }}>
          <ArrowBackIosNewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Paper>
  );
}
