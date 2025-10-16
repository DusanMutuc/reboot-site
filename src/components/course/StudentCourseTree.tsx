'use client';

import { useCallback, useMemo, useState } from 'react';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderIcon from '@mui/icons-material/Folder';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { Collapse, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Stack, Tooltip } from '@mui/material';

import type { ChildUnlockStatus, NodeSubtree } from '@/types/course';

export type StudentCourseTreeProps = {
  tree: NodeSubtree;
  selectedNodeId: number | null;
  onSelectLesson: (node: NodeSubtree) => void;
  unlockStatus?: ReadonlyMap<number, ChildUnlockStatus> | ChildUnlockStatus[];
};

type TreeNodeProps = {
  node: NodeSubtree;
  depth: number;
  selectedNodeId: number | null;
  onSelectLesson: (node: NodeSubtree) => void;
  unlockMap: ReadonlyMap<number, ChildUnlockStatus>;
};

function buildUnlockMap(status?: ReadonlyMap<number, ChildUnlockStatus> | ChildUnlockStatus[]) {
  if (!status) {
    return new Map<number, ChildUnlockStatus>();
  }

  if (status instanceof Map) {
    return status;
  }

  return status.reduce((map, entry) => {
    map.set(entry.child_id, entry);
    return map;
  }, new Map<number, ChildUnlockStatus>());
}

function isLeafNode(node: NodeSubtree) {
  return node.children.length === 0;
}

function getIconForNode(node: NodeSubtree, selectable: boolean) {
  if (node.node.node_type === 'lesson') {
    return <MenuBookIcon fontSize="small" color={selectable ? 'primary' : undefined} />;
  }

  if (node.node.node_type === 'chapter') {
    return <PlayArrowIcon fontSize="small" color={selectable ? 'primary' : undefined} />;
  }

  return <FolderIcon fontSize="small" color={selectable ? 'primary' : undefined} />;
}

function TreeNode({ node, depth, selectedNodeId, onSelectLesson, unlockMap }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const unlock = unlockMap.get(node.node.id);
  const locked = unlock?.locked ?? false;
  const reason = unlock?.reason ?? null;

  const selectable = !locked && isLeafNode(node);
  const hasChildren = node.children.length > 0;

  const handleClick = useCallback(() => {
    if (locked) {
      if (hasChildren && !isLeafNode(node)) {
        setExpanded((prev) => !prev);
      }
      return;
    }

    if (isLeafNode(node)) {
      onSelectLesson(node);
      return;
    }

    if (hasChildren) {
      setExpanded((prev) => !prev);
    }
  }, [hasChildren, locked, node, onSelectLesson]);

  const content = (
    <ListItemButton
      onClick={handleClick}
      sx={{
        pl: depth * 2,
        borderRadius: 1,
        mb: 0.25,
        bgcolor: node.node.id === selectedNodeId ? 'primary.50' : undefined,
        cursor: locked && !hasChildren ? 'not-allowed' : undefined,
      }}
      selected={node.node.id === selectedNodeId}
      aria-disabled={locked}
    >
      {hasChildren ? (
        <IconButton size="small" edge="start" sx={{ mr: 1 }}>
          {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </IconButton>
      ) : (
        <span style={{ width: 32 }} />
      )}

      <ListItemIcon sx={{ minWidth: 32 }}>{getIconForNode(node, selectable)}</ListItemIcon>
      <ListItemText
        primary={node.node.title || 'Untitled node'}
        primaryTypographyProps={{
          fontWeight: node.node.id === selectedNodeId ? 600 : 500,
          color: locked ? 'text.disabled' : 'text.primary',
        }}
      />
      {locked && (
        <LockOutlinedIcon fontSize="small" color="action" sx={{ ml: 1 }} />
      )}
    </ListItemButton>
  );

  return (
    <Stack spacing={0.25}>
      {locked && reason ? (
        <Tooltip title={reason} placement="right">
          <span>{content}</span>
        </Tooltip>
      ) : (
        content
      )}

      {node.children.length > 0 && (
        <Collapse in={expanded && !isLeafNode(node)} timeout="auto" unmountOnExit>
          <List disablePadding>
            {node.children.map(({ subtree }) => (
              <TreeNode
                key={subtree.node.id}
                node={subtree}
                depth={depth + 1}
                onSelectLesson={onSelectLesson}
                selectedNodeId={selectedNodeId}
                unlockMap={unlockMap}
              />
            ))}
          </List>
        </Collapse>
      )}
    </Stack>
  );
}

export function StudentCourseTree({ tree, selectedNodeId, onSelectLesson, unlockStatus }: StudentCourseTreeProps) {
  const unlockMap = useMemo(() => buildUnlockMap(unlockStatus), [unlockStatus]);

  return (
    <List disablePadding>
      <TreeNode
        node={tree}
        depth={0}
        selectedNodeId={selectedNodeId}
        onSelectLesson={onSelectLesson}
        unlockMap={unlockMap}
      />
    </List>
  );
}

export default StudentCourseTree;
