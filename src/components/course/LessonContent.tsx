'use client';

import { useMemo } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { BlockRenderer } from './BlockRenderer';

import type { NodeSubtree, NodeType } from '@/types/course';

const TYPE_LABELS: Record<NodeType, { heading: string; empty: string }> = {
  course: {
    heading: 'Course overview',
    empty: 'This course does not have any blocks yet.',
  },
  lesson: {
    heading: 'Lesson',
    empty: 'This lesson does not contain any blocks yet.',
  },
  chapter: {
    heading: 'Chapter',
    empty: 'This chapter does not contain any blocks yet.',
  },
  collection: {
    heading: 'Collection',
    empty: 'This collection does not contain any blocks yet.',
  },
  playlist: {
    heading: 'Playlist',
    empty: 'This playlist does not contain any blocks yet.',
  },
};

type LessonContentProps = {
  lesson: NodeSubtree | null;
  locked?: boolean;
  lockReason?: string | null;
};

function toRenderableBlock(block: NodeSubtree['blocks'][number]) {
  return {
    id: block.id,
    block_type: block.block_type,
    position: block.position,
    text_md: block.text_md,
    resource_id: block.resource_id,
    smart_doc_id: block.smart_doc_id,
    start_ms: block.start_ms,
    end_ms: block.end_ms,
    label: block.label,
  } as const;
}

export function LessonContent({ lesson, locked = false, lockReason = null }: LessonContentProps) {
  const type: NodeType = lesson?.node.node_type ?? 'lesson';
  const copy = TYPE_LABELS[type];

  const sortedBlocks = useMemo(() => {
    if (!lesson) {
      return [];
    }

    return [...lesson.blocks].sort((a, b) => a.position - b.position).map(toRenderableBlock);
  }, [lesson]);

  if (!lesson) {
    return (
      <Box>
        <Typography variant="h5" gutterBottom>
          Select an item to begin
        </Typography>
        <Typography color="text.secondary">Pick an item from the course tree to view its content.</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="overline" color="text.secondary">
          {copy.heading}
        </Typography>
        <Typography variant="h4" component="h1">
          {lesson.node.title || 'Untitled node'}
        </Typography>
      </Stack>

      {locked && (
        <Alert severity="info">{lockReason || 'This content is currently locked.'}</Alert>
      )}

      {sortedBlocks.length === 0 ? (
        <Alert severity="info">{copy.empty}</Alert>
      ) : (
        <Stack spacing={3}>
          {sortedBlocks.map((block) => (
            <BlockRenderer key={block.id} block={block} resource={null} previewMode />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

export default LessonContent;
