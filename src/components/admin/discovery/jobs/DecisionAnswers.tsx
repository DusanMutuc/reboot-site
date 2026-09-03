'use client';

import { Box, Button, Stack, Tooltip, Typography } from '@mui/material';

/**
 * The two answers to a discovery question, and skip.
 *
 * Both answers carry EQUAL VISUAL WEIGHT in every state — rest, hover, focus and pressed. The
 * moment one is a filled button and the other an outline, admins over-choose the filled one to
 * avoid appearing to give up, and the recorded data stops meaning what it says. Hover therefore
 * deepens both identically instead of filling either.
 *
 * Skip is a different category: left-aligned, quieter, worded as time rather than as an answer.
 * It never joins the answer group and never records anything.
 */
export type AnswerOption = {
  value: string;
  label: string;
  /** Shown as the keyboard hint. `1` is the change, `2` keeps the current state. */
  shortcut: '1' | '2';
  /** When set, the answer cannot be committed yet and the reason is offered on hover. */
  blockedReason?: string;
  /**
   * What this answer does, on hover. Both answers record a decision and both remove the item from
   * the queue, which is not something either label can carry on its own.
   */
  hint?: string;
};

const answerSx = {
  flex: '0 0 auto',
  borderWidth: 1.5,
  borderColor: 'primary.main',
  bgcolor: 'action.hover',
  color: 'primary.dark',
  fontWeight: 600,
  textTransform: 'none',
  px: 2,
  py: 0.9,
  '&:hover': { borderWidth: 1.5, borderColor: 'primary.dark', bgcolor: 'action.selected' },
  '&:active': { borderWidth: 1.5, borderColor: 'primary.dark', bgcolor: 'action.selected' },
  '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
  '&.Mui-disabled': { borderWidth: 1.5, borderStyle: 'solid' },
} as const;

export default function DecisionAnswers({
  answers, onAnswer, onSkip, busy = false, skipLabel = 'Skip for now', trailing,
  skipHint = 'Nothing is saved. This item comes back next time.', compact = false,
}: {
  answers: [AnswerOption, AnswerOption];
  onAnswer: (value: string) => void;
  onSkip?: () => void;
  busy?: boolean;
  skipLabel?: string;
  trailing?: React.ReactNode;
  skipHint?: string;
  /**
   * For narrow panels: the two answers share the row evenly and the keyboard hints disappear.
   * The hints belong to the queue screens, which own the key handler — showing them in a builder
   * sidebar promised a shortcut that does nothing there.
   */
  compact?: boolean;
}) {
  return (
    <Stack direction="row" alignItems="center"
      justifyContent={compact ? 'flex-start' : 'space-between'} gap={compact ? 1 : 2}
      flexWrap="wrap" useFlexGap>
      <Stack direction="row" alignItems="center" gap={1}>
        {onSkip && (
          <Tooltip title={skipHint}>
            <Button
              size="small" disabled={busy} onClick={onSkip}
              sx={{ textTransform: 'none', color: 'text.secondary', fontWeight: 500,
                '&:hover': { bgcolor: 'action.hover', color: 'text.primary' } }}
            >
              {skipLabel}
              <Box component="span" sx={{ ml: 0.9, px: 0.5, borderRadius: 0.5, border: '1px solid',
                borderColor: 'divider', fontSize: 10, fontFamily: 'monospace' }}>S</Box>
            </Button>
          </Tooltip>
        )}
        {trailing}
      </Stack>

      <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap
        sx={compact ? { flex: 1, '& > *': { flex: 1 } } : undefined}>
        {answers.map((answer) => {
          const button = (
            <Button
              key={answer.value}
              variant="outlined"
              disabled={busy || !!answer.blockedReason}
              onClick={() => onAnswer(answer.value)}
              sx={compact ? { ...answerSx, px: 1.25, fontSize: 13 } : answerSx}
            >
              {answer.label}
              {!compact && (
                <Box component="span" sx={{ ml: 1, px: 0.5, borderRadius: 0.5, border: '1px solid currentColor',
                  opacity: 0.6, fontSize: 10, fontFamily: 'monospace' }}>{answer.shortcut}</Box>
              )}
            </Button>
          );
          // A disabled control gives no reason on its own, so the reason travels with it. An
          // enabled one still carries what it will do, which no two-word label can say.
          const title = answer.blockedReason ?? answer.hint;
          return title
            ? <Tooltip key={answer.value} title={title}><span>{button}</span></Tooltip>
            : button;
        })}
      </Stack>
    </Stack>
  );
}

/** Says what each answer will do, in the job's own words, before it is chosen. */
export function AnswerConsequences({ lines }: { lines: [string, string][] }) {
  return (
    <Box sx={{ p: 1.75, borderRadius: 1.5, bgcolor: 'action.hover', borderLeft: '3px solid', borderColor: 'primary.main' }}>
      {lines.map(([label, body]) => (
        <Typography key={label} variant="body2" sx={{ lineHeight: 1.6, mb: 0.5 }}>
          <strong>{label}</strong> — {body}
        </Typography>
      ))}
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1, mb: 0 }}>
        Skipping saves nothing — the item comes back next time.
      </Typography>
    </Box>
  );
}
