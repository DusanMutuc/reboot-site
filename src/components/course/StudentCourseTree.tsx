'use client';

import React, { useMemo } from 'react';
import {
  Box,
  Button,
  Collapse,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ArticleIcon from '@mui/icons-material/Article';
import LayersIcon from '@mui/icons-material/Layers';
import CollectionsBookmarkIcon from '@mui/icons-material/CollectionsBookmark';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

import type { ChildUnlockStatus, NodeSubtree } from '@/types/course';

const NODE_ICONS: Record<string, React.ReactNode> = {
  course: <MenuBookIcon fontSize="small" />,
  lesson: <ArticleIcon fontSize="small" />,
  chapter: <LayersIcon fontSize="small" />,
  collection: <CollectionsBookmarkIcon fontSize="small" />,
  playlist: <PlaylistPlayIcon fontSize="small" />,
};

type StudentCourseTreeProps = {
  course: NodeSubtree;
  expanded: Set<number>;
  selectedNodeId: number | null;
  lockStatuses: Record<number, Record<number, ChildUnlockStatus>>;
  onToggle: (nodeId: number) => void;
  onSelectContent: (node: NodeSubtree, lockStatus: ChildUnlockStatus | undefined) => void;
  onBackToCourses: () => void;
  fullHeight?: boolean;
  /** Disable expand/collapse animations (avoids “re-expanding” flicker on nav) */
  noTransition?: boolean;
};

type TreeNodeProps = {
  subtree: NodeSubtree;
  depth: number;
  expanded: Set<number>;
  lockStatuses: Record<number, Record<number, ChildUnlockStatus>>;
  selectedNodeId: number | null;
  parentId: number | null;
  /** True if any ancestor up the chain is locked */
  ancestorLocked?: boolean;
  onToggle: (nodeId: number) => void;
  onSelectContent: (node: NodeSubtree, lockStatus: ChildUnlockStatus | undefined) => void;
  prefetchBlocks: (nodeId: number) => void;
  noTransition?: boolean;
};

function TreeNode({
  subtree,
  depth,
  expanded,
  lockStatuses,
  selectedNodeId,
  parentId,
  ancestorLocked = false,
  onToggle,
  onSelectContent,
  prefetchBlocks,
  noTransition = false,
}: TreeNodeProps) {
  const { node } = subtree;
  const hasChildren = subtree.children.length > 0;
  const isExpanded = expanded.has(node.id);

  // Lock state for THIS node relative to its parent
  const lockStatus = parentId != null ? lockStatuses[parentId]?.[node.id] : undefined;
  const isLockedSelf = !!lockStatus?.locked;

  // Effective lock = this node locked OR any ancestor locked
  const isLocked = ancestorLocked || isLockedSelf;

  const icon = NODE_ICONS[node.node_type] ?? NODE_ICONS.lesson;
  const isSelected = selectedNodeId === node.id;
  const paddingLeft = 2 + depth * 2;
  const isContentNode = node.node_type === 'lesson' || node.node_type === 'chapter';
  const canPrefetch = isContentNode && !isLocked;

  const handleClick = () => {
    if (isLocked) return; // prevent navigation into locked nodes

    if (isContentNode) {
      if (canPrefetch) prefetchBlocks(node.id); // warm request just before navigate
      onSelectContent(subtree, lockStatus);
      if (!hasChildren) return;
    }
    if (hasChildren && !isExpanded) onToggle(node.id);
  };

  const item = (
    <ListItemButton
      onClick={handleClick}
      onMouseEnter={() => { if (canPrefetch) prefetchBlocks(node.id); }}
      onFocus={() => { if (canPrefetch) prefetchBlocks(node.id); }}
      selected={isSelected}
      sx={{
        pl: paddingLeft,
        pr: 2,
        alignItems: 'center',
        opacity: isLocked ? 0.65 : 1,
        '&.Mui-selected': {
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
          '&:hover': {
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.18),
          },
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 40, mr: 1 }}>
        {hasChildren ? (
          <IconButton
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node.id);
            }}
            sx={{ mr: 0.5 }}
          >
            {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
          </IconButton>
        ) : null}
        <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}>{icon}</Box>
      </Box>

      <ListItemText
        primary={node.title ?? 'Untitled'}
        primaryTypographyProps={{
          variant: isContentNode ? 'body1' : 'subtitle2',
          fontWeight: isContentNode ? 600 : 500,
        }}
      />

      {isLocked ? (
        <Tooltip title={lockStatus?.reason ?? 'This lesson is locked until prerequisites are complete.'}>
          <LockOutlinedIcon fontSize="small" sx={{ color: 'text.disabled' }} />
        </Tooltip>
      ) : null}
    </ListItemButton>
  );

  return (
    <>
      {item}
      {hasChildren ? (
        <Collapse
          in={isExpanded}
          timeout={noTransition ? 0 : 'auto'}
          unmountOnExit={false}
          appear={!noTransition}
        >
          <List disablePadding>
            {subtree.children.map((child) => (
              <TreeNode
                key={child.subtree.node.id}
                subtree={child.subtree}
                depth={depth + 1}
                expanded={expanded}
                lockStatuses={lockStatuses}
                selectedNodeId={selectedNodeId}
                parentId={subtree.node.id}
                ancestorLocked={isLocked} // propagate effective lock to descendants
                onToggle={onToggle}
                onSelectContent={onSelectContent}
                prefetchBlocks={prefetchBlocks}
                noTransition={noTransition}
              />
            ))}
          </List>
        </Collapse>
      ) : null}
    </>
  );
}

export default function StudentCourseTree({
  course,
  expanded,
  selectedNodeId,
  lockStatuses,
  onToggle,
  onSelectContent,
  onBackToCourses,
  fullHeight = true,
  noTransition = false,
}: StudentCourseTreeProps) {
  const sequentialUnlock = !!course.node.sequential_unlock;
  const childLocks = useMemo(() => lockStatuses[course.node.id] ?? {}, [course.node.id, lockStatuses]);
  const unlockedCount = useMemo(
    () => Object.values(childLocks).filter((status) => !status.locked).length,
    [childLocks],
  );

  // Fire-and-forget prefetcher; uses HTTP conditional cache (ETag)
  const prefetchBlocks = (nodeId: number) => {
    const run = () => { void fetch(`/api/nodes/${nodeId}/blocks`).catch(() => {}); };
    if (typeof window !== 'undefined') {
      const ric = (window as any).requestIdleCallback as
        | undefined
        | ((cb: () => void, opts?: { timeout: number }) => number);
      if (ric) {
        ric(run, { timeout: 500 });
        return;
      }
    }
    run();
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: fullHeight ? '100%' : 'auto',
        borderRight: fullHeight ? '1px solid' : 'none',
        borderBottom: fullHeight ? 'none' : '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBackToCourses} size="small" sx={{ mb: 1 }}>
          All courses
        </Button>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {course.node.title ?? 'Untitled course'}
        </Typography>
        {course.node.description ? (
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {course.node.description}
          </Typography>
        ) : null}
        {sequentialUnlock ? (
          <Typography variant="body2" sx={{ mt: 1 }} color="text.secondary">
            Lessons unlock sequentially. {unlockedCount} unlocked so far.
          </Typography>
        ) : null}
      </Box>

      <Box sx={{ flex: fullHeight ? 1 : undefined, overflowY: 'auto', maxHeight: fullHeight ? undefined : 360 }}>
        <List disablePadding>
          {course.children.map((child) => (
            <TreeNode
              key={child.subtree.node.id}
              subtree={child.subtree}
              depth={0}
              expanded={expanded}
              lockStatuses={lockStatuses}
              selectedNodeId={selectedNodeId}
              parentId={course.node.id}
              onToggle={onToggle}
              onSelectContent={onSelectContent}
              prefetchBlocks={prefetchBlocks}
              noTransition={noTransition}
            />
          ))}
        </List>
      </Box>
    </Box>
  );
}
