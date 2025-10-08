'use client';

import { type ReactElement, type ReactNode, useMemo } from 'react';
import { alpha } from '@mui/material/styles';
import {
  Avatar,
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  Collapse,
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
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AddIcon from '@mui/icons-material/Add';

import type { NodeSubtree } from '@/types/course';

const NODE_ICONS: Record<string, ReactElement> = {
  course: <MenuBookIcon fontSize="small" />,
  lesson: <ArticleIcon fontSize="small" />,
  chapter: <LayersIcon fontSize="small" />,
  collection: <CollectionsBookmarkIcon fontSize="small" />,
  playlist: <PlaylistPlayIcon fontSize="small" />,
};

export type SidebarMode = 'courses' | 'outline';

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
  const tone =
    level === 0
      ? { color: 'text.primary', opacity: 0.95 }
      : level === 1
        ? { color: 'text.secondary', opacity: 0.85 }
        : { color: 'text.secondary', opacity: 0.75 };
  const connectorLeft = `calc(${level} * 20px + 8px)`;

  return (
    <Box>
      <ListItem
        disablePadding
        sx={{
          display: 'block',
          position: 'relative',
          ...(level > 0
            ? {
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  left: connectorLeft,
                  top: 8,
                  bottom: 8,
                  width: 1,
                  backgroundColor: 'divider',
                  opacity: 0.35,
                },
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  left: connectorLeft,
                  top: 'calc(50% - 0.5px)',
                  width: 12,
                  height: 1,
                  backgroundColor: 'divider',
                  opacity: 0.35,
                },
              }
            : {}),
        }}
      >
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
            py: 0.85,
            pl: `calc(${level} * 20px + 20px)`,
            borderRadius: 1.5,
            position: 'relative',
            minHeight: 44,
            transition: 'background-color 150ms ease, color 150ms ease',
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: '6px auto 6px 0',
              width: 3,
              borderRadius: 2,
              backgroundColor: 'transparent',
              transition: 'background-color 150ms ease',
            },
            '&:hover': {
              backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.05),
            },
            '&.Mui-selected': {
              backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.12),
              '&::before': {
                backgroundColor: 'primary.main',
              },
              '&:hover': {
                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.16),
              },
            },
            '&.Mui-focusVisible': {
              outline: '2px solid',
              outlineColor: 'primary.main',
              outlineOffset: 2,
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
                color: 'text.disabled',
                '&:hover': {
                  backgroundColor: 'transparent',
                  color: 'text.secondary',
                },
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
            <Box
              sx={{
                color: level === 0 ? 'text.secondary' : 'text.disabled',
                display: 'flex',
                alignItems: 'center',
                '& .MuiSvgIcon-root': {
                  fontSize: level === 0 ? '1.125rem' : '1rem',
                },
              }}
            >
              {getNodeIcon(subtree.node.node_type)}
            </Box>
            <Typography
              variant={labelVariant}
              noWrap
              sx={{
                fontWeight: subtree.node.node_type === 'lesson' ? 600 : 500,
                color: tone.color,
                opacity: tone.opacity,
                fontSize: subtree.node.node_type === 'lesson' ? '0.95rem' : '0.84rem',
              }}
            >
              {subtree.node.title ?? 'Untitled node'}
            </Typography>
          </Box>
        </ListItemButton>
      </ListItem>
      {hasChildren ? (
        <Collapse in={isExpanded} timeout={150} unmountOnExit>
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
        </Collapse>
      ) : null}
    </Box>
  );
}

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
    <Stack spacing={2} sx={{ height: '100%' }}>
      <Box>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 1.5 }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Courses
          </Typography>
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon fontSize="small" />}
            onClick={onCreateCourse}
          >
            New course
          </Button>
        </Stack>
        <TextField
          size="small"
          fullWidth
          placeholder="Search courses"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
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

function OutlineHeader({
  onBack,
  onExpandAll,
  onCollapseAll,
}: {
  onBack: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  return (
    <Stack spacing={1}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
        <Button
          size="small"
          startIcon={<ArrowBackIcon />}
          onClick={onBack}
          variant="text"
          sx={{
            alignSelf: 'flex-start',
            color: 'text.secondary',
            '&:hover': { backgroundColor: 'transparent', color: 'text.primary' },
          }}
        >
          Courses
        </Button>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" onClick={onExpandAll}>
            Expand all
          </Button>
          <Button size="small" variant="outlined" onClick={onCollapseAll}>
            Collapse all
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
}

function CourseSummaryCard({
  course,
  stats,
}: {
  course: NodeSubtree;
  stats: { lessons: number; chapters: number };
}) {
  const courseTitle = course.node.title ?? 'Untitled course';
  const stateLabel = (course.node.state ?? 'draft').replace(/\b\w/g, (char) => char.toUpperCase());
  const relative =
    formatRelativeDate(
      (course.node as { updated_at?: string }).updated_at ??
        (course.node as { updatedAt?: string }).updatedAt ??
        null,
    ) ?? 'recently';

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: 'background.paper',
        boxShadow: (theme) => theme.shadows[1],
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        gap: 2,
      }}
    >
      <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="h6"
          sx={{ fontWeight: 600, fontSize: '1.125rem' }}
          noWrap
          title={courseTitle}
        >
          {courseTitle}
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
          <Chip
            size="small"
            label={stateLabel}
            color={course.node.state === 'published' ? 'success' : 'default'}
          />
          <Chip size="small" label={`${stats.lessons} lesson${stats.lessons === 1 ? '' : 's'}`} />
          <Chip size="small" label={`${stats.chapters} chapter${stats.chapters === 1 ? '' : 's'}`} />
          <Typography variant="caption" color="text.secondary">
            Updated {relative}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}

function OutlinePanel({
  course,
  expanded,
  selectedNodeId,
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
}: {
  course: NodeSubtree;
  expanded: Set<number>;
  selectedNodeId: number | null;
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
}) {
  const filteredChildren = useMemo(
    () =>
      course.children
        .map((child) => child.subtree)
        .filter((child) => {
          if (!search) return true;
          return subtreeContainsQuery(child, search);
        }),
    [course.children, search],
  );

  const hasLessons = course.children.length > 0;
  const searchPlaceholderTitle = course.node.title?.trim();

  return (
    <Stack spacing={2.5} sx={{ height: '100%' }}>
      <OutlineHeader
        onBack={onBack}
        onExpandAll={onExpandAll}
        onCollapseAll={onCollapseAll}
      />
      <CourseSummaryCard course={course} stats={stats} />
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <Button size="small" variant="contained" onClick={onQuickAddLesson} disabled={!canAddLesson}>
          + Lesson
        </Button>
        <Button size="small" variant="outlined" onClick={onQuickAddChapter} disabled={!canAddChapter}>
          + Chapter
        </Button>
        <Button size="small" variant="outlined" onClick={onQuickAddBlock} disabled={!canAddBlock}>
          + Block
        </Button>
      </Stack>
      <TextField
        size="small"
        fullWidth
        placeholder={searchPlaceholderTitle ? `Search in "${searchPlaceholderTitle}"` : 'Search in course'}
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {hasLessons ? (
          filteredChildren.length > 0 ? (
            <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {filteredChildren.map((child) => (
                <OutlineNode
                  key={child.node.id}
                  subtree={child}
                  level={0}
                  expanded={expanded}
                  toggle={onToggle}
                  onSelect={onSelect}
                  selectedId={selectedNodeId}
                  search={search}
                  onContextMenu={onContextMenu}
                />
              ))}
            </List>
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
    </Stack>
  );
}

export default function Tree({
  mode,
  courses,
  expanded,
  activeCourse,
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
}: TreeProps) {
  return (
    <Stack
      spacing={3}
      sx={{
        px: 3.5,
        py: 3,
        height: '100%',
        backgroundColor: 'action.hover',
        borderRight: '1px solid',
        borderColor: 'divider',
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
    </Stack>
  );
}
