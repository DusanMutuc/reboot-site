'use client';

import { CSS } from '@dnd-kit/utilities';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { alpha } from '@mui/material/styles';
import { Box, IconButton } from '@mui/material';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { ContentBlock } from '@/types/course';
import type { ReactNode } from 'react';

export type BlockShellProps = {
  block: ContentBlock;
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

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (previewMode) return;
    event.stopPropagation();
    onSelect(block);
  };

  const dragHandle = previewMode ? null : (
    <IconButton
      className="block-shell__handle"
      size="small"
      {...listeners}
      aria-label="Drag to reorder block"
      sx={{
        position: 'absolute',
        left: -40,
        top: '50%',
        transform: 'translateY(-50%)',
        opacity: isEditing || isDragging ? 0 : 0.4,
        transition: 'opacity 0.2s ease',
        cursor: 'grab',
        color: isSelected ? 'primary.main' : 'text.secondary',
        '&:hover': { opacity: 1 },
      }}
    >
      <DragIndicatorIcon fontSize="small" />
    </IconButton>
  );

  return (
    <Box
      className="block-shell"
      ref={setNodeRef}
      {...attributes}
      sx={{
        position: 'relative',
        borderRadius: 2,
        border: '1px solid',
        borderColor: isSelected ? 'primary.main' : 'transparent',
        backgroundColor: isEditing
          ? (theme) => alpha(theme.palette.primary.main, 0.06)
          : (theme) => alpha(theme.palette.background.paper, previewMode ? 0 : 1),
        cursor: previewMode ? 'default' : 'pointer',
        opacity: isDragging ? 0.6 : 1,
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
        boxShadow: isSelected ? 2 : 0,
        p: { xs: 1.5, md: 2 },
        '&:hover .block-shell__handle': {
          opacity: previewMode || isEditing ? 0 : 0.8,
        },
      }}
      style={style}
      onClick={handleClick}
    >
      {dragHandle}
      <Box>{children}</Box>
    </Box>
  );
}
