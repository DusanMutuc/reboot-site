'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Container,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import {
  fetchLibraryChildren,
  resolveLibraryHeroSrc,
  type LibraryChildRow,
  type LibraryScope,
} from './shared';

type LibraryCollectionPageProps = {
  basePath: string;
  scope: LibraryScope;
  title: string;
  backHref?: string;
  backLabel?: string;
  headerAccessory?: ReactNode;
};

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

export default function LibraryCollectionPage({
  basePath,
  scope,
  title,
  backHref,
  backLabel,
  headerAccessory,
}: LibraryCollectionPageProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LibraryChildRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadChildren() {
      try {
        setLoading(true);
        setError(null);
        const nextItems = await fetchLibraryChildren(scope);
        if (!cancelled) {
          setItems(nextItems);
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

    void loadChildren();

    return () => {
      cancelled = true;
    };
  }, [scope]);

  const gridContent = useMemo(() => {
    if (loading) {
      return (
        <Grid container spacing={3}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Grid key={index} size={{ xs: 12, sm: 6, md: 4 }}>
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
          const heroSrc = resolveLibraryHeroSrc(child.hero_image ?? null);
          const href = `${basePath}/${child.slug || child.id}`;

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
                          (child.description ? ` - ${child.description}` : '')}
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
  }, [basePath, error, items, loading]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(to bottom right, #f8f9fa 0%, #e9f5f2 100%)',
      }}
    >
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
            {backHref ? (
              <IconButton
                LinkComponent={Link}
                href={backHref}
                aria-label={backLabel ?? `Back to ${title}`}
                size="medium"
              >
                <ArrowBackIosNewIcon />
              </IconButton>
            ) : null}
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {title}
            </Typography>
            {headerAccessory}
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 8 }}>
        {gridContent}
      </Container>
    </Box>
  );
}
