'use client';

import { Card, CardContent, Stack, Typography } from '@mui/material';
import type { ContentBlock } from '@/types/course';
import { BlockRenderer } from '@/components/course/BlockRenderer';
import type { RenderableResource } from '@/components/course/BlockRenderer';

export type BlockShellProps = {
  block: ContentBlock;
  resource: RenderableResource | null;
  isSelected: boolean;
  onSelect: (block: ContentBlock) => void;
};

export default function BlockShell({ block, resource, isSelected, onSelect }: BlockShellProps) {
  return (
    <Card
      variant={isSelected ? 'outlined' : undefined}
      sx={{
        borderColor: isSelected ? 'primary.main' : undefined,
        cursor: 'pointer',
      }}
      onClick={() => onSelect(block)}
    >
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2">Block {block.position + 1}</Typography>
            <Typography variant="caption" color="text.secondary">
              {block.block_type}
            </Typography>
          </Stack>
          <BlockRenderer block={block} resource={resource} />
        </Stack>
      </CardContent>
    </Card>
  );
}
