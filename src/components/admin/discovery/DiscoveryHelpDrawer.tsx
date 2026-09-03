'use client';

import { useState } from 'react';
import {
  Alert, Box, Button, Divider, Drawer, IconButton, Link, Stack, Typography,
} from '@mui/material';
import {
  HelpOutline as HelpOutlineIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import {
  DISCOVERY_HELP, DISCOVERY_GUIDE_HREF,
} from '@/lib/discoveryHelp';
import type { DiscoveryHelpView, HelpCard } from '@/lib/discoveryHelp';

/** Renders the `**bold**` the content module allows, and nothing else. */
function RichText({ text }: { text: string }) {
  return <>
    {text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => (
      part.startsWith('**') && part.endsWith('**')
        ? <Box key={index} component="strong" sx={{ fontWeight: 600 }}>{part.slice(2, -2)}</Box>
        : <Box key={index} component="span">{part}</Box>
    ))}
  </>;
}

function Card({ card }: { card: HelpCard }) {
  return (
    <Stack gap={1.5}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1.5}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{card.name}</Typography>
        {card.qty && (
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {card.qty}
          </Typography>
        )}
      </Stack>

      <Stack component="ul" gap={0.75} sx={{ m: 0, pl: 2.5 }}>
        {card.rules.map((rule) => (
          <Typography key={rule} component="li" variant="body2" sx={{ lineHeight: 1.5 }}>
            <RichText text={rule} />
          </Typography>
        ))}
      </Stack>

      {card.asks?.map((ask) => (
        <Typography
          key={ask}
          variant="body2"
          sx={{
            fontWeight: 600, lineHeight: 1.45,
            borderLeft: 2, borderColor: 'divider', pl: 1.25,
          }}
        >
          {ask}
        </Typography>
      ))}

      <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, px: 1.5, py: 1.25 }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, letterSpacing: '0.08em', color: 'text.secondary', display: 'block', mb: 0.5 }}
        >
          GOOD LOOKS LIKE
        </Typography>
        <Stack gap={0.5}>
          {card.good.map((example) => (
            <Typography key={example.to} variant="body2" sx={{ lineHeight: 1.45 }}>
              {example.from && <>
                <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{example.from}</Box>
                <Box component="span" sx={{ opacity: 0.6, px: 0.75 }}>→</Box>
              </>}
              {example.to}
            </Typography>
          ))}
        </Stack>
      </Box>

      <Alert severity="warning" icon={false} sx={{ py: 0.5 }}>
        <Typography variant="body2" sx={{ lineHeight: 1.45 }}>
          <RichText text={card.watch} />
        </Typography>
      </Alert>
    </Stack>
  );
}

/**
 * The help button and its drawer.
 *
 * A drawer rather than a tooltip because the content is card-sized — a rule, two examples and a
 * trap — and rather than a dialog because it is read *while* working, next to the thing it is
 * about, not instead of it. Each screen opens to its own cards; there is no index to navigate,
 * since the help worth reading is the help about what is already on screen.
 */
export default function DiscoveryHelpDrawer({ view }: { view: DiscoveryHelpView }) {
  const [open, setOpen] = useState(false);
  const cards = DISCOVERY_HELP[view] ?? [];
  if (!cards.length) return null;

  return <>
    <Button
      size="small"
      variant="text"
      startIcon={<HelpOutlineIcon />}
      onClick={() => setOpen(true)}
      sx={{ textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}
    >
      Help
    </Button>

    <Drawer
      anchor="right"
      open={open}
      onClose={() => setOpen(false)}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 440 }, maxWidth: '100%' } } }}
    >
      <Stack sx={{ height: '100%' }}>
        <Stack
          direction="row" alignItems="center" justifyContent="space-between"
          sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>How to fill this in</Typography>
          <IconButton onClick={() => setOpen(false)} aria-label="Close help" size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Stack gap={3} sx={{ px: 2.5, py: 2.5, overflowY: 'auto', flex: 1 }}>
          {cards.map((card, index) => <Box key={card.name}>
            {index > 0 && <Divider sx={{ mb: 3 }} />}
            <Card card={card} />
          </Box>)}

          <Divider />

          <Typography variant="body2" color="text.secondary">
            Why any of this is true, and how search and recommendations actually work:{' '}
            <Link href={DISCOVERY_GUIDE_HREF ?? '#'} target="_blank" rel="noopener" underline="hover">
              open the admin guide
            </Link>.
          </Typography>
        </Stack>
      </Stack>
    </Drawer>
  </>;
}
