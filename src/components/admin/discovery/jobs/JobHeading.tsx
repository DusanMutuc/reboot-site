'use client';

import { Box, Stack, Typography } from '@mui/material';
import DiscoveryHelpDrawer from '../DiscoveryHelpDrawer';
import type { DiscoveryHelpView } from '@/lib/discoveryHelp';

/** Every job screen opens the same way: what this is, what it asks, and how far through you are. */
export function JobHeading({ title, children, trailing, help }: {
  title: string;
  children?: React.ReactNode;
  trailing?: React.ReactNode;
  /**
   * Which screen's help to offer. Sits beside `trailing` rather than replacing it, so a screen
   * can keep its progress count or its primary action and still carry the button — and lands in
   * the same corner on every screen, which is the whole reason it gets found.
   */
  help?: DiscoveryHelpView;
}) {
  return (
    <Stack direction="row" alignItems="flex-start" gap={2} flexWrap="wrap" useFlexGap>
      <Box sx={{ flex: 1, minWidth: 320 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>{title}</Typography>
        {children && (
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '76ch' }}>
            {children}
          </Typography>
        )}
      </Box>
      {(trailing || help) && (
        <Stack direction="row" alignItems="center" gap={1.5}>
          {trailing}
          {help && <DiscoveryHelpDrawer view={help} />}
        </Stack>
      )}
    </Stack>
  );
}
