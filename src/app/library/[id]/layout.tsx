'use client';

import { useEffect, useState, useCallback, memo } from 'react';
import { Box, Stack, Typography, IconButton, Tooltip } from '@mui/material';
import BookIcon from '@mui/icons-material/Book';
import GridViewIcon from '@mui/icons-material/GridView';
import ImageIcon from '@mui/icons-material/Image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type SidebarItem = {
  id: number;
  title: string | null;
  description?: string | null;
  hero_image?: string | null; // public URL
  node_type: string;
};

const BUCKET = 'course-heroes';
function toPublicUrl(keyOrUrl?: string | null) {
  if (!keyOrUrl) return null;
  if (/^https?:\/\//i.test(keyOrUrl)) return keyOrUrl;
  return supabase.storage.from(BUCKET).getPublicUrl(keyOrUrl.replace(/^\/+/, '')).data.publicUrl ?? null;
}

const LibrarySidebar = memo(function LibrarySidebar({
  items,
  selectedId,
  onOpenItem,
}: {
  items: SidebarItem[];
  selectedId: number | null;
  onOpenItem: (id: number) => void;
}) {
  return (
    <Box
      sx={{
        width: 360, // wider sidebar
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <BookIcon sx={{ color: 'primary.main', fontSize: 32 }} />
            <Typography variant="h6" fontWeight={700}>Library</Typography>
          </Box>
          <Tooltip title="Back to grid view">
            <IconButton size="medium" component={Link} href="/library">
              <GridViewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        <Stack spacing={1.25}>
          {items.map((item) => {
            const isSelected = item.id === selectedId;
            return (
              <Box
                key={item.id}
                onClick={() => onOpenItem(item.id)}
                sx={{
                  display: 'flex',
                  gap: 2,
                  p: 2,
                  borderRadius: 2.5,
                  border: 1,
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  bgcolor: isSelected ? 'primary.50' : 'background.paper',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: isSelected ? 'primary.main' : 'grey.400',
                    bgcolor: isSelected ? 'primary.50' : 'grey.50',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 96,
                    height: 64,
                    borderRadius: 1.25,
                    bgcolor: 'grey.200',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {item.hero_image ? (
                    <img
                      src={item.hero_image}
                      alt={item.title || ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ImageIcon sx={{ color: 'grey.400', fontSize: 28 }} />
                    </Box>
                  )}
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: 14,
                      fontWeight: 600,
                      lineHeight: 1.25,
                      color: isSelected ? 'primary.main' : 'text.primary',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'normal',
                      minHeight: '2.5em', // ensures consistent height for up to 2 lines
                    }}
                  >
                    {item.title || 'Untitled item'}
                  </Typography>
                  {/* subtitle removed per request */}
                </Box>
              </Box>
            );
          })}
        </Stack>
      </Box>
    </Box>
  );
});

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // derive selected id from /library/123
  const selectedId = (() => {
    const m = pathname?.match(/\/library\/(\d+)/);
    return m ? Number(m[1]) : null;
  })();

  const [rootId, setRootId] = useState<number | null>(null);
  const [items, setItems] = useState<SidebarItem[]>([]);

  // Resolve Library root once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let root: number | null = null;

      const { data: ss } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'library_root_id')
        .maybeSingle();
      if (ss?.value && !Number.isNaN(Number(ss.value))) root = Number(ss.value);

      if (!root) {
        const { data: libSlug } = await supabase
          .from('content_nodes')
          .select('id')
          .eq('slug', 'library')
          .maybeSingle();
        if (libSlug?.id) root = libSlug.id;
      }

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

      if (!cancelled && root) setRootId(root);
    })();
    return () => { cancelled = true; };
  }, []);

  // Load children once (when root known). This state persists across route changes.
  useEffect(() => {
    if (!rootId) return;
    let cancelled = false;

    (async () => {
      const { data: links, error: linkErr } = await supabase
        .from('node_children')
        .select('child_id, position')
        .eq('parent_id', rootId)
        .order('position', { ascending: true });
      if (linkErr) return;

      const childIds = (links ?? []).map(l => l.child_id);
      if (!childIds.length) {
        if (!cancelled) setItems([]);
        return;
      }

      const { data: nodes, error: nodeErr } = await supabase
        .from('content_nodes')
        .select('id, title, description, node_type, hero_image')
        .in('id', childIds);
      if (nodeErr) return;

      const map = new Map<number, SidebarItem>();
      (nodes ?? []).forEach(n => {
        map.set(n.id as number, {
          ...n,
          hero_image: toPublicUrl(n.hero_image) ?? undefined,
        } as SidebarItem);
      });

      const stitched = (links ?? []).map(l => map.get(l.child_id)!).filter(Boolean);
      if (!cancelled) setItems(stitched);
    })();

    return () => { cancelled = true; };
  }, [rootId]);

  const openItem = useCallback((id: number) => {
    if (selectedId !== id) router.push(`/library/${id}`);
  }, [router, selectedId]);

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'grey.50' }}>
      <LibrarySidebar items={items} selectedId={selectedId} onOpenItem={openItem} />
      <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: 'grey.100' }}>
        {children}
      </Box>
    </Box>
  );
}
