'use client';

import { type ReactElement, type ReactNode, useMemo } from 'react';
import { alpha, type Theme } from '@mui/material/styles';
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
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ArticleIcon from '@mui/icons-material/Article';
import LayersIcon from '@mui/icons-material/Layers';
import CollectionsBookmarkIcon from '@mui/icons-material/CollectionsBookmark';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import StorageIcon from '@mui/icons-material/Storage';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AddIcon from '@mui/icons-material/Add';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import ViewAgendaIcon from '@mui/icons-material/ViewAgenda';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

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
  const isChapter = subtree.node.node_type === 'chapter';
  const isLesson = subtree.node.node_type === 'lesson';

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
            py: 1.2,
            pl: `calc(${level} * 24px + 16px)`,
            pr: 1.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: isChapter
              ? (theme) => alpha(theme.palette.primary.main, 0.18)
              : 'transparent',
            backgroundColor: isChapter
              ? (theme) => alpha(theme.palette.primary.main, 0.08)
              : 'transparent',
            boxShadow: isLesson
              ? 'inset 0 0 0 1px rgba(145, 158, 171, 0.12)'
              : 'none',
            '&.Mui-selected': {
              backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.1),
              '&:hover': {
                backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.15),
              },
            },
            '&:hover': {
              backgroundColor: (theme) =>
                alpha(theme.palette.primary.main, isChapter ? 0.12 : 0.06),
              borderColor: (theme) =>
                alpha(theme.palette.primary.main, isChapter ? 0.24 : 0.18),
              boxShadow: isLesson ? 'inset 0 0 0 1px rgba(145, 158, 171, 0.24)' : 'none',
            },
            transition: 'background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
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
                color: 'text.secondary',
                transition: 'transform 180ms ease',
                transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
              }}
              aria-label={isExpanded ? 'Collapse section' : 'Expand section'}
            >
              <ExpandMoreIcon fontSize="small" />
            </IconButton>
          ) : (
            <Box sx={{ width: 32 }} />
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>{
              getNodeIcon(subtree.node.node_type)
            }</Box>
            <Typography variant={labelVariant} noWrap sx={{ fontWeight: subtree.node.node_type === 'lesson' ? 600 : 500 }}>
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
        <Typography variant="subtitle1" gutterBottom>
          Courses
        </Typography>
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
  course,
  stats,
  onBack,
  onExpandAll,
  onCollapseAll,
  onQuickAddLesson,
  onQuickAddChapter,
  onQuickAddBlock,
  canAddLesson,
  canAddChapter,
  canAddBlock,
}: {
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
}) {
  const courseState = (course.node.state ?? 'draft').toLowerCase();
  const stateLabel = courseState.replace(/\b\w/g, (char) => char.toUpperCase());
  const stateChipStyles =
    courseState === 'published'
      ? {
          backgroundColor: (theme: Theme) => alpha(theme.palette.success.main, 0.16),
          color: 'success.dark',
        }
      : {
          backgroundColor: (theme: Theme) => alpha(theme.palette.warning.main, 0.18),
          color: 'warning.dark',
        };

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Button
          size="small"
          startIcon={<ArrowBackIcon />}
          onClick={onBack}
          variant="text"
          sx={{ fontWeight: 600, color: 'text.secondary' }}
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
      <Stack spacing={1.5}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {course.node.title ?? 'Untitled course'}
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
          <Chip
            size="small"
            label={`${courseState === 'published' ? '✅' : '📝'} ${stateLabel}`}
            sx={{
              fontWeight: 600,
              ...stateChipStyles,
            }}
          />
          <Chip
            size="small"
            label={`📄 ${stats.lessons} lesson${stats.lessons === 1 ? '' : 's'}`}
            sx={{
              fontWeight: 600,
              backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.12),
              color: 'primary.main',
            }}
          />
          <Chip
            size="small"
            label={`📚 ${stats.chapters} chapter${stats.chapters === 1 ? '' : 's'}`}
            sx={{
              fontWeight: 600,
              backgroundColor: (theme) => alpha(theme.palette.info.main, 0.12),
              color: 'info.main',
            }}
          />
        </Stack>
      </Stack>
      <Stack direction="row" spacing={1.5} flexWrap="wrap">
        <Button
          size="small"
          variant="contained"
          color="primary"
          startIcon={<ArticleOutlinedIcon fontSize="small" />}
          onClick={onQuickAddLesson}
          disabled={!canAddLesson}
          sx={{ px: 2.5, fontWeight: 600 }}
        >
          + Lesson
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<LibraryAddIcon fontSize="small" />}
          onClick={onQuickAddChapter}
          disabled={!canAddChapter}
          sx={{ px: 2.5, fontWeight: 600 }}
        >
          + Chapter
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<ViewAgendaIcon fontSize="small" />}
          onClick={onQuickAddBlock}
          disabled={!canAddBlock}
          sx={{ px: 2.5, fontWeight: 600 }}
        >
          + Block
        </Button>
      </Stack>
    </Stack>
  );
}

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

  let contextualMessage: string | null = null;
  if (!search && selectedSubtree) {
    if (selectedSubtree.node.node_type === 'lesson' && selectedSubtree.children.length === 0) {
      contextualMessage = 'Add chapters to structure this lesson.';
    } else if (selectedSubtree.node.node_type === 'chapter' && selectedSubtree.children.length === 0) {
      contextualMessage = 'This chapter has no content yet. Use the + Block action to add content.';
    }
  }

  return (
    <Stack spacing={3} sx={{ height: '100%' }}>
      <OutlineHeader
        course={course}
        stats={stats}
        onBack={onBack}
        onExpandAll={onExpandAll}
        onCollapseAll={onCollapseAll}
        onQuickAddLesson={onQuickAddLesson}
        onQuickAddChapter={onQuickAddChapter}
        onQuickAddBlock={onQuickAddBlock}
        canAddLesson={canAddLesson}
        canAddChapter={canAddChapter}
        canAddBlock={canAddBlock}
      />
      <TextField
        size="small"
        fullWidth
        placeholder="Search in course"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 2,
            backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.9),
            transition: 'box-shadow 160ms ease, border-color 160ms ease',
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: 'primary.light',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: 'primary.main',
              boxShadow: (theme) => `0 0 0 3px ${alpha(theme.palette.primary.main, 0.18)}`,
            },
          },
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'divider',
          },
          '& .MuiInputAdornment-root': {
            color: 'text.secondary',
          },
        }}
      />
      {contextualMessage ? (
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          sx={{
            p: 1.5,
            borderRadius: 2,
            backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
          }}
        >
          <InfoOutlinedIcon color="primary" fontSize="small" />
          <Typography variant="body2" color="text.secondary">
            {contextualMessage}
          </Typography>
        </Stack>
      ) : null}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {hasLessons ? (
          filteredChildren.length > 0 ? (
            <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
            <Stack
              spacing={1}
              alignItems="center"
              justifyContent="center"
              sx={{
                borderRadius: 3,
                border: '1px dashed',
                borderColor: 'divider',
                py: 4,
                px: 3,
                color: 'text.secondary',
              }}
            >
              <SearchIcon color="primary" />
              <Typography variant="subtitle2">No matches in this course.</Typography>
              <Typography variant="body2" color="text.secondary" align="center">
                Try a different keyword or clear your search to see all lessons and chapters.
              </Typography>
            </Stack>
          )
        ) : (
          <Stack
            spacing={1.5}
            alignItems="center"
            justifyContent="center"
            sx={{
              borderRadius: 3,
              border: '1px dashed',
              borderColor: 'divider',
              py: 5,
              px: 3,
              textAlign: 'center',
              backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.04),
            }}
          >
            <InfoOutlinedIcon color="primary" sx={{ fontSize: 32 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Start building your course
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Add your first lesson to outline the journey learners will take.
            </Typography>
          </Stack>
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
}: TreeProps) {
  return (
    <Stack spacing={3} sx={{ p: 3, height: '100%' }}>
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
