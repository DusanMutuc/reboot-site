'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Container,
  Stack,
  Typography,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  Alert,
  IconButton,
  Skeleton,
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

// --- visuals/parity helpers (mirrors CoursesLanding) ---
function clampLines(lines: number) {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  };
}

function SkeletonCard() {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'grey.200',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
        <Skeleton variant="rectangular" width="100%" height="100%" />
      </Box>
      <Box sx={{ p: 2.5 }}>
        <Skeleton variant="text" sx={{ fontSize: '1.25rem', width: '80%' }} />
        <Skeleton variant="text" sx={{ width: '60%' }} />
      </Box>
    </Card>
  );
}

/** Convert DB hero value → usable <Image src>
 *  - If it's already a full URL, return it unchanged.
 *  - If it's a storage path, build a public URL from the "course-heroes" bucket.
 */
function resolveHeroSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(v.replace(/^\/+/, ''));
  return data?.publicUrl ?? null;
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

  const gridContent = useMemo(() => {
    if (loading) {
      return (
        <Grid container spacing={3}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
              <SkeletonCard />
            </Grid>
          ))}
        </Grid>
      );
    }
    if (error) {
      return (
        <Stack alignItems="center" spacing={2} sx={{ py: 8 }}>
          <Alert severity="error">{error}</Alert>
        </Stack>
      );
    }
    if (items.length === 0) {
      return (
        <Stack alignItems="center" spacing={2} sx={{ py: 8 }}>
          <Typography variant="h6">No items in the Library yet</Typography>
          <Typography color="text.secondary" align="center">
            Add resources or connect content to this collection to see them here.
          </Typography>
        </Stack>
      );
    }

    return (
      <Grid container spacing={3}>
        {items.map(({ child }) => {
          const heroSrc = resolveHeroSrc(child.hero_image ?? null);
          const href = `/library/${child.id}`;
          return (
            <Grid key={child.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <Card
                elevation={0}
                sx={{
                  height: '100%',
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'grey.200',
                  bgcolor: 'background.paper',
                  overflow: 'hidden',
                  transition: 'transform .25s ease, box-shadow .25s ease',
                  '&:hover': { transform: 'translateY(-4px)', boxShadow: 6 },
                }}
              >
                <CardActionArea
                  LinkComponent={Link}
                  href={href}
                  sx={{ alignItems: 'stretch' }}
                  aria-label={`Open ${child.title ?? 'item'}`}
                >
                  {/* Hero image (fixed 16:9) */}
                  <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
                    {heroSrc ? (
                      <Image
                        src={heroSrc}
                        alt=""
                        fill
                        sizes="(max-width: 600px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        style={{ objectFit: 'cover' }}
                      />
                    ) : (
                      <Box
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        }}
                      />
                    )}
                    {/* top fade overlay */}
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to top, rgba(0,0,0,.22), rgba(0,0,0,0))',
                      }}
                    />
                  </Box>

                  <CardContent sx={{ display: 'grid', gap: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, ...clampLines(2) }}>
                      {child.title || 'Untitled'}
                    </Typography>
                    {(child.description || child.node_type) && (
                      <Typography variant="body2" color="text.secondary" sx={clampLines(2)}>
                        {(child.node_type === 'chapter' ? 'Section' : 'Page') +
                          (child.description ? ` · ${child.description}` : '')}
                      </Typography>
                    )}
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
    <Box sx={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #f8f9fa 0%, #e9f5f2 100%)' }}>
      {/* Sticky translucent header — matches CoursesLanding */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backdropFilter: 'saturate(180%) blur(8px)',
          backgroundColor: 'rgba(255,255,255,0.75)',
          borderBottom: '1px solid',
          borderColor: 'grey.100',
        }}
      >
        <Container maxWidth="lg" sx={{ py: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <IconButton LinkComponent={Link} href="/dashboard" aria-label="Back to Home" size="medium">
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Library
            </Typography>
          </Stack>
        </Container>
      </Box>

      {/* Content */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        {gridContent}
      </Container>
    </Box>
  );
}
