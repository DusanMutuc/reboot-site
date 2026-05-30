// src/components/AnnouncementBanner.tsx
'use client';

import { Box, Stack, Typography, Button } from '@mui/material';
import CampaignIcon from '@mui/icons-material/Campaign';

// Decide if text on this background should be black or white
function getContrastText(bg?: string): '#000000' | '#ffffff' {
  if (!bg) return '#000000';

  let hex = bg.trim().toLowerCase();

  // Only handle hex (#rgb or #rrggbb). Fallback for anything else.
  if (!hex.startsWith('#')) return '#000000';
  hex = hex.slice(1);

  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }

  if (hex.length !== 6) return '#000000';

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return '#000000';

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#000000' : '#ffffff';
}

type Props = {
  message: string | null | undefined;
  backgroundColor?: string | null;
  textColor?: string | null;
  buttonLabel?: string;
  buttonUrl?: string;
  buttonColor?: string;
};

export default function AnnouncementBanner({
  message,
  backgroundColor,
  textColor,
  buttonLabel,
  buttonUrl,
  buttonColor,
}: Props) {
  if (!message) return null;

  const bg = backgroundColor ?? 'rgba(92, 188, 168, 0.06)'; // default: soft teal tint
  const fg = textColor ?? '#0f172a'; // default: dark text

  const showButton = !!buttonLabel && !!buttonUrl;
  const btnBg = buttonColor ?? '#5cbca8'; // default teal
  const btnFg = getContrastText(btnBg);

  return (
    <Box
      sx={{
        mb: 0,
        px: 3,
        py: 1.25,
        borderRadius: 0,
        borderTop: '1px solid rgba(148, 163, 184, 0.4)',
        borderBottom: '1px solid rgba(148, 163, 184, 0.4)',
        backgroundColor: bg,
        color: fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        gap: 2,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
        <CampaignIcon sx={{ fontSize: 20, opacity: 0.9, flexShrink: 0 }} />
        <Typography
          variant="h5"
          sx={{
            fontWeight: 500,
            letterSpacing: 0.01,
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {message}
        </Typography>
      </Stack>

      {showButton && (
        <Button
          size="small"
          variant="contained"
          color="inherit"
          component="a"
          href={buttonUrl!} // safe because showButton checked it
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            flexShrink: 0,
            whiteSpace: 'nowrap',
            backgroundColor: `${btnBg} !important`,
            color: `${btnFg} !important`,
            boxShadow: 'none',
            '&:hover': {
              backgroundColor: `${btnBg} !important`,
              opacity: 0.9,
              boxShadow: 'none',
            },
          }}
        >
          {buttonLabel}
        </Button>
      )}
    </Box>
  );
}
