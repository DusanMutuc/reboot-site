'use client';

import React, {
  type ReactElement,
  type ReactNode,
  useMemo,
  useEffect,
  useRef,
  useState,
  cloneElement,
  isValidElement,
} from 'react';
import { alpha } from '@mui/material/styles';
import {
  Avatar,
  Box,
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  Paper,
  Switch,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ArticleIcon from '@mui/icons-material/Article';
import LayersIcon from '@mui/icons-material/Layers';
import CollectionsBookmarkIcon from '@mui/icons-material/CollectionsBookmark';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import StorageIcon from '@mui/icons-material/Storage';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AddIcon from '@mui/icons-material/Add';

import type { NodeSubtree } from '@/types/course';
import { useUndoRedoInput } from '@/hooks/useUndoRedoInput';

const NODE_ICONS: Record<string, ReactElement> = {
  course: <MenuBookIcon fontSize="small" />,
  lesson: <ArticleIcon fontSize="small" />,
  chapter: <LayersIcon fontSize="small" />,
  collection: <CollectionsBookmarkIcon fontSize="small" />,
  playlist: <PlaylistPlayIcon fontSize="small" />,
};

export type SidebarMode = 'courses' | 'outline';

type UnlockStatus = {
  locked: boolean;
  is_required: boolean;
  reason: string | null;
  child_position: number;
};

type UnlockStatusMap = Record<number, UnlockStatus>;

export type TreeProps = {
  mode: SidebarMode;
  courses: NodeSubtree[];
  expanded: Set<number>;
  activeCourse: NodeSubtree | null;
  selectedSubtree: NodeSubtree | null;
  selectedNodeId: number | null;
  activeCourseId: number | null;
  courseSearch: string;
  outlineSearch: string;
  onCourseSearchChange: (value: string) => void;
  onOutlineSearchChange: (value: string) => void;
  onSelectCourse: (courseId: number) => void;
  onSelectNode: (nodeId: number) => void;
  onBackToCourses: () => void;
  onToggle: (id: number) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>, nodeId: number) => void;
  onCreateCourse: () => void;
  onQuickAddLesson: () => void;
  onQuickAddChapter: () => void;
  onQuickAddBlock: () => void;
  canAddLesson: boolean;
  canAddChapter: boolean;
  canAddBlock: boolean;
  courseStats: Map<number, { lessons: number; chapters: number }>;
  onToggleSequentialUnlock: (value: boolean) => void;
  getUnlockStatus: (parentId: number) => Promise<UnlockStatusMap>;
  onUnlockStatusError?: (message: string) => void;
};

function matchesQuery(value: string | null | undefined, query: string) {
  if (!query) return true;
  return (value ?? '').toLowerCase().includes(query.toLowerCase());
}

function subtreeContainsQuery(subtree: NodeSubtree, query: string): boolean {
  if (!query) return true;
  if (matchesQuery(subtree.node.title, query)) return true;
  return subtree.children.some((child) => subtreeContainsQuery(child.subtree, query));
}

function formatRelativeDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const now = Date.now();
  const diffMs = date.getTime() - now;
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const absMinutes = Math.abs(diffMinutes);
  if (absMinutes < 1) {
    return 'moments ago';
  }
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (absMinutes < 60) {
    return formatter.format(diffMinutes, 'minute');
  }
  const diffHours = Math.round(diffMinutes / 60);
  const absHours = Math.abs(diffHours);
  if (absHours < 24) {
    return formatter.format(diffHours, 'hour');
  }
  const diffDays = Math.round(diffHours / 24);
  const absDays = Math.abs(diffDays);
  if (absDays < 7) {
    return formatter.format(diffDays, 'day');
  }
  const diffWeeks = Math.round(diffDays / 7);
  const absWeeks = Math.abs(diffWeeks);
  if (absWeeks < 5) {
    return formatter.format(diffWeeks, 'week');
  }
  const diffMonths = Math.round(diffDays / 30);
  const absMonths = Math.abs(diffMonths);
  if (absMonths < 12) {
    return formatter.format(diffMonths, 'month');
  }
  const diffYears = Math.round(diffDays / 365);
  return formatter.format(diffYears, 'year');
}

function getNodeIcon(type: string) {
  return NODE_ICONS[type] ?? <StorageIcon fontSize="small" />;
}

function TruncateTooltip({
  title,
  children,
  placement = 'right',
}: {
  title: string;
  children: React.ReactElement;
  placement?: 'bottom' | 'left' | 'right' | 'top';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const check = () => setTruncated(el.scrollWidth > el.clientWidth);
    check();

    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener('resize', check);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [title]);

  // Safely attach a ref to the child for measurement (cast avoids TS “ref” prop error)
  const childWithRef = isValidElement(children)
    ? cloneElement(children as React.ReactElement, { ref } as React.RefAttributes<HTMLElement>)
    : children;

  return (
    <Tooltip
      title={title}
      placement={placement}
      arrow
      describeChild
      disableHoverListener={!truncated}
    >
      {childWithRef}
    </Tooltip>
  );
}

/** -----------------------------
 *  (kept) OutlineNode – unchanged logic; still available if you want to render as a flat list
 *  ----------------------------- */
type OutlineNodeProps = {
  subtree: NodeSubtree;
  level: number;
  expanded: Set<number>;
  toggle: (id: number) => void;
  onSelect: (id: number) => void;
  selectedId: number | null;
  search: string;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>, nodeId: number) => void;
};

function OutlineNode({
  subtree,
  level,
  expanded,
  toggle,
  onSelect,
  selectedId,
  search,
  onContextMenu,
}: OutlineNodeProps) {
  const hasChildren = subtree.children.length > 0;
  const matches = matchesQuery(subtree.node.title, search);
  const childMatches = subtree.children.some((child) => subtreeContainsQuery(child.subtree, search));
  const isExpanded = expanded.has(subtree.node.id) || (!!search && hasChildren && childMatches);

  if (search && !matches && !childMatches) {
    return null;
  }

  const labelVariant = subtree.node.node_type === 'lesson' ? 'subtitle2' : 'body2';

  return (
    <Box>
      <ListItem disablePadding sx={{ display: 'block' }}>
        <ListItemButton
          selected={selectedId === subtree.node.id}
          onClick={() => onSelect(subtree.node.id)}
          onContextMenu={
            onContextMenu
              ? (event) => {
                  event.preventDefault();
                  onContextMenu(event, subtree.node.id);
                }
              : undefined
          }
          sx={{
            alignItems: 'center',
            gap: 1,
            py: 1,
            pl: `calc(${level} * 20px + 12px)`,
            borderRadius: 1.5,
            '&.Mui-selected': {
              backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.1),
              '&:hover': {
                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.15),
              },
            },
          }}
        >
          {hasChildren ? (
            <IconButton
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                toggle(subtree.node.id);
              }}
              sx={{
                mr: 0.5,
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
              }}
              aria-label={isExpanded ? 'Collapse section' : 'Expand section'}
            >
              {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
            </IconButton>
          ) : (
            <Box sx={{ width: 32 }} />
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
              {getNodeIcon(subtree.node.node_type)}
            </Box>
            <Typography
              variant={labelVariant}
              noWrap
              sx={{ fontWeight: subtree.node.node_type === 'lesson' ? 600 : 500 }}
            >
              {subtree.node.title ?? 'Untitled node'}
            </Typography>
          </Box>
        </ListItemButton>
      </ListItem>
      {hasChildren && isExpanded ? (
        <Box>
          {subtree.children.map((child) => (
            <OutlineNode
              key={child.subtree.node.id}
              subtree={child.subtree}
              level={level + 1}
              expanded={expanded}
              toggle={toggle}
              onSelect={onSelect}
              selectedId={selectedId}
              search={search}
              onContextMenu={onContextMenu}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

/** -----------------------------
 *  Courses list (unchanged)
 *  ----------------------------- */
function CoursesList({
  courses,
  search,
  onSearchChange,
  onSelectCourse,
  onContextMenu,
  activeCourseId,
  courseStats,
  onCreateCourse,
}: {
  courses: NodeSubtree[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelectCourse: (courseId: number) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>, nodeId: number) => void;
  activeCourseId: number | null;
  courseStats: Map<number, { lessons: number; chapters: number }>;
  onCreateCourse: () => void;
}) {
  const searchInput = useUndoRedoInput({
    value: search,
    onChange: onSearchChange,
    scopeKey: 'courses-search',
  });
  const filtered = useMemo(
    () =>
      courses.filter((course) => {
        if (!search) return true;
        return matchesQuery(course.node.title, search);
      }),
    [courses, search],
  );

  const hasCourses = courses.length > 0;

  return (
    <Stack spacing={2} sx={{ height: '100%', p: 3 }}>
      <Box>
        <Typography variant="subtitle1" gutterBottom>
          Courses
        </Typography>
        <TextField
          size="small"
          fullWidth
          placeholder="Search courses"
          value={search}
          onChange={(event) => searchInput.handleChange(event.target.value)}
          onKeyDown={searchInput.handleKeyDown}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {hasCourses ? (
          filtered.length > 0 ? (
            <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {filtered.map((course) => {
                const selected = activeCourseId === course.node.id;
                const stats = courseStats.get(course.node.id) ?? { lessons: 0, chapters: 0 };
                const metadata = course.node.metadata as { thumbnail_url?: string } | null;
                const thumbnail = metadata?.thumbnail_url ?? (course.node.hero_image as string | undefined);
                const avatarContent: ReactNode = thumbnail ? (
                  <Avatar src={thumbnail} variant="rounded" sx={{ width: 36, height: 36 }} />
                ) : (
                  <Avatar variant="rounded" sx={{ width: 36, height: 36 }}>
                    {course.node.title?.[0]?.toUpperCase() ?? <MenuBookIcon fontSize="small" />}
                  </Avatar>
                );
                const relative =
                  formatRelativeDate((course.node as { updated_at?: string }).updated_at ??
                    (course.node as { updatedAt?: string }).updatedAt ??
                    null) ?? 'recently';
                const updated = `Updated ${relative}`;

                return (
                  <ListItem key={course.node.id} disablePadding sx={{ display: 'block' }}>
                    <ListItemButton
                      onClick={() => onSelectCourse(course.node.id)}
                      selected={selected}
                      sx={{
                        alignItems: 'center',
                        gap: 2,
                        borderRadius: 2,
                        p: 1.5,
                        position: 'relative',
                        '&::before': {
                          content: '""',
                          position: 'absolute',
                          inset: '4px auto 4px 0',
                          width: 3,
                          borderRadius: 2,
                          backgroundColor: selected ? 'primary.main' : 'transparent',
                          transition: 'background-color 120ms ease',
                        },
                        '&.Mui-focusVisible': {
                          outline: '2px solid',
                          outlineColor: 'primary.main',
                          outlineOffset: 2,
                        },
                        '&.Mui-selected': {
                          backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
                        },
                        '&:hover': {
                          backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.04),
                        },
                      }}
                    >
                      {avatarContent}
                      <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
                          {course.node.title ?? 'Untitled course'}
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Chip
                            size="small"
                            label={(course.node.state ?? 'draft').replace(/\b\w/g, (char) => char.toUpperCase())}
                            color={course.node.state === 'published' ? 'success' : 'default'}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {`${stats.lessons} lesson${stats.lessons === 1 ? '' : 's'} • ${stats.chapters} chapter${
                              stats.chapters === 1 ? '' : 's'
                            }`}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {updated}
                          </Typography>
                        </Stack>
                      </Stack>
                      {onContextMenu ? (
                        <Tooltip title="Course actions">
                          <IconButton
                            size="small"
                            onClick={(event) => {
                              event.stopPropagation();
                              onContextMenu(event, course.node.id);
                            }}
                            aria-label="Course actions"
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No courses match your search.
            </Typography>
          )
        ) : (
          <Stack spacing={2} alignItems="flex-start">
            <Typography color="text.secondary">Create your first course to get started.</Typography>
            <Button variant="contained" onClick={onCreateCourse} startIcon={<AddIcon fontSize="small" />}>
              New course
            </Button>
          </Stack>
        )}
      </Box>
    </Stack>
  );
}

/** -----------------------------
 *  Outline Header – visual parity with artifact
 *  ----------------------------- */
type OutlineHeaderProps = {
  course: NodeSubtree;
  stats: { lessons: number; chapters: number };
  onBack: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onQuickAddLesson: () => void;
  onQuickAddChapter: () => void;
  onQuickAddBlock: () => void;
  canAddLesson: boolean;
  canAddChapter: boolean;
  canAddBlock: boolean;
  sequentialUnlock: boolean;
  onToggleSequentialUnlock: (value: boolean) => void;
};

function OutlineHeader({
  course,
  stats,
  onBack,
  onExpandAll,
  onCollapseAll,
  sequentialUnlock,
  onToggleSequentialUnlock,
}: OutlineHeaderProps) {
  return (
    <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Button
          size="small"
          startIcon={<ArrowBackIcon />}
          onClick={onBack}
          sx={{
            color: 'primary.main',
            fontWeight: 600,
            textTransform: 'none',
            px: 0,
            '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
          }}
        >
          Courses
        </Button>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" variant="outlined" onClick={onExpandAll}>
            EXPAND ALL
          </Button>
          <Button size="small" variant="outlined" onClick={onCollapseAll}>
            COLLAPSE ALL
          </Button>
        </Box>
      </Box>

      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        {course.node.title ?? 'Untitled course'}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Chip
          size="small"
          label={(course.node.state ?? 'draft').replace(/\b\w/g, (c) => c.toUpperCase())}
          sx={{
            bgcolor: '#fff3cd',
            color: '#856404',
            fontWeight: 600,
            '& .MuiChip-label': { px: 1.25, py: 0.5 },
          }}
        />
        <Chip size="small" label={`${stats.lessons} lessons`} sx={{ bgcolor: '#e7f3ff', color: '#0c5ba0', fontWeight: 600 }} />
        <Chip size="small" label={`${stats.chapters} chapters`} sx={{ bgcolor: '#e7f3ff', color: '#0c5ba0', fontWeight: 600 }} />
      </Box>

      <Box sx={{ mt: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={sequentialUnlock}
              onChange={(event) => onToggleSequentialUnlock(event.target.checked)}
              color="primary"
              inputProps={{ 'aria-label': 'Toggle sequential unlock for course' }}
            />
          }
          label="All nodes require previous nodes"
        />
      </Box>
    </Box>
  );
}

/** -----------------------------
 *  Chapter card + Lesson row – artifact look
 *  ----------------------------- */
function ChapterCard({
  subtree,
  expanded,
  onToggle,
  onSelect,
  selectedId,
  onContextMenu,
  sequentialUnlock,
  lockStatus,
}: {
  subtree: NodeSubtree;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
  selectedId: number | null;
  onContextMenu?: (e: React.MouseEvent<HTMLElement>, id: number) => void;
  sequentialUnlock: boolean;
  lockStatus?: UnlockStatus;
}) {
  const hasChildren = subtree.children.length > 0;
  const isExpanded = expanded.has(subtree.node.id);
  const isSelected = selectedId === subtree.node.id;
  const showLockIcon = sequentialUnlock && subtree.node.node_type === 'lesson' && Boolean(lockStatus?.locked);

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        transition: 'box-shadow .2s, border-color .2s',
        '&:hover': { borderColor: 'grey.300', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
      }}
    >
      {/* Chapter header */}
      <Box
        role="button"
        onClick={() => onSelect(subtree.node.id)}
        onContextMenu={
          onContextMenu
            ? (e) => {
                e.preventDefault();
                onContextMenu(e, subtree.node.id);
              }
            : undefined
        }
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1.5,
          bgcolor: isSelected ? (t) => alpha(t.palette.primary.main, 0.08) : 'background.default',
          cursor: 'pointer',
          userSelect: 'none',
          '&:hover': { bgcolor: (t) => (isSelected ? alpha(t.palette.primary.main, 0.16) : t.palette.action.hover) },
        }}
      >
        <Box sx={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {hasChildren ? (
            <IconButton
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                onToggle(subtree.node.id);
              }}
              sx={{
                width: 24,
                height: 24,
                color: 'text.secondary',
                '&:hover': { bgcolor: 'transparent' },
              }}
            >
              <ChevronRightIcon
                fontSize="small"
                sx={{ transition: 'transform .2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}
              />
            </IconButton>
          ) : null}
        </Box>

        <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
          <LayersIcon fontSize="small" />
        </Box>

        <TruncateTooltip title={subtree.node.title || 'Untitled'}>
          <Typography sx={{ fontWeight: 700, fontSize: 15, flex: 1 }} noWrap>
            {subtree.node.title || 'Untitled'}
          </Typography>
        </TruncateTooltip>

        {showLockIcon ? (
          <Tooltip title="Students must complete previous lessons first" placement="top" arrow>
            <LockOutlinedIcon fontSize="small" sx={{ color: 'text.disabled' }} />
          </Tooltip>
        ) : null}

      </Box>

      {/* Lesson list (or empty state) */}
      {hasChildren && isExpanded ? (
        <Stack sx={{ bgcolor: 'background.paper' }}>
          {subtree.children.length ? (
            subtree.children.map((child, idx) => (
              <LessonRow
                key={child.subtree.node.id}
                subtree={child.subtree}
                onSelect={onSelect}
                selected={selectedId === child.subtree.node.id}
                onContextMenu={onContextMenu}
                divider={idx > 0}
              />
            ))
          ) : (
            <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary', bgcolor: 'background.default' }}>
              <StorageIcon sx={{ opacity: 0.3, fontSize: 36, mb: 1 }} />
              <Typography variant="body2">
                This chapter has no content yet. Use the + Block action to add content.
              </Typography>
            </Box>
          )}
        </Stack>
      ) : null}
    </Box>
  );
}

function LessonRow({
  subtree,
  onSelect,
  selected,
  onContextMenu,
  divider,
}: {
  subtree: NodeSubtree;
  onSelect: (id: number) => void;
  selected: boolean;
  onContextMenu?: (e: React.MouseEvent<HTMLElement>, id: number) => void;
  divider?: boolean;
}) {
  return (
    <Box
      onClick={() => onSelect(subtree.node.id)}
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault();
              onContextMenu(e, subtree.node.id);
            }
          : undefined
      }
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        pl: 6,
        pr: 2,
        py: 1.5,
        borderTop: divider ? '1px solid' : 'none',
        borderColor: 'divider',
        cursor: 'pointer',
        bgcolor: selected ? (t) => alpha(t.palette.primary.main, 0.08) : 'transparent',
        '&:hover': { bgcolor: 'action.hover' },
        transition: 'background-color .2s',
      }}
    >
      <ArticleIcon fontSize="small" sx={{ color: 'text.secondary' }} />
      <TruncateTooltip title={subtree.node.title || 'Untitled'}>
        <Typography variant="body2" noWrap sx={{ color: 'text.primary' }}>
          {subtree.node.title || 'Untitled'}
        </Typography>
      </TruncateTooltip>

    </Box>
  );
}

/** -----------------------------
 *  Outline panel – same logic, artifact layout
 *  ----------------------------- */
function OutlinePanel({
  course,
  expanded,
  selectedNodeId,
  selectedSubtree,
  search,
  onSearchChange,
  onSelect,
  onToggle,
  onContextMenu,
  onBack,
  onExpandAll,
  onCollapseAll,
  onQuickAddLesson,
  onQuickAddChapter,
  onQuickAddBlock,
  canAddLesson,
  canAddChapter,
  canAddBlock,
  stats,
  onToggleSequentialUnlock,
  getUnlockStatus,
  onUnlockStatusError,
}: {
  course: NodeSubtree;
  expanded: Set<number>;
  selectedNodeId: number | null;
  selectedSubtree: NodeSubtree | null;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (nodeId: number) => void;
  onToggle: (id: number) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>, nodeId: number) => void;
  onBack: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onQuickAddLesson: () => void;
  onQuickAddChapter: () => void;
  onQuickAddBlock: () => void;
  canAddLesson: boolean;
  canAddChapter: boolean;
  canAddBlock: boolean;
  stats: { lessons: number; chapters: number };
  onToggleSequentialUnlock: (value: boolean) => void;
  getUnlockStatus: (parentId: number) => Promise<UnlockStatusMap>;
  onUnlockStatusError?: (message: string) => void;
}) {
  const searchInput = useUndoRedoInput({
    value: search,
    onChange: onSearchChange,
    scopeKey: `outline-${course.node.id}`,
  });
  const sequentialUnlock = Boolean(course.node.sequential_unlock);
  const [unlockPreview, setUnlockPreview] = useState<UnlockStatusMap>({});

  useEffect(() => {
    let cancelled = false;

    if (!sequentialUnlock) {
      setUnlockPreview({});
      return undefined;
    }

    const sortedLessons = [...course.children]
      .filter((child) => child.subtree.node.node_type === 'lesson')
      .sort((a, b) => (a.edge.position ?? 0) - (b.edge.position ?? 0));

    const optimistic: UnlockStatusMap = {};
    sortedLessons.forEach((child, index) => {
      const position = child.edge.position ?? index;
      const locked = index > 0;
      optimistic[child.subtree.node.id] = {
        locked,
        is_required: locked,
        reason: locked ? 'waiting_for_required_previous' : 'available',
        child_position: position,
      };
    });

    setUnlockPreview(optimistic);

    const load = async () => {
      try {
        const remote = await getUnlockStatus(course.node.id);
        if (!cancelled) {
          setUnlockPreview(remote);
        }
      } catch (error) {
        if (!cancelled) {
          onUnlockStatusError?.('Failed to refresh unlock preview');
          console.error('[courseBuilder] Failed to fetch unlock status', error);
          setUnlockPreview({});
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [course, getUnlockStatus, onUnlockStatusError, sequentialUnlock]);
  const filteredChildren = useMemo(
    () =>
      course.children.filter(({ subtree }) => {
        if (!search) return true;
        return subtreeContainsQuery(subtree, search);
      }),
    [course.children, search],
  );

  const hasLessons = course.children.length > 0;

  let contextualMessage: string | null = null;
  if (!search && selectedSubtree) {
    if (selectedSubtree.node.node_type === 'lesson' && selectedSubtree.children.length === 0) {
      contextualMessage = 'Add chapters to structure this lesson.';
    } else if (selectedSubtree.node.node_type === 'chapter' && selectedSubtree.children.length === 0) {
      contextualMessage = 'This chapter has no content yet. Use the + Block action to add content.';
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <OutlineHeader
        course={course}
        stats={stats}
        onBack={onBack}
        onExpandAll={onExpandAll}
        onCollapseAll={onCollapseAll}
        sequentialUnlock={sequentialUnlock}
        onToggleSequentialUnlock={onToggleSequentialUnlock}
        onQuickAddLesson={onQuickAddLesson}
        onQuickAddChapter={onQuickAddChapter}
        onQuickAddBlock={onQuickAddBlock}
        canAddLesson={canAddLesson}
        canAddChapter={canAddChapter}
        canAddBlock={canAddBlock}
      />

      {/* Actions bar */}
      <Box
        sx={{
          px: 3,
          py: 2,
          bgcolor: 'background.default',
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <Button variant="contained" size="small" onClick={onQuickAddLesson} disabled={!canAddLesson} startIcon={<AddIcon />}>
          LESSON
        </Button>
        <Button variant="outlined" size="small" onClick={onQuickAddChapter} disabled={!canAddChapter} startIcon={<AddIcon />}>
          CHAPTER
        </Button>
        <Button variant="outlined" size="small" onClick={onQuickAddBlock} disabled={!canAddBlock} startIcon={<AddIcon />}>
          BLOCK
        </Button>
      </Box>

      {/* Search */}
      <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search in course"
          value={search}
          onChange={(event) => searchInput.handleChange(event.target.value)}
          onKeyDown={searchInput.handleKeyDown}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: 'background.default',
            },
          }}
        />
      </Box>

      {/* Contextual hint */}
      {contextualMessage && (
        <Box sx={{ mx: 3, my: 2, p: 2, borderRadius: 2, bgcolor: (t) => alpha(t.palette.primary.main, 0.08) }}>
          <Typography variant="body2" color="text.secondary">
            {contextualMessage}
          </Typography>
        </Box>
      )}

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
        {hasLessons ? (
          filteredChildren.length > 0 ? (
            <Stack spacing={1.5}>
              {filteredChildren.map(({ subtree }) => (
                <ChapterCard
                  key={subtree.node.id}
                  subtree={subtree}
                  expanded={expanded}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  selectedId={selectedNodeId}
                  onContextMenu={onContextMenu}
                  sequentialUnlock={sequentialUnlock}
                  lockStatus={unlockPreview[subtree.node.id]}
                />
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No matches in this course.
            </Typography>
          )
        ) : (
          <Typography variant="body2" color="text.secondary">
            This course has no lessons yet. Add a lesson to begin.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

/** -----------------------------
 *  Root
 *  ----------------------------- */
export default function Tree({
  mode,
  courses,
  expanded,
  activeCourse,
  selectedSubtree,
  selectedNodeId,
  activeCourseId,
  courseSearch,
  outlineSearch,
  onCourseSearchChange,
  onOutlineSearchChange,
  onSelectCourse,
  onSelectNode,
  onBackToCourses,
  onToggle,
  onExpandAll,
  onCollapseAll,
  onContextMenu,
  onCreateCourse,
  onQuickAddLesson,
  onQuickAddChapter,
  onQuickAddBlock,
  canAddLesson,
  canAddChapter,
  canAddBlock,
  courseStats,
  onToggleSequentialUnlock,
  getUnlockStatus,
  onUnlockStatusError,
}: TreeProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        height: '100%',
        overflow: 'hidden',
        borderRadius: 2.5,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {mode === 'courses' ? (
        <CoursesList
          courses={courses}
          search={courseSearch}
          onSearchChange={onCourseSearchChange}
          onSelectCourse={onSelectCourse}
          onContextMenu={onContextMenu}
          activeCourseId={activeCourseId}
          courseStats={courseStats}
          onCreateCourse={onCreateCourse}
        />
      ) : activeCourse ? (
        <OutlinePanel
          course={activeCourse}
          expanded={expanded}
          selectedNodeId={selectedNodeId}
          selectedSubtree={selectedSubtree}
          search={outlineSearch}
          onSearchChange={onOutlineSearchChange}
          onSelect={onSelectNode}
          onToggle={onToggle}
          onContextMenu={onContextMenu}
          onBack={onBackToCourses}
          onExpandAll={onExpandAll}
          onCollapseAll={onCollapseAll}
          onQuickAddLesson={onQuickAddLesson}
          onQuickAddChapter={onQuickAddChapter}
          onQuickAddBlock={onQuickAddBlock}
          canAddLesson={canAddLesson}
          canAddChapter={canAddChapter}
          canAddBlock={canAddBlock}
          stats={courseStats.get(activeCourse.node.id) ?? { lessons: 0, chapters: 0 }}
          onToggleSequentialUnlock={onToggleSequentialUnlock}
          getUnlockStatus={getUnlockStatus}
          onUnlockStatusError={onUnlockStatusError}
        />
      ) : (
        <CoursesList
          courses={courses}
          search={courseSearch}
          onSearchChange={onCourseSearchChange}
          onSelectCourse={onSelectCourse}
          onContextMenu={onContextMenu}
          activeCourseId={activeCourseId}
          courseStats={courseStats}
          onCreateCourse={onCreateCourse}
        />
      )}
    </Paper>
  );
}
