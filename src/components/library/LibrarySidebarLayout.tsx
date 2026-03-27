'use client';

import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useState } from 'react';
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import BookIcon from '@mui/icons-material/Book';
import GridViewIcon from '@mui/icons-material/GridView';
import ImageIcon from '@mui/icons-material/Image';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSelectedLayoutSegments } from 'next/navigation';
import {
  fetchLibrarySidebarItems,
  type LibrarySidebarItem,
  type LibraryScope,
} from './shared';

type LibrarySidebarLayoutProps = {
  basePath: string;
  scope: LibraryScope;
  title: string;
  children: ReactNode;
};

function getRouteKey(item: Pick<LibrarySidebarItem, 'id' | 'slug'>) {
  return item.slug || String(item.id);
}

function buildItemPath(
  basePath: string,
  item: Pick<LibrarySidebarItem, 'id' | 'slug'>,
  lesson?: Pick<LibrarySidebarItem, 'id' | 'slug'> | null,
) {
  if (lesson && lesson.id !== item.id) {
    return `${basePath}/${getRouteKey(lesson)}/${getRouteKey(item)}`;
  }

  return `${basePath}/${getRouteKey(item)}`;
}

function findLessonForItem(items: LibrarySidebarItem[], itemId: number) {
  return items.find(
    (lesson) => lesson.id === itemId || lesson.children?.some((chapter) => chapter.id === itemId),
  ) ?? null;
}

function matchesSelectedItem(selectedSegment: string | null, item: Pick<LibrarySidebarItem, 'id' | 'slug'>) {
  if (!selectedSegment) return false;
  return selectedSegment === String(item.id) || selectedSegment === item.slug;
}

function Thumb({
  src,
  alt,
  width,
  height,
}: {
  src?: string | null;
  alt?: string;
  width: number;
  height: number;
}) {
  return (
    <Box
      sx={{
        width,
        height,
        borderRadius: 1.25,
        bgcolor: 'grey.200',
        overflow: 'hidden',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {src ? (
        <Image
          src={src}
          alt={alt || ''}
          fill
          sizes={`${width}px`}
          style={{ objectFit: 'cover' }}
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
          <ImageIcon sx={{ color: 'grey.400', fontSize: Math.max(16, Math.min(width, height) - 20) }} />
        </Box>
      )}
    </Box>
  );
}

const ChapterRow = memo(function ChapterRow({
  chapter,
  selected,
  onOpen,
}: {
  chapter: LibrarySidebarItem;
  selected: boolean;
  onOpen: (item: LibrarySidebarItem) => void;
}) {
  return (
    <Box
      onClick={() => onOpen(chapter)}
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
          flex: 1,
          fontSize: 13,
          fontWeight: 600,
          color: selected ? 'teal.700' : 'text.primary',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          transition: 'color 0.2s',
        }}
        title={chapter.title || undefined}
      >
        {chapter.title || 'Untitled chapter'}
      </Typography>
    </Box>
  );
});

const LessonCard = memo(function LessonCard({
  lesson,
  selectedSlug,
  onOpen,
}: {
  lesson: LibrarySidebarItem;
  selectedSlug: string | null;
  onOpen: (item: LibrarySidebarItem) => void;
}) {
  const selectedLesson = matchesSelectedItem(selectedSlug, lesson);
  const hasSelectedChild = lesson.children?.some((chapter) => matchesSelectedItem(selectedSlug, chapter));
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
      <Box
        onClick={() => onOpen(lesson)}
        sx={{ display: 'flex', gap: 2, alignItems: 'center', cursor: 'pointer', p: 2 }}
      >
        <Thumb src={lesson.hero_image} alt={lesson.title || ''} width={72} height={48} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.3,
              color: selectedLesson ? 'teal.700' : 'text.primary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              transition: 'color .2s',
            }}
            title={lesson.title || undefined}
          >
            {lesson.title || 'Untitled lesson'}
          </Typography>
        </Box>
      </Box>

      {lesson.children?.length ? (
        <Box
          sx={{
            padding: '8px 16px 12px',
            background: 'rgba(0, 150, 136, 0.025)',
            borderTop: '1px solid',
            borderColor: 'rgba(0, 0, 0, 0.06)',
          }}
        >
          <Stack spacing={0}>
            {lesson.children.map((chapter) => (
              <ChapterRow
                key={chapter.id}
                chapter={chapter}
                selected={matchesSelectedItem(selectedSlug, chapter)}
                onOpen={onOpen}
              />
            ))}
          </Stack>
        </Box>
      ) : null}
    </Box>
  );
});

const LibrarySidebar = memo(function LibrarySidebar({
  title,
  basePath,
  items,
  selectedSlug,
  onOpenItem,
}: {
  title: string;
  basePath: string;
  items: LibrarySidebarItem[];
  selectedSlug: string | null;
  onOpenItem: (item: LibrarySidebarItem) => void;
}) {
  return (
    <Box
      sx={{
        width: 360,
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
            <Typography variant="h6" fontWeight={700}>
              {title}
            </Typography>
          </Box>
          <Tooltip title="Back to grid view">
            <IconButton size="medium" component={Link} href={basePath}>
              <GridViewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        <Stack spacing={1}>
          {items.map((lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              selectedSlug={selectedSlug}
              onOpen={onOpenItem}
            />
          ))}
        </Stack>
      </Box>
    </Box>
  );
});

export default function LibrarySidebarLayout({
  basePath,
  scope,
  title,
  children,
}: LibrarySidebarLayoutProps) {
  const router = useRouter();
  const selectedSegments = useSelectedLayoutSegments();
  const selectedSlug = selectedSegments.length
    ? decodeURIComponent(selectedSegments[selectedSegments.length - 1])
    : null;

  const [items, setItems] = useState<LibrarySidebarItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      try {
        const nextItems = await fetchLibrarySidebarItems(scope);
        if (!cancelled) {
          setItems(nextItems);
        }
      } catch {
        if (!cancelled) {
          setItems([]);
        }
      }
    }

    void loadItems();

    return () => {
      cancelled = true;
    };
  }, [scope]);

  useEffect(() => {
    if (!items.length || !selectedSlug) return;

    const lesson = items.find((item) => matchesSelectedItem(selectedSlug, item));
    if (!lesson || !lesson.children?.length) return;

    const firstChapter = lesson.children[0];
    const firstChapterKey = getRouteKey(firstChapter);
    if (firstChapterKey !== selectedSlug) {
      router.push(buildItemPath(basePath, firstChapter, lesson));
    }
  }, [basePath, items, router, selectedSlug]);

  const openItem = useCallback(
    (item: LibrarySidebarItem) => {
      const lesson = findLessonForItem(items, item.id);
      if (!lesson) {
        const targetKey = getRouteKey(item);
        if (selectedSlug !== targetKey) {
          router.push(buildItemPath(basePath, item));
        }
        return;
      }

      const target = lesson.id === item.id ? (lesson.children?.[0] ?? lesson) : item;
      const targetKey = getRouteKey(target);
      if (selectedSlug !== targetKey) {
        router.push(buildItemPath(basePath, target, lesson));
      }
    },
    [basePath, items, router, selectedSlug],
  );

  const onGrid = !selectedSlug;

  return onGrid ? (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>{children}</Box>
  ) : (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'grey.50' }}>
      <LibrarySidebar
        title={title}
        basePath={basePath}
        items={items}
        selectedSlug={selectedSlug}
        onOpenItem={openItem}
      />
      <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: 'grey.100' }}>{children}</Box>
    </Box>
  );
}
