'use client';

import { Box, Typography } from '@mui/material';
import { discoveryOutcome, type DiscoveryOutcomeInput } from '@/lib/discoveryOutcome';

export default function DiscoveryOutcomePreview(props: DiscoveryOutcomeInput & { dense?: boolean }) {
  const { tone, search, browse } = discoveryOutcome(props);
  const border = tone === 'warning' ? 'warning.main' : tone === 'good' ? 'primary.main' : 'divider';

  const dense = props.dense === true;
  return <Box sx={{
    p: dense ? 1.25 : 1.75, borderRadius: 1.5, bgcolor: 'action.hover',
    borderLeft: '3px solid', borderColor: border,
  }}>
    {!dense && (
      <Typography variant="caption" component="div" color="text.secondary"
        sx={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', mb: 0.5 }}>
        What these settings allow
      </Typography>
    )}
    <Typography variant={dense ? 'caption' : 'body2'} component="p"
      sx={{ lineHeight: 1.5, m: 0 }}>{search}</Typography>
    <Typography variant={dense ? 'caption' : 'body2'} component="p"
      sx={{ lineHeight: 1.5, mt: 0.5, mb: 0, color: tone === 'warning' ? 'warning.dark' : 'text.primary' }}>
      {browse}
    </Typography>
    {!dense && (
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 0, mt: 1 }}>
        These settings do not publish content or grant access. An approval is not a guarantee that every member sees the item.
      </Typography>
    )}
  </Box>;
}
