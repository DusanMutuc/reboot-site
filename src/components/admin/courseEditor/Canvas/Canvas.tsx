'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Alert, Box, IconButton, Menu, MenuItem, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import type { UniqueIdentifier } from '@dnd-kit/core';

import type { BlockType, ContentBlock, NodeSubtree } from '@/types/course';
import BlockShell from './BlockShell';
import type { RenderableResource } from '@/components/course/BlockRenderer';
import { BlockRenderer } from '@/components/course/BlockRenderer';
import BlockDndContext from '../dnd/dndContext';
import TipTapHtmlEditor from '../text/TipTapHtmlEditor';

export type CanvasProps = {
  subtree: NodeSubtree | null;
  resources: Record<number, RenderableResource>;
  selectedBlockId: number | null;
  editingBlockId: number | null;
  previewMode?: boolean;
  onSelectBlock: (block: ContentBlock | null) => void;
  onStartEdit: (blockId: number) => void;
  onExitEdit: () => void;
  onInsertBlock: (position: number, type: BlockType) => void;
  onReorderBlocks: (blocks: ContentBlock[]) => void;
  onChangeText: (blockId: number, html: string) => void;
};

export default function Canvas({
  subtree,
  resources,
  selectedBlockId,
  editingBlockId,
  previewMode = false,
  onSelectBlock,
  onStartEdit,
  onExitEdit,
  onInsertBlock,
  onReorderBlocks,
  onChangeText,
}: CanvasProps) {
  const blocks = useMemo(() => {
    if (!subtree) return [] as ContentBlock[];
    return [...subtree.blocks].sort((a, b) => a.position - b.position);
  }, [subtree]);

  const canEditBlocks = !!subtree && subtree.children.length === 0 && !previewMode;
  const blockIds = useMemo<UniqueIdentifier[]>(() => blocks.map((block) => block.id), [blocks]);

  const [insertAnchor, setInsertAnchor] = useState<{ element: HTMLElement; position: number } | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ id: number; position: 'before' | 'after' } | null>(null);

  useEffect(() => {
    if (!selectedBlockId || editingBlockId != null || previewMode) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      const activeElement = document.activeElement;
      if (activeElement && (activeElement as HTMLElement).isContentEditable) {
        return;
      }
      const tagName = activeElement?.tagName?.toLowerCase();
      if (tagName && ['input', 'textarea', 'select', 'button'].includes(tagName)) {
        return;
      }
      const index = blocks.findIndex((block) => block.id === selectedBlockId);
      if (index === -1) return;
      event.preventDefault();
      onInsertBlock(index + 1, 'text');
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [blocks, editingBlockId, onInsertBlock, previewMode, selectedBlockId]);

  const handleOpenInsertMenu = (element: HTMLElement, position: number) => {
    if (!canEditBlocks) return;
    setInsertAnchor({ element, position });
  };

  const handleCloseInsertMenu = () => {
    setInsertAnchor(null);
  };

  const handleChooseInsert = (type: BlockType) => {
    if (!insertAnchor) return;
    onInsertBlock(insertAnchor.position, type);
    setInsertAnchor(null);
  };

  const handleDragOver = (event: { active: { id: UniqueIdentifier }; over: { id: UniqueIdentifier } | null }) => {
    if (!event.over) {
      setDropIndicator(null);
      return;
    }
    const active = Number(event.active.id);
    const over = Number(event.over.id);
    if (active === over) {
      setDropIndicator(null);
      return;
    }
    const activeIndex = blockIds.findIndex((id) => Number(id) === active);
    const overIndex = blockIds.findIndex((id) => Number(id) === over);
    if (activeIndex === -1 || overIndex === -1) {
      setDropIndicator(null);
      return;
    }
    setDropIndicator({ id: over, position: activeIndex < overIndex ? 'after' : 'before' });
  };

  const handleDragEnd = (event: { active: { id: UniqueIdentifier }; over: { id: UniqueIdentifier } | null }) => {
    setDropIndicator(null);
    if (!event.over) return;
    const active = Number(event.active.id);
    const over = Number(event.over.id);
    if (active === over) return;
    const oldIndex = blockIds.findIndex((id) => Number(id) === active);
    const newIndex = blockIds.findIndex((id) => Number(id) === over);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(blocks, oldIndex, newIndex).map((block, index) => ({
      ...block,
      position: index,
    }));
    onReorderBlocks(reordered);
  };

  const indicatorIndex = useMemo(() => {
    if (!dropIndicator) return null;
    const baseIndex = blockIds.findIndex((id) => Number(id) === dropIndicator.id);
    if (baseIndex === -1) return null;
    return dropIndicator.position === 'before' ? baseIndex : baseIndex + 1;
  }, [blockIds, dropIndicator]);

  if (!subtree) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">Select a node to preview its blocks.</Typography>
      </Box>
    );
  }

  const renderInsertAffordance = (position: number) => (
    <InsertionAffordance
      key={`insert-${position}`}
      disabled={!canEditBlocks}
      onClick={(element) => handleOpenInsertMenu(element, position)}
    />
  );

  return (
    <Box sx={{ p: 3, height: '100%', overflowY: 'auto' }}>
      <Stack spacing={3} sx={{ maxWidth: 900, mx: 'auto' }}>
        <Typography variant="h6">{subtree.node.title ?? 'Untitled node'}</Typography>
        {!previewMode && blocks.length === 0 ? (
          <Alert severity="info" sx={{ textAlign: 'center' }}>
            This lesson has no content yet. Click the + buttons to add your first block.
          </Alert>
        ) : null}
        {previewMode ? (
          <Stack spacing={3}>
            {blocks.map((block) => {
              const resource = block.resource_id ? resources[block.resource_id] ?? null : null;
              return <BlockRenderer key={block.id} block={block} resource={resource} />;
            })}
          </Stack>
        ) : (
          <BlockDndContext onDragOver={canEditBlocks ? handleDragOver : undefined} onDragEnd={canEditBlocks ? handleDragEnd : undefined}>
            <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
              <Stack
                spacing={2}
                sx={{
                  position: 'relative',
                  pl: { xs: 0, md: 4 },
                  '&:hover .canvas-insert': {
                    opacity: canEditBlocks ? 1 : 0,
                  },
                }}
              >
                {renderInsertAffordance(0)}
                {blocks.map((block, index) => {
                  const isSelected = selectedBlockId === block.id;
                  const isEditing = editingBlockId === block.id;
                  const resource = block.resource_id ? resources[block.resource_id] ?? null : null;
                  return (
                    <Fragment key={block.id}>
                      {indicatorIndex === index ? <DropIndicator /> : null}
                      <CanvasRow>
                        <SortableBlock
                          block={block}
                          disabled={!canEditBlocks}
                          isSelected={isSelected}
                          isEditing={isEditing}
                          previewMode={previewMode}
                          onSelect={() => {
                            onSelectBlock(block);
                            if (block.block_type === 'text' && canEditBlocks) {
                              onStartEdit(block.id);
                            }
                          }}
                        >
                          {block.block_type === 'text' && isEditing && canEditBlocks ? (
                            <TipTapHtmlEditor
                              value={block.text_md ?? ''}
                              onChange={(html) => onChangeText(block.id, html)}
                              onBlur={() => onExitEdit()}
                              onEscape={() => onExitEdit()}
                              autoFocus
                            />
                          ) : (
                            <BlockRenderer block={block} resource={resource} />
                          )}
                        </SortableBlock>
                      </CanvasRow>
                      {renderInsertAffordance(index + 1)}
                    </Fragment>
                  );
                })}
                {indicatorIndex === blocks.length ? <DropIndicator /> : null}
              </Stack>
            </SortableContext>
          </BlockDndContext>
        )}
        {!canEditBlocks && !previewMode && (
          <Alert severity="info">Blocks are only available on leaf nodes.</Alert>
        )}
      </Stack>
      {!previewMode && (
        <Menu anchorEl={insertAnchor?.element ?? null} open={!!insertAnchor} onClose={handleCloseInsertMenu}>
          <MenuItem onClick={() => handleChooseInsert('text')}>
            <TextFieldsIcon fontSize="small" sx={{ mr: 1 }} /> Text
          </MenuItem>
          <MenuItem onClick={() => handleChooseInsert('asset')}>
            <VideoLibraryIcon fontSize="small" sx={{ mr: 1 }} /> Resource
          </MenuItem>
          <MenuItem onClick={() => handleChooseInsert('divider')}>
            <HorizontalRuleIcon fontSize="small" sx={{ mr: 1 }} /> Divider
          </MenuItem>
        </Menu>
      )}
    </Box>
  );
}

type SortableBlockProps = {
  block: ContentBlock;
  disabled: boolean;
  isSelected: boolean;
  isEditing: boolean;
  previewMode: boolean;
  onSelect: () => void;
  children: React.ReactNode;
};

function SortableBlock({ block, disabled, isSelected, isEditing, previewMode, onSelect, children }: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled });

  return (
    <BlockShell
      block={block}
      isSelected={isSelected}
      isEditing={isEditing}
      previewMode={previewMode}
      onSelect={() => onSelect()}
      attributes={attributes}
      listeners={listeners}
      setNodeRef={setNodeRef}
      transform={transform}
      transition={transition}
      isDragging={isDragging}
    >
      {children}
    </BlockShell>
  );
}

type InsertionAffordanceProps = {
  disabled: boolean;
  onClick: (element: HTMLElement) => void;
};

function InsertionAffordance({ disabled, onClick }: InsertionAffordanceProps) {
  if (disabled) {
    return <Box sx={{ height: 0 }} />;
  }

  return (
    <Box
      className="canvas-insert"
      sx={{
        display: 'flex',
        justifyContent: 'center',
        transform: 'translateY(-8px)',
        opacity: 0,
        transition: 'opacity 0.2s ease',
      }}
    >
      <IconButton
        size="small"
        color="primary"
        onClick={(event) => {
          event.stopPropagation();
          onClick(event.currentTarget);
        }}
        sx={{
          backgroundColor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: 1,
          '&:hover': {
            backgroundColor: 'primary.main',
            color: 'primary.contrastText',
          },
        }}
      >
        <AddIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

function DropIndicator() {
  return (
    <Box sx={{ height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ height: 3, borderRadius: 999, backgroundColor: 'primary.main', width: '60%' }} />
    </Box>
  );
}

function CanvasRow({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ position: 'relative' }}>
      {children}
    </Box>
  );
}
