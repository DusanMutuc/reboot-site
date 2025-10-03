'use client';

import { Alert, Box, Stack, Typography } from '@mui/material';
import type { ContentBlock, NodeSubtree } from '@/types/course';
import BlockShell from './BlockShell';
import type { RenderableResource } from '@/components/course/BlockRenderer';

export type CanvasProps = {
  subtree: NodeSubtree | null;
  resources: Record<number, RenderableResource>;
  selectedBlockId: number | null;
  onSelectBlock: (block: ContentBlock) => void;
  previewMode?: boolean;
};

export default function Canvas({ subtree, resources, selectedBlockId, onSelectBlock, previewMode = false }: CanvasProps) {
  if (!subtree) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">Select a node to preview its blocks.</Typography>
      </Box>
    );
  }

  const blocks = [...subtree.blocks].sort((a, b) => a.position - b.position);
  const canEditBlocks = subtree.children.length === 0;

  return (
    <Box sx={{ p: 3, height: '100%', overflowY: 'auto' }}>
      <Stack spacing={3} sx={{ maxWidth: 900, mx: 'auto' }}>
        <Typography variant="h6">{subtree.node.title ?? 'Untitled node'}</Typography>
        {blocks.length === 0 ? (
          <Alert severity="info">This node has no blocks yet.</Alert>
        ) : (
          <Stack spacing={2}>
            {blocks.map((block) => (
              <BlockShell
                key={block.id}
                block={block}
                resource={block.resource_id ? resources[block.resource_id] ?? null : null}
                isSelected={selectedBlockId === block.id}
                onSelect={(block) => {
                  if (!previewMode) {
                    onSelectBlock(block);
                  }
                }}
              />
            ))}
          </Stack>
        )}
        {!canEditBlocks && (
          <Alert severity="info">Blocks are only available on leaf nodes.</Alert>
        )}
      </Stack>
    </Box>
  );
}
