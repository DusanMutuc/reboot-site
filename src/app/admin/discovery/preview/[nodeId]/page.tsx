'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Alert, Button, Container, Divider, Skeleton, Stack, Typography } from '@mui/material';
import { BlockRenderer, type RenderableBlock, type RenderableResource } from '@/components/course/BlockRenderer';
import { readDiscoveryResponse } from '@/lib/discoveryAdminClient';

type NodeSummary = { id: number; title: string; node_type: string; state: string; description?: string | null };
type Preview = { node: NodeSummary; blocks: RenderableBlock[]; resources: Record<number, RenderableResource>; parents: NodeSummary[]; children: NodeSummary[] };

export default function DiscoveryLearningPreview() {
  const { nodeId } = useParams<{ nodeId: string }>();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null); setError(null);
    void fetch(`/api/admin/discovery/preview?nodeId=${encodeURIComponent(nodeId)}`, { signal: controller.signal })
      .then(response => readDiscoveryResponse<Preview>(response))
      .then(data => { if (!controller.signal.aborted) setPreview(data); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [nodeId, retry]);
  const nodeLink = (node: NodeSummary) => <Button key={node.id} component="a" href={`/admin/discovery/preview/${node.id}`}
    sx={{ justifyContent: 'flex-start', textAlign: 'left' }}>{node.title} · {node.node_type} · {node.state}</Button>;
  return <Container maxWidth="md" sx={{ py: 4 }}><Stack spacing={3}>
    <Typography variant="h5" component="h1">Learning content preview</Typography>
    <Alert severity="info">Read-only admin preview. Drafts and restricted material may be visible here. This does not publish anything, grant member access, or record learning completion.</Alert>
    {error && <Alert severity="error" action={<Button onClick={() => setRetry(value => value + 1)}>Retry</Button>}>{error}</Alert>}
    {!preview && !error && <Skeleton variant="rectangular" height={240} />}
    {preview && <>
      {!!preview.parents.length && <Stack><Typography variant="subtitle2">Containing guide / course</Typography>{preview.parents.map(nodeLink)}</Stack>}
      <Stack spacing={1}>
        <Typography variant="h4" component="h2">{preview.node.title}</Typography>
        <Typography color="text.secondary">{preview.node.node_type} · {preview.node.state}</Typography>
        {preview.node.description && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{preview.node.description}</Typography>}
      </Stack>
      <Divider />
      {preview.blocks.map(block => <BlockRenderer key={block.id} block={block}
        resource={block.resource_id ? preview.resources[block.resource_id] ?? null : null} previewMode />)}
      {!preview.blocks.length && <Typography color="text.secondary">No blocks on this item. Check the sections below for its learning material.</Typography>}
      {!!preview.children.length && <Stack><Typography variant="subtitle2">Sections in this item</Typography>{preview.children.map(nodeLink)}</Stack>}
    </>}
  </Stack></Container>;
}
