'use client';

import { useMemo, type ReactElement } from 'react';
import {
  Box,
  Chip,
  IconButton,
  InputAdornment,
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

import type { NodeSubtree } from '@/types/course';

const NODE_ICONS: Record<string, ReactElement> = {
  course: <MenuBookIcon fontSize="small" />,
  lesson: <ArticleIcon fontSize="small" />,
  chapter: <LayersIcon fontSize="small" />,
  collection: <CollectionsBookmarkIcon fontSize="small" />,
  playlist: <PlaylistPlayIcon fontSize="small" />,
};

export type TreeProps = {
  trees: NodeSubtree[];
  expanded: Set<number>;
  search: string;
  selectedNodeId: number | null;
  onSearchChange: (value: string) => void;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
  onContextMenu: (event: React.MouseEvent<HTMLElement>, nodeId: number) => void;
};

function matchesQuery(value: string | null | undefined, query: string) {
  if (!query) return true;
  return (value ?? '').toLowerCase().includes(query.toLowerCase());
}

function TreeNode({
  subtree,
  level,
  expanded,
  toggle,
  onSelect,
  selectedId,
  search,
  onContextMenu,
}: {
  subtree: NodeSubtree;
  level: number;
  expanded: Set<number>;
  toggle: (id: number) => void;
  onSelect: (id: number) => void;
  selectedId: number | null;
  search: string;
  onContextMenu: (event: React.MouseEvent<HTMLElement>, nodeId: number) => void;
}) {
  const hasChildren = subtree.children.length > 0;
  const isExpanded = expanded.has(subtree.node.id) || (!!search && hasChildren);
  const matches = matchesQuery(subtree.node.title, search);
  const childMatches = useMemo(
    () => subtree.children.some((child) => matchesQuery(child.subtree.node.title, search)),
    [subtree.children, search],
  );

  if (search && !matches && !childMatches) {
    return null;
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ pl: level * 1.5, py: 0.5 }}>
        {hasChildren ? (
          <IconButton size="small" onClick={() => toggle(subtree.node.id)}>
            {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
          </IconButton>
        ) : (
          <Box sx={{ width: 32 }} />
        )}
        <Tooltip title={subtree.node.title ?? 'Untitled node'} placement="right">
          <Chip
            size="small"
            icon={NODE_ICONS[subtree.node.node_type] ?? <StorageIcon fontSize="small" />}
            label={subtree.node.title ?? 'Untitled'}
            color={selectedId === subtree.node.id ? 'primary' : 'default'}
            onClick={() => onSelect(subtree.node.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              onContextMenu(event, subtree.node.id);
            }}
            sx={{
              maxWidth: '100%',
              '& .MuiChip-label': {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              },
            }}
          />
        </Tooltip>
      </Stack>
      {hasChildren && isExpanded && (
        <Box>
          {subtree.children.map((child) => (
            <TreeNode
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
      )}
    </Box>
  );
}

export default function Tree({
  trees,
  expanded,
  search,
  selectedNodeId,
  onSearchChange,
  onToggle,
  onSelect,
  onContextMenu,
}: TreeProps) {
  return (
    <Stack spacing={2} sx={{ p: 3, height: '100%' }}>
      <Box>
        <Typography variant="subtitle1" gutterBottom>
          Course structure
        </Typography>
        <TextField
          size="small"
          placeholder="Search nodes"
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
        {trees.length === 0 ? (
          <Typography color="text.secondary">No nodes available.</Typography>
        ) : (
          trees.map((subtree) => (
            <TreeNode
              key={subtree.node.id}
              subtree={subtree}
              level={0}
              expanded={expanded}
              toggle={onToggle}
              onSelect={onSelect}
              selectedId={selectedNodeId}
              search={search}
              onContextMenu={onContextMenu}
            />
          ))
        )}
      </Box>
    </Stack>
  );
}
