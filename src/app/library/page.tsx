'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
    Box, Container, Paper, Stack, Typography, Card, CardActionArea,
    CardContent, CardMedia, CircularProgress, Alert, IconButton
  } from '@mui/material';
  import Grid from '@mui/material/Grid';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { supabase } from '@/lib/supabaseClient';

type NodeRow = {
  id: number;
  title: string | null;
  description?: string | null;
  slug?: string | null;
  node_type: string;
  hero_image?: string | null; // storage key or absolute URL
};

type ChildRow = {
  child_id: number;
  position: number;
  child: NodeRow;
};

const BUCKET = 'course-heroes';

function toPublicUrl(keyOrUrl: string | null | undefined): string | null {
  if (!keyOrUrl) return null;
  if (/^https?:\/\//i.test(keyOrUrl)) return keyOrUrl;
  return supabase.storage.from(BUCKET).getPublicUrl(keyOrUrl.replace(/^\/+/, '')).data.publicUrl ?? null;
}

export default function LibraryPage() {
  const [loading, setLoading] = useState(true);
  const [rootId, setRootId] = useState<number | null>(null);
  const [items, setItems] = useState<ChildRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Resolve Library root id:
  useEffect(() => {
    let cancelled = false;
    async function resolveRoot() {
      try {
        setError(null);

        // 1) Try site_settings.library_root_id (optional)
        let root: number | null = null;
        const { data: ss } = await supabase
          .from('site_settings')
          .select('value')
          .eq('key', 'library_root_id')
          .maybeSingle();
        if (ss?.value && !Number.isNaN(Number(ss.value))) {
          root = Number(ss.value);
        }

        // 2) Fallback: content_nodes where slug = 'library'
        if (!root) {
          const { data: libSlug } = await supabase
            .from('content_nodes')
            .select('id')
            .eq('slug', 'library')
            .maybeSingle();
          if (libSlug?.id) root = libSlug.id;
        }

        // 3) Fallback: latest collection
        if (!root) {
          const { data: anyCollection } = await supabase
            .from('content_nodes')
            .select('id')
            .eq('node_type', 'collection')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (anyCollection?.id) root = anyCollection.id;
        }

        if (!root) {
          throw new Error('No Library collection found. Create one or set site_settings.library_root_id.');
        }

        if (!cancelled) setRootId(root);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void resolveRoot();
    return () => { cancelled = true; };
  }, []);

  // Load children (direct items in Library)
  useEffect(() => {
    let cancelled = false;
    async function loadChildren() {
      if (!rootId) return;
      setLoading(true);
      setError(null);
      try {
        // 1) node_children for ordering
        const { data: links, error: linkErr } = await supabase
          .from('node_children')
          .select('child_id, position')
          .eq('parent_id', rootId)
          .order('position', { ascending: true });
        if (linkErr) throw linkErr;
  
        const childIds = (links ?? []).map(l => l.child_id);
        if (childIds.length === 0) {
          if (!cancelled) setItems([]);
          return;
        }
  
        // 2) fetch the child nodes
        const { data: nodes, error: nodeErr } = await supabase
          .from('content_nodes')
          .select('id, title, description, slug, node_type, hero_image')
          .in('id', childIds);
        if (nodeErr) throw nodeErr;
  
        const nodeMap = new Map<number, NodeRow>();
        (nodes ?? []).forEach(n => nodeMap.set(n.id as number, n as unknown as NodeRow));
  
        // 3) stitch back preserving order
        const stitched: ChildRow[] = (links ?? []).map(l => ({
          child_id: l.child_id,
          position: l.position,
          child: nodeMap.get(l.child_id)!,
        })).filter(row => !!row.child);
  
        if (!cancelled) setItems(stitched);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load Library items');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadChildren();
    return () => { cancelled = true; };
  }, [rootId]);
  

  const content = useMemo(() => {
    if (loading) {
      return (
        <Stack alignItems="center" spacing={1} sx={{ py: 8 }}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary">Loading Library…</Typography>
        </Stack>
      );
    }
    if (error) {
      return (
        <Alert severity="error" sx={{ my: 3 }}>
          {error}
        </Alert>
      );
    }
    if (items.length === 0) {
      return (
        <Alert severity="info" sx={{ my: 3 }}>
          No items in the Library yet.
        </Alert>
      );
    }

    return (
      <Grid container spacing={2}>
        {items.map(({ child }) => {
          const url = toPublicUrl(child.hero_image ?? null);
          const href = `/library/${child.id}`;
          return (
            <Grid key={child.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardActionArea component={Link} href={href} sx={{ alignItems: 'stretch' }}>
                  {url ? (
                    <CardMedia
                      component="img"
                      src={url}
                      alt=""
                      loading="lazy"
                      sx={{ aspectRatio: '16 / 9', objectFit: 'cover' }}
                    />
                  ) : (
                    <Box sx={{ aspectRatio: '16 / 9', bgcolor: 'action.hover' }} />
                  )}
                  <CardContent>
                    <Typography variant="subtitle1" noWrap>
                      {child.title || 'Untitled'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {child.node_type === 'chapter' ? 'Section' : 'Page'}
                      {child.description ? ` · ${child.description}` : ''}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    );
  }, [loading, error, items]);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Top bar */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton component={Link} href="/dashboard" aria-label="Back to dashboard">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={700}>Library</Typography>
      </Stack>

      <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        {content}
      </Paper>
    </Container>
  );
}
