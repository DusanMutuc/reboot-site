'use client';

import { useEffect, useState, useCallback, memo } from 'react';
import { Box, Stack, Typography, IconButton, Tooltip } from '@mui/material';
import BookIcon from '@mui/icons-material/Book';
import GridViewIcon from '@mui/icons-material/GridView';
import ImageIcon from '@mui/icons-material/Image';
import Link from 'next/link';
import { useRouter, useSelectedLayoutSegment } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type SidebarItem = {
  id: number;
  slug: string;
  title: string | null;
  description?: string | null;
  hero_image?: string | null;
  node_type: 'lesson' | 'chapter' | string;
  state?: 'published' | 'draft' | string | null;
  children?: SidebarItem[];
};

const BUCKET = 'course-heroes';
function toPublicUrl(keyOrUrl?: string | null) {
  if (!keyOrUrl) return null;
  if (/^https?:\/\//i.test(keyOrUrl)) return keyOrUrl;
  return supabase.storage.from(BUCKET).getPublicUrl(keyOrUrl.replace(/^\/+/, '')).data.publicUrl ?? null;
}

/** Compact thumbnail */
function Thumb({ src, alt, w, h }: { src?: string | null; alt?: string; w: number; h: number }) {
  return (
    <Box sx={{ width: w, height: h, borderRadius: 1.25, bgcolor: 'grey.200', overflow: 'hidden', flexShrink: 0 }}>
      {src ? (
        <img src={src} alt={alt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ImageIcon sx={{ color: 'grey.400', fontSize: Math.max(16, Math.min(w, h) - 20) }} />
        </Box>
      )}
    </Box>
  );
}

const ChapterRow = memo(function ChapterRow({
  ch,
  selected,
  onOpen,
}: {
  ch: SidebarItem;
  selected: boolean;
  onOpen: (slug: string) => void;
}) {
  return (
    <Box
      onClick={() => onOpen(ch.slug)}
      sx={{
        display: 'flex',
        gap: 1.25,
        padding: '10px 12px',
        marginBottom: '4px',
        background: 'white',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        border: '1px solid',
        borderColor: selected ? 'rgba(0, 150, 136, 0.15)' : 'rgba(0, 0, 0, 0.06)',
        alignItems: 'center',
        bgcolor: selected ? 'rgba(0, 150, 136, 0.08)' : 'white',
        '&:hover': {
          bgcolor: selected ? 'rgba(0, 150, 136, 0.12)' : 'rgba(0, 0, 0, 0.02)',
          borderColor: selected ? 'rgba(0, 150, 136, 0.2)' : 'rgba(0, 0, 0, 0.1)',
          transform: 'translateX(2px)',
        },
        '&:last-child': { marginBottom: 0 },
      }}
    >
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: selected ? '#009688' : '#9e9e9e',
          flexShrink: 0,
          transition: 'background 0.2s',
        }}
      />
      <Typography
        sx={{
          flex: 1, fontSize: 13, fontWeight: 600,
          color: selected ? 'teal.700' : 'text.primary',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          transition: 'color 0.2s',
        }}
        title={ch.title || undefined}
      >
        {ch.title || 'Untitled chapter'}
      </Typography>
    </Box>
  );
});

const LessonCard = memo(function LessonCard({
  lesson,
  selectedSlug,
  onOpen,
}: {
  lesson: SidebarItem;
  selectedSlug: string | null;
  onOpen: (slug: string) => void;
}) {
  const selectedLesson = lesson.slug === selectedSlug;
  const hasSelectedChild = lesson.children?.some(ch => ch.slug === selectedSlug);
  const isActive = selectedLesson || hasSelectedChild;

  return (
    <Box
      sx={{
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: isActive ? 'rgba(0, 150, 136, 0.35)' : 'rgba(0, 0, 0, 0.06)',
        bgcolor: isActive ? 'rgba(0, 150, 136, 0.06)' : 'background.paper',
        transition: 'all .25s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: isActive ? '0 2px 8px rgba(0, 150, 136, 0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
        overflow: 'hidden',
        '&:hover': {
          borderColor: isActive ? 'rgba(0, 150, 136, 0.45)' : 'rgba(0, 0, 0, 0.1)',
          boxShadow: isActive ? '0 4px 12px rgba(0, 150, 136, 0.2)' : '0 2px 6px rgba(0,0,0,0.08)',
          transform: 'translateY(-1px)',
        },
      }}
    >
      <Box onClick={() => onOpen(lesson.slug)} sx={{ display: 'flex', gap: 2, alignItems: 'center', cursor: 'pointer', p: 2 }}>
        <Thumb src={lesson.hero_image} alt={lesson.title || ''} w={72} h={48} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            sx={{
              fontSize: 14, fontWeight: 700, lineHeight: 1.3,
              color: selectedLesson ? 'teal.700' : 'text.primary',
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              transition: 'color .2s',
            }}
            title={lesson.title || undefined}
          >
            {lesson.title || 'Untitled lesson'}
          </Typography>
        </Box>
      </Box>

      {lesson.children?.length ? (
        <Box sx={{ padding: '8px 16px 12px', background: 'rgba(0, 150, 136, 0.025)', borderTop: '1px solid', borderColor: 'rgba(0, 0, 0, 0.06)' }}>
          <Stack spacing={0}>
            {lesson.children.map((ch) => (
              <ChapterRow key={ch.id} ch={ch} selected={selectedSlug === ch.slug} onOpen={onOpen} />
            ))}
          </Stack>
        </Box>
      ) : null}
    </Box>
  );
});

const LibrarySidebar = memo(function LibrarySidebar({
  items,
  selectedSlug,
  onOpenItem,
}: {
  items: SidebarItem[];
  selectedSlug: string | null;
  onOpenItem: (slug: string) => void;
}) {
  return (
    <Box sx={{ width: 360, bgcolor: 'background.paper', borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
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
        <Stack spacing={1}>
          {items.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} selectedSlug={selectedSlug} onOpen={onOpenItem} />
          ))}
        </Stack>
      </Box>
    </Box>
  );
});

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const selectedSegment = useSelectedLayoutSegment(); // null on /library, '<slug>' on /library/[slug]
  const selectedSlug = selectedSegment ? decodeURIComponent(selectedSegment) : null;

  const [rootId, setRootId] = useState<number | null>(null);
  const [items, setItems] = useState<SidebarItem[]>([]);

  // Resolve Library root once (stays mounted across slug changes)
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

  // Load lessons & chapters once per rootId (no refetch on slug change)
  useEffect(() => {
    if (!rootId) return;
    let cancelled = false;

    (async () => {
      const { data: links } = await supabase
        .from('node_children')
        .select('child_id, position')
        .eq('parent_id', rootId)
        .order('position', { ascending: true });

      const lessonIds = (links ?? []).map((l) => l.child_id);
      if (!lessonIds.length) {
        if (!cancelled) setItems([]);
        return;
      }

      const { data: lessonRows } = await supabase
        .from('content_nodes')
        .select('id, slug, title, description, node_type, hero_image, state')
        .in('id', lessonIds);

      const lessonsMap = new Map<number, SidebarItem>();
      (lessonRows ?? []).forEach((n) => {
        lessonsMap.set(n.id as number, {
          id: n.id as number,
          slug: n.slug as string,
          title: n.title ?? null,
          description: n.description ?? null,
          node_type: (n.node_type as any) ?? 'lesson',
          hero_image: toPublicUrl(n.hero_image) ?? undefined,
          state: (n as any).state ?? null,
          children: [],
        });
      });

      const { data: chLinks } = await supabase
        .from('node_children')
        .select('parent_id, child_id, position')
        .in('parent_id', lessonIds)
        .order('position', { ascending: true });

      const chapterIds = (chLinks ?? []).map((l) => l.child_id);
      let chaptersRows: any[] = [];
      if (chapterIds.length) {
        const { data: chRows } = await supabase
          .from('content_nodes')
          .select('id, slug, title, description, node_type, hero_image, state')
          .in('id', chapterIds);
        chaptersRows = chRows ?? [];
      }

      const chapterMap = new Map<number, SidebarItem>();
      chaptersRows.forEach((n) => {
        chapterMap.set(n.id as number, {
          id: n.id as number,
          slug: n.slug as string,
          title: n.title ?? null,
          description: n.description ?? null,
          node_type: (n.node_type as any) ?? 'chapter',
          hero_image: toPublicUrl(n.hero_image) ?? undefined,
          state: (n as any).state ?? null,
        });
      });

      const lessonChildrenOrder = new Map<number, SidebarItem[]>();
      (chLinks ?? []).forEach((l) => {
        const list = lessonChildrenOrder.get(l.parent_id) ?? [];
        const chapter = chapterMap.get(l.child_id);
        if (chapter) list.push(chapter);
        lessonChildrenOrder.set(l.parent_id, list);
      });

      const lessonsOrdered: SidebarItem[] = (links ?? [])
        .map((l) => {
          const lesson = lessonsMap.get(l.child_id);
          if (!lesson) return null;
          lesson.children = lessonChildrenOrder.get(lesson.id) ?? [];
          return lesson;
        })
        .filter(Boolean) as SidebarItem[];

      if (!cancelled) setItems(lessonsOrdered);
    })();

    return () => { cancelled = true; };
  }, [rootId]);

  // Auto-open first chapter when landing on a lesson URL directly
  useEffect(() => {
    if (!items.length || !selectedSlug) return;
    const lesson = items.find((l) => l.slug === selectedSlug);
    if (lesson && lesson.children?.length) {
      const firstChapter = lesson.children[0].slug;
      if (firstChapter && firstChapter !== selectedSlug) {
        router.push(`/library/${firstChapter}`);
      }
    }
  }, [items, selectedSlug, router]);

  const openItem = useCallback(
    (slug: string) => {
      const lesson = items.find((l) => l.slug === slug);
      if (lesson) {
        const target = lesson.children?.[0]?.slug ?? lesson.slug;
        if (selectedSlug !== target) router.push(`/library/${target}`);
        return;
      }
      if (selectedSlug !== slug) router.push(`/library/${slug}`);
    },
    [items, selectedSlug, router]
  );

  // If we're on /library (no slug), show children full-width; otherwise show sidebar + content.
  const onGrid = !selectedSlug;

  return onGrid ? (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>{children}</Box>
  ) : (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'grey.50' }}>
      <LibrarySidebar items={items} selectedSlug={selectedSlug} onOpenItem={openItem} />
      <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: 'grey.100' }}>{children}</Box>
    </Box>
  );
}
