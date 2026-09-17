'use client';

import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import type { DiscoveryUndoEntry } from '@/lib/discoveryJobTypes';

/**
 * A persistent line, never a toast. Decisions remove items from queues, which makes every
 * keystroke feel consequential — and hesitant admins are slow admins. Across a large queue, a toast per
 * decision would flicker; a line that is always there and updates in place does not interrupt.
 */
export default function UndoLine({ last, onUndo, busy, note }: {
  last: DiscoveryUndoEntry | null;
  onUndo: () => void;
  busy: boolean;
  note: string | null;
}) {
  return (
    <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1.25 }}>
      <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap" useFlexGap>
        {last ? (
          <>
            <Typography variant="body2" color="text.secondary"
              sx={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <Box component="strong" sx={{ color: 'text.primary' }}>Last:</Box>{' '}
              {last.itemLabel} <Box component="span" sx={{ color: 'text.disabled' }}>→</Box> {last.label}
            </Typography>
            <Button size="small" startIcon={<UndoIcon fontSize="small" />} onClick={onUndo} disabled={busy}
              sx={{ textTransform: 'none', fontWeight: 600 }}>
              Undo
              <Box component="span" sx={{ ml: 0.75, px: 0.5, borderRadius: 0.5, border: '1px solid',
                borderColor: 'divider', fontSize: 10, fontFamily: 'monospace' }}>Z</Box>
            </Button>
          </>
        ) : (
          <Typography variant="body2" color="text.disabled">No decision yet this session.</Typography>
        )}
      </Stack>
      {note && <Alert severity="warning" sx={{ mt: 1, py: 0.25 }}>{note}</Alert>}
    </Box>
  );
}
