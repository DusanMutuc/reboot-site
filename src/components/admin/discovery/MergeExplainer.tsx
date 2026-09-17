'use client';

import { Alert, Box, Stack, Typography } from '@mui/material';

/**
 * Merging is the one action here an admin cannot reason about from the control alone, so it
 * spells out the three things they actually want to know: what happens to the tagged content,
 * whether the old word stops working in search (it does not), and how reversible it is.
 */
export default function MergeExplainer({ sourceName, targetName, plural = false }: {
  sourceName?: string | null;
  targetName?: string | null;
  plural?: boolean;
}) {
  const source = sourceName ? `“${sourceName}”` : plural ? 'these terms' : 'the old term';
  const target = targetName ? `“${targetName}”` : 'the term you keep';

  const points: Array<[string, string]> = [
    [
      'The content keeps its tags',
      `Everything tagged ${source} becomes tagged ${target} instead. Nothing loses a tag, and nothing is deleted.`,
    ],
    [
      'Search still finds the old word',
      `A member searching ${source} can still find the tagged content. ${plural ? 'The old terms become synonyms' : 'The old term becomes a synonym'} of ${target}, but no longer ${plural ? 'appear' : 'appears'} in the topic picker. New content uses ${target}.`,
    ],
    [
      'Existing synonyms come along',
      `Anything already pointing at ${source} will point at ${target} afterwards.`,
    ],
  ];

  return <Stack spacing={1.5}>
    <Stack spacing={1.25}>
      {points.map(([heading, body]) => (
        <Box key={heading}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{heading}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>{body}</Typography>
        </Box>
      ))}
    </Stack>
    <Alert severity="warning">
      There is no undo button. Reversing this means recreating the term and re-tagging by hand.
    </Alert>
  </Stack>;
}
