'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Container, Skeleton, Stack, Typography } from '@mui/material';
import { useParams } from 'next/navigation';
import { BlockRenderer } from '@/components/course/BlockRenderer';
import type { ContentBlock } from '@/types/course';
import type { RenderableResource } from '@/components/course/BlockRenderer';
import {
  fetchLibraryDetailData,
  type LibraryDetailNode,
  type LibraryScope,
} from './shared';

type LibraryDetailPageProps = {
  scope: LibraryScope;
};

export default function LibraryDetailPage({ scope }: LibraryDetailPageProps) {
  const params = useParams<{ slugParts?: string[] }>();
  const slug = params.slugParts?.[params.slugParts.length - 1] ?? null;

  const [loading, setLoading] = useState(true);
  const [node, setNode] = useState<LibraryDetailNode | null>(null);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [resources, setResources] = useState<Record<number, RenderableResource>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, [slug]);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      if (!slug) {
        if (!cancelled) {
          setNode(null);
          setBlocks([]);
          setResources({});
          setError('Missing library item');
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const data = await fetchLibraryDetailData(scope, slug);
        if (!cancelled) {
          setNode(data.node);
          setBlocks(data.blocks);
          setResources(data.resources);
        }
      } catch (loadError: unknown) {
        const message = loadError instanceof Error ? loadError.message : 'Failed to load';
        if (!cancelled) {
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [scope, slug]);

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
          const resource = block.resource_id ? resources[block.resource_id] ?? null : null;
          return <BlockRenderer key={block.id} block={block} resource={resource} previewMode />;
        })}
      </Stack>
    );
  }, [blocks, error, loading, resources]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>
      <Box
        sx={{
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
          py: { xs: 4, md: 5 },
        }}
      >
        <Container maxWidth="md">
          {!loading ? (
            <>
              <Typography
                variant="h3"
                component="h1"
                sx={{ fontWeight: 700, mb: 1.5, fontSize: { xs: '2rem', md: '2.5rem' } }}
              >
                {node?.title ?? 'Untitled'}
              </Typography>
              {node?.description ? (
                <Typography
                  variant="body1"
                  color="text.secondary"
                  sx={{ fontSize: '1.125rem', lineHeight: 1.6 }}
                >
                  {node.description}
                </Typography>
              ) : null}
            </>
          ) : (
            <>
              <Skeleton variant="text" width="65%" height={56} sx={{ mb: 1.5 }} />
              <Skeleton variant="text" width="45%" height={32} />
            </>
          )}
        </Container>
      </Box>

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
