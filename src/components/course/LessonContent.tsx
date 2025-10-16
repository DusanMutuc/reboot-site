'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, CircularProgress, Stack, Typography } from '@mui/material';

import type { ContentBlock, NodeSubtree } from '@/types/course';
import { BlockRenderer, type RenderableBlock, type RenderableResource } from '@/components/course/BlockRenderer';
import { supabase } from '@/lib/supabaseClient';

type LessonContentProps = {
  lesson: NodeSubtree | null;
  loading: boolean;
  error?: string | null;
};

type ResourceState = 'idle' | 'loading' | 'ready' | 'error';

function getContentLabels(node: NodeSubtree | null) {
  const type = node?.node.node_type;
  if (type === 'chapter') {
    return { title: 'Chapter', lower: 'chapter' };
  }
  if (type === 'lesson') {
    return { title: 'Lesson', lower: 'lesson' };
  }
  return { title: 'Item', lower: 'item' };
}

function toRenderableBlock(block: ContentBlock): RenderableBlock {
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
  };
}

export default function LessonContent({ lesson, loading, error }: LessonContentProps) {
  const [resources, setResources] = useState<Record<number, RenderableResource>>({});
  const [resourceState, setResourceState] = useState<ResourceState>('idle');
  const [resourceError, setResourceError] = useState<string | null>(null);

  const labels = getContentLabels(lesson);

  const assetBlockIds = useMemo(() => {
    if (!lesson) return [] as number[];
    return lesson.blocks
      .filter((block) => block.block_type === 'asset' && block.resource_id)
      .map((block) => block.resource_id!)
      .filter((id, index, arr) => arr.indexOf(id) === index);
  }, [lesson]);

  useEffect(() => {
    if (!lesson || assetBlockIds.length === 0) {
      setResources({});
      setResourceState('idle');
      setResourceError(null);
      return;
    }

    let active = true;
    setResourceState('loading');
    setResourceError(null);

    (async () => {
      const { data, error: resError } = await supabase
        .from('resources')
        .select('id, title, type, url, thumbnail, duration')
        .in('id', assetBlockIds);

      if (!active) return;

      if (resError) {
        setResourceState('error');
        setResourceError(resError.message ?? 'Failed to load resources');
        setResources({});
        return;
      }

      const map: Record<number, RenderableResource> = {};
      for (const row of data ?? []) {
        map[row.id] = {
          id: row.id,
          title: row.title,
          type: row.type,
          url: row.url,
          thumbnail: row.thumbnail,
          duration: row.duration,
        };
      }
      setResources(map);
      setResourceState('ready');
    })();

    return () => {
      active = false;
    };
  }, [assetBlockIds, lesson]);

  if (loading) {
    return (
      <Stack alignItems="center" spacing={2} sx={{ py: 10 }}>
        <CircularProgress />
        <Typography color="text.secondary">Loading {labels.lower}…</Typography>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack spacing={2} sx={{ py: 6 }}>
        <Alert severity="error">{error}</Alert>
      </Stack>
    );
  }

  if (!lesson) {
    return (
      <Stack alignItems="center" spacing={2} sx={{ py: 10 }}>
        <Typography variant="h6">Select a chapter or lesson to get started</Typography>
        <Typography color="text.secondary" align="center">
          Choose an unlocked chapter or lesson from the outline to explore its content.
        </Typography>
      </Stack>
    );
  }

  const blocks = lesson.blocks.map(toRenderableBlock).sort((a, b) => a.position - b.position);
  const showResourceAlert = resourceState === 'error' && resourceError;

  return (
    <Box sx={{ py: { xs: 4, md: 6 } }}>
      <Stack spacing={3} sx={{ maxWidth: 860, mx: 'auto', px: { xs: 2, md: 4 } }}>
        <Box>
          <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 600 }}>
            {labels.title}
          </Typography>
          <Typography variant="h3" sx={{ fontWeight: 700 }}>
            {lesson.node.title ?? `Untitled ${labels.lower}`}
          </Typography>
          {lesson.node.description ? (
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {lesson.node.description}
            </Typography>
          ) : null}
        </Box>

        {blocks.length === 0 ? (
          <Alert severity="info">This {labels.lower} doesn’t have any blocks yet.</Alert>
        ) : (
          <Stack spacing={3}>
            {blocks.map((block) => {
              const resource = block.resource_id ? resources[block.resource_id] ?? null : null;
              return <BlockRenderer key={block.id} block={block} resource={resource} previewMode />;
            })}
          </Stack>
        )}

        {resourceState === 'loading' ? (
          <Typography variant="body2" color="text.secondary">
            Loading media resources…
          </Typography>
        ) : null}

        {showResourceAlert ? <Alert severity="warning">{resourceError}</Alert> : null}
      </Stack>
    </Box>
  );
}
