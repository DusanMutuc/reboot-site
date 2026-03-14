'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Stack, Typography, Alert, Skeleton, Container } from '@mui/material';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import type { ContentBlock } from '@/types/course';
import type { RenderableResource } from '@/components/course/BlockRenderer';
import { BlockRenderer } from '@/components/course/BlockRenderer';

type NodeRow = { id: number; slug: string | null; title: string | null; description?: string | null };

const BASE_PATH = '/assistant-library';

export default function AssistantLibraryDetailPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();

  const [loading, setLoading] = useState(true);
  const [node, setNode] = useState<NodeRow | null>(null);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [resources, setResources] = useState<Record<number, RenderableResource>>({});
  const [error, setError] = useState<string | null>(null);

  // If someone hits /assistant-library/123, redirect to its slug
  useEffect(() => {
    (async () => {
      if (!slug) return;
      if (/^\d+$/.test(slug)) {
        const id = Number(slug);
        const { data } = await supabase.from('content_nodes').select('slug').eq('id', id).maybeSingle();
        if (data?.slug) router.replace(`${BASE_PATH}/${data.slug}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) return;
      setLoading(true);
      setError(null);
      try {
        // 1) fetch node by slug
        const { data: nodeRow, error: nErr } = await supabase
          .from('content_nodes')
          .select('id,slug,title,description')
          .eq('slug', slug)
          .maybeSingle();
        if (nErr) throw nErr;
        if (!nodeRow) throw new Error('Not found');

        // 2) blocks for this node id
        const nodeId = nodeRow.id as number;
        const { data: blockRows, error: bErr } = await supabase
          .from('content_blocks')
          .select(
            'id, node_id, position, block_type, text_md, resource_id, smart_doc_id, start_ms, end_ms, label, settings'
          )
          .eq('node_id', nodeId)
          .order('position', { ascending: true });
        if (bErr) throw bErr;

        // 3) gather resources
        const resourceIds = Array.from(
          new Set((blockRows ?? []).map((b) => b.resource_id).filter(Boolean) as number[])
        );
        let resourceMap: Record<number, RenderableResource> = {};
        if (resourceIds.length) {
          const { data: resRows, error: rErr } = await supabase
            .from('resources')
            .select('id,title,type,url,thumbnail,duration')
            .in('id', resourceIds);
          if (rErr) throw rErr;
          resourceMap = Object.fromEntries((resRows ?? []).map((r) => [r.id, r as unknown as RenderableResource]));
        }

        if (!cancelled) {
          setNode(nodeRow as NodeRow);
          setBlocks((blockRows ?? []) as ContentBlock[]);
          setResources(resourceMap);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to load';
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <Stack spacing={3}>
          <Skeleton variant="text" width="80%" height={28} />
          <Skeleton variant="text" width="70%" height={20} />
          <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 2, mt: 1 }} />
          <Skeleton variant="text" width="75%" height={20} />
          <Skeleton variant="text" width="80%" height={20} />
          <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 2 }} />
        </Stack>
      );
    }
    if (error) {
      return (
        <Alert severity="error" sx={{ my: 2 }}>
          {error}
        </Alert>
      );
    }
    return (
      <Stack spacing={4}>
        {blocks.map((block) => {
          const res = block.resource_id ? resources[block.resource_id] ?? null : null;
          return <BlockRenderer key={block.id} block={block} resource={res} previewMode />;
        })}
      </Stack>
    );
  }, [loading, error, blocks, resources]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>
      {/* Header */}
      <Box sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', py: { xs: 4, md: 5 } }}>
        <Container maxWidth="md">
          {!loading ? (
            <>
              <Typography variant="h3" component="h1" sx={{ fontWeight: 700, mb: 1.5, fontSize: { xs: '2rem', md: '2.5rem' } }}>
                {node?.title ?? 'Untitled'}
              </Typography>
              {node?.description && (
                <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.125rem', lineHeight: 1.6 }}>
                  {node.description}
                </Typography>
              )}
            </>
          ) : (
            <>
              <Skeleton variant="text" width="65%" height={56} sx={{ mb: 1.5 }} />
              <Skeleton variant="text" width="45%" height={32} />
            </>
          )}
        </Container>
      </Box>

      {/* Content */}
      <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
        <Box
          sx={{
            bgcolor: 'background.paper',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            p: { xs: 3, md: 5 },
            minHeight: 400,
          }}
        >
          {content}
        </Box>
      </Container>
    </Box>
  );
}
