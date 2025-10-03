'use client';

import { CSS } from '@dnd-kit/utilities';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { ContentBlock } from '@/types/course';
import type { RenderableResource } from '@/components/course/BlockRenderer';
import type { ReactNode } from 'react';

export type BlockShellProps = {
  block: ContentBlock;
  resource: RenderableResource | null;
  isSelected: boolean;
  isEditing: boolean;
  previewMode?: boolean;
  onSelect: (block: ContentBlock) => void;
  listeners?: Record<string, unknown>;
  attributes?: DraggableAttributes;
  setNodeRef?: (element: HTMLElement | null) => void;
  transform?: { x: number; y: number; scaleX: number; scaleY: number } | null;
  transition?: string | null;
  isDragging?: boolean;
  children: ReactNode;
};

export default function BlockShell({
  block,
  resource,
  isSelected,
  isEditing,
  previewMode = false,
  onSelect,
  listeners,
  attributes,
  setNodeRef,
  transform,
  transition,
  isDragging,
  children,
}: BlockShellProps) {
  const style = {
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition: transition ?? undefined,
  } as const;

  return (
    <Card
      className="block-shell"
      ref={setNodeRef}
      {...attributes}
      sx={{
        position: 'relative',
        borderColor: isSelected ? 'primary.main' : 'divider',
        backgroundColor: isEditing ? 'action.hover' : undefined,
        cursor: previewMode ? 'default' : 'pointer',
        opacity: isDragging ? 0.6 : 1,
        transition: 'border-color 0.2s ease, background-color 0.2s ease, opacity 0.2s ease',
        '&:hover .block-shell__handle': {
          opacity: previewMode || isEditing ? 0 : 1,
        },
      }}
      style={style}
      variant={isSelected ? 'outlined' : undefined}
      onClick={() => onSelect(block)}
    >
      {!previewMode && (
        <Box
          className="block-shell__handle"
          {...listeners}
          sx={{
            position: 'absolute',
            left: -32,
            top: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isSelected ? 'primary.main' : 'text.disabled',
            cursor: 'grab',
            opacity: isEditing ? 0 : 0,
            pointerEvents: isEditing ? 'none' : 'auto',
            transition: 'opacity 0.2s ease',
            pr: 1,
          }}
        >
          <DragIndicatorIcon fontSize="small" />
        </Box>
      )}
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle2">Block {block.position + 1}</Typography>
              {resource?.title ? <Chip label={resource.title} size="small" /> : null}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
              {block.block_type}
            </Typography>
          </Stack>
          <Box>{children}</Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
