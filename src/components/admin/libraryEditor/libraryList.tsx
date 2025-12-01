'use client';

import { Fragment, useEffect, useMemo, useState, useRef } from 'react';
import {
  Box,
  Button,
  IconButton,
  Stack,
  Typography,
  Tooltip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Chip,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ImageIcon from '@mui/icons-material/Image';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import NextImage from 'next/image';

import type { NodeSubtree, NodeType } from '@/types/course';
import { supabase } from '@/lib/supabaseClient';

const BUCKET = 'course-heroes';
function toPublicUrl(keyOrUrl?: string | null) {
  if (!keyOrUrl) return null;
  if (/^https?:\/\//i.test(keyOrUrl)) return keyOrUrl;
  let p = keyOrUrl.replace(/^\/+/, '');
  if (p.startsWith(`${BUCKET}/`)) p = p.slice(BUCKET.length + 1);
  return supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl ?? null;
}

type Props = {
  rootSubtree: NodeSubtree | null;
  selectedNodeId: number | null;
  onSelectNode: (nodeId: number) => void;

  onCreateNode: (parentId: number | null, payload: { node_type: NodeType; title: string }) => void;
  // onAttachChild was unused here; keep it in the parent component where it's actually used.
  onDetachChild: (parentId: number, childId: number) => void;
  onDuplicateNode: (nodeId: number) => void;
  onReorderChild: (parentId: number, childId: number, direction: 'up' | 'down') => void;

  getAvailableChildTypes: (parentId: number | null) => NodeType[];
  onOpenHeroDialog: (nodeId: number) => void;
};

type CtxState = {
  open: boolean;
  x: number;
  y: number;
  nodeId: number | null;
  parentId: number | null;
  nodeType: NodeType | null;
};

// --- helpers for status ---
type NodeState = 'published' | 'draft';
function getNodeState(node: NodeSubtree['node']): NodeState {
  const s = (node as { state?: string | null }).state;
  return s === 'published' ? 'published' : 'draft';
}
function StatusDot({ state }: { state: NodeState }) {
  const color = state === 'published' ? 'success.main' : 'text.disabled';
  const title = state === 'published' ? 'Published' : 'Draft';
  return (
    <Tooltip title={title}>
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: color,
          flexShrink: 0,
        }}
      />
    </Tooltip>
  );
}
function StatusChip({ state }: { state: NodeState }) {
  return (
    <Chip
      size="small"
      variant={state === 'published' ? 'filled' : 'outlined'}
      label={state === 'published' ? 'Published' : 'Draft'}
      color={state === 'published' ? 'success' : 'default'}
      sx={{
        height: 20,
        '& .MuiChip-label': { px: 0.75, py: 0 },
      }}
    />
  );
}

export default function LibraryList({
  rootSubtree,
  selectedNodeId,
  onSelectNode,
  onCreateNode,
  onDetachChild,
  onDuplicateNode,
  onReorderChild,
  getAvailableChildTypes,
  onOpenHeroDialog,
}: Props) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const children = useMemo(() => {
    if (!rootSubtree) return [] as NodeSubtree['children'];
    return [...rootSubtree.children].sort((a, b) => a.edge.position - b.edge.position);
  }, [rootSubtree]);

  // thumbs overlay
  const [heroMap, setHeroMap] = useState<Map<number, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    async function loadThumbs() {
      if (!rootSubtree) {
        setHeroMap(new Map());
        return;
      }
      const topIds = children.map((c) => c.subtree.node.id);
      // library: chapters under lessons
      const nestedIds = children
        .filter((c) => c.subtree.node.node_type === 'lesson')
        .flatMap((c) => c.subtree.children.map((cc) => cc.subtree.node.id));
      const ids = Array.from(new Set([...topIds, ...nestedIds]));
      if (!ids.length) {
        setHeroMap(new Map());
        return;
      }

      const { data, error } = await supabase
        .from('content_nodes')
        .select('id, hero_image')
        .in('id', ids);

      if (error || !data) {
        if (!cancelled) setHeroMap(new Map());
        return;
      }

      const next = new Map<number, string>();
      for (const row of data) {
        const url = toPublicUrl(row.hero_image);
        if (url) next.set(row.id, url);
      }
      if (!cancelled) setHeroMap(next);
    }
    loadThumbs();
    return () => {
      cancelled = true;
    };
  }, [rootSubtree, children]);

  // ---------- Name dialog ----------
  const [nameOpen, setNameOpen] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [pendingParentId, setPendingParentId] = useState<number | null>(null);
  const [pendingType, setPendingType] = useState<NodeType>('lesson');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenNameDialog = (parentId: number | null, nodeType: NodeType = 'lesson') => {
    setPendingParentId(parentId);
    setPendingType(nodeType);
    setNameValue('');
    setNameOpen(true);
  };

  const handleCloseNameDialog = () => {
    setNameOpen(false);
    setNameValue('');
    setPendingParentId(null);
  };

  const handleCreateWithName = () => {
    const trimmed = nameValue.trim();
    if (!trimmed) return;
    onCreateNode(pendingParentId ?? null, { node_type: pendingType, title: trimmed });
    handleCloseNameDialog();
  };

  useEffect(() => {
    if (nameOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [nameOpen]);

  // ---------- Context menu ----------
  const [ctx, setCtx] = useState<CtxState>({
    open: false,
    x: 0,
    y: 0,
    nodeId: null,
    parentId: null,
    nodeType: null,
  });

  const openContextMenu = (e: React.MouseEvent, nodeId: number, nodeType: NodeType, parentId: number | null) => {
    e.preventDefault();
    setCtx({ open: true, x: e.clientX, y: e.clientY, nodeId, parentId, nodeType });
  };
  const closeContextMenu = () => setCtx((s) => ({ ...s, open: false }));

  const handleCtxAddChild = (childType: NodeType) => {
    if (ctx.nodeId == null) return;
    handleOpenNameDialog(ctx.nodeId, childType);
    closeContextMenu();
  };

  const handleCtxDuplicate = () => {
    if (ctx.nodeId == null) return;
    onDuplicateNode(ctx.nodeId);
    closeContextMenu();
  };

  const handleCtxDetach = () => {
    if (ctx.parentId == null || ctx.nodeId == null) return;
    onDetachChild(ctx.parentId, ctx.nodeId);
    closeContextMenu();
  };

  if (!rootSubtree) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6">Library</Typography>
        <Typography variant="body2" color="text.secondary">
          No collections found.
        </Typography>
      </Box>
    );
  }

  const canAddLessonAtRoot = getAvailableChildTypes(rootSubtree.node.id).includes('lesson');

  return (
    <Stack sx={{ height: '100%', bgcolor: 'background.paper' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="h6" fontWeight={600}>Library</Typography>
          <Tooltip title="Change library hero">
            <IconButton size="small" onClick={() => onOpenHeroDialog(rootSubtree.node.id)}>
              <ImageIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" mb={2}>
          {rootSubtree.node.title || 'Untitled collection'}
        </Typography>

        {canAddLessonAtRoot && (
          <Button
            fullWidth
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenNameDialog(rootSubtree.node.id, 'lesson')}
          >
            New Lesson
          </Button>
        )}
      </Box>

      {/* Items List */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
        <Stack spacing={1}>
          {children.map(({ edge, subtree }) => {
            const isSelected = subtree.node.id === selectedNodeId;
            const isHovered = hoveredId === subtree.node.id;

            const title = subtree.node.title ?? undefined;
            const description =
              typeof subtree.node.description === 'string' ? subtree.node.description : undefined;

            const isLesson = subtree.node.node_type === 'lesson';
            const childRows = isLesson
              ? [...subtree.children].sort((a, b) => a.edge.position - b.edge.position)
              : [];
            const heroUrl = heroMap.get(subtree.node.id);
            const canAddChapterHere = isLesson && getAvailableChildTypes(subtree.node.id).includes('chapter');

            const state = getNodeState(subtree.node);

            return (
              <Fragment key={subtree.node.id}>
                <Box
                  onMouseEnter={() => setHoveredId(subtree.node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onSelectNode(subtree.node.id)}
                  onContextMenu={(e) => openContextMenu(e, subtree.node.id, subtree.node.node_type as NodeType, rootSubtree.node.id)}
                  sx={{
                    position: 'relative',
                    display: 'flex',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 2,
                    border: 1,
                    borderColor: isSelected ? 'primary.main' : 'divider',
                    bgcolor: (theme) =>
                      isSelected ? alpha(theme.palette.primary.main, 0.06) : theme.palette.background.paper,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      borderColor: isSelected ? 'primary.main' : 'grey.400',
                      bgcolor: (theme) =>
                        isSelected ? alpha(theme.palette.primary.main, 0.06) : theme.palette.grey[50],
                    },
                  }}
                >
                  {/* Drag Handle */}
                  <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.disabled', cursor: 'grab' }}>
                    <DragIndicatorIcon fontSize="small" />
                  </Box>

                  {/* Thumbnail */}
                  <Box
                    sx={{
                      position: 'relative',
                      width: 80,
                      height: 56,
                      borderRadius: 1,
                      bgcolor: 'grey.200',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    {heroUrl ? (
                      <NextImage
                        src={heroUrl}
                        alt={title || 'Item thumbnail'}
                        fill
                        sizes="80px"
                        style={{ objectFit: 'cover' }}
                      />
                    ) : (
                      <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ImageIcon sx={{ color: 'grey.400' }} />
                      </Box>
                    )}
                  </Box>

                  {/* Content */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <StatusDot state={state} />
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{
                          color: isSelected ? 'primary.main' : 'text.primary',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {title || (isLesson ? 'Untitled lesson' : 'Untitled item')}
                      </Typography>

                      {/* compact chip on the right for quick scan */}
                      <StatusChip state={state} />

                      {/* + Chapter (hover) */}
                      {isHovered && canAddChapterHere && (
                        <Tooltip title="Add chapter">
                          <span>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenNameDialog(subtree.node.id, 'chapter');
                              }}
                            >
                              <AddIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </Stack>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        mt: 0.5,
                      }}
                    >
                      {description || (isLesson ? 'Lesson' : 'Item')}
                    </Typography>
                  </Box>

                  {/* Actions */}
                  {isHovered && (
                    <Stack
                      direction="row"
                      spacing={0.5}
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        bgcolor: 'background.paper',
                        borderRadius: 1,
                        boxShadow: 1,
                        p: 0.5,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Tooltip title="Move up">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => onReorderChild(rootSubtree.node.id, subtree.node.id, 'up')}
                            disabled={edge.position === 0}
                          >
                            <ArrowUpwardIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Move down">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => onReorderChild(rootSubtree.node.id, subtree.node.id, 'down')}
                            disabled={edge.position === children.length - 1}
                          >
                            <ArrowDownwardIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Duplicate">
                        <IconButton size="small" onClick={() => onDuplicateNode(subtree.node.id)}>
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Change thumbnail">
                        <IconButton size="small" onClick={() => onOpenHeroDialog(subtree.node.id)}>
                          <ImageIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove from library">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => onDetachChild(rootSubtree.node.id, subtree.node.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  )}
                </Box>

                {/* Indented chapters under lessons */}
                {isLesson && childRows.length > 0 && (
                  <Box sx={{ pl: 4 }}>
                    <Stack spacing={1}>
                      {childRows.map(({ edge: chEdge, subtree: chTree }) => {
                        const chIsSelected = chTree.node.id === selectedNodeId;
                        const chIsHovered = hoveredId === chTree.node.id;

                        const chTitle = chTree.node.title ?? undefined;
                        const chDescription =
                          typeof chTree.node.description === 'string' ? chTree.node.description : undefined;
                        const chHeroUrl = heroMap.get(chTree.node.id);
                        const chState = getNodeState(chTree.node);

                        return (
                          <Box
                            key={chTree.node.id}
                            onMouseEnter={() => setHoveredId(chTree.node.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            onClick={() => onSelectNode(chTree.node.id)}
                            onContextMenu={(e) =>
                              openContextMenu(e, chTree.node.id, chTree.node.node_type as NodeType, subtree.node.id)
                            }
                            sx={{
                              position: 'relative',
                              display: 'flex',
                              gap: 1.5,
                              p: 1.5,
                              borderRadius: 2,
                              border: 1,
                              borderColor: chIsSelected ? 'primary.main' : 'divider',
                              bgcolor: (theme) =>
                                chIsSelected ? alpha(theme.palette.primary.main, 0.06) : theme.palette.background.paper,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              '&:hover': {
                                borderColor: chIsSelected ? 'primary.main' : 'grey.400',
                                bgcolor: (theme) =>
                                  chIsSelected ? alpha(theme.palette.primary.main, 0.06) : theme.palette.grey[50],
                              },
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.disabled', cursor: 'grab' }}>
                              <DragIndicatorIcon fontSize="small" />
                            </Box>

                            <Box
                              sx={{
                                position: 'relative',
                                width: 60,
                                height: 42,
                                borderRadius: 1,
                                bgcolor: 'grey.200',
                                overflow: 'hidden',
                                flexShrink: 0,
                              }}
                            >
                              {chHeroUrl ? (
                                <NextImage
                                  src={chHeroUrl}
                                  alt={chTitle || 'Item thumbnail'}
                                  fill
                                  sizes="60px"
                                  style={{ objectFit: 'cover' }}
                                />
                              ) : (
                                <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <ImageIcon sx={{ color: 'grey.400', fontSize: 20 }} />
                                </Box>
                              )}
                            </Box>

                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Stack direction="row" alignItems="center" spacing={1}>
                                <StatusDot state={chState} />
                                <Typography
                                  variant="body2"
                                  fontWeight={600}
                                  sx={{
                                    color: chIsSelected ? 'primary.main' : 'text.primary',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    flex: 1,
                                  }}
                                >
                                  {chTitle || 'Untitled chapter'}
                                </Typography>
                                <StatusChip state={chState} />
                              </Stack>

                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                  display: 'block',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  mt: 0.5,
                                }}
                              >
                                {chDescription || 'Chapter'}
                              </Typography>
                            </Box>

                            {chIsHovered && (
                              <Stack
                                direction="row"
                                spacing={0.5}
                                sx={{
                                  position: 'absolute',
                                  top: 8,
                                  right: 8,
                                  bgcolor: 'background.paper',
                                  borderRadius: 1,
                                  boxShadow: 1,
                                  p: 0.5,
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Tooltip title="Move up">
                                  <span>
                                    <IconButton
                                      size="small"
                                      onClick={() => onReorderChild(subtree.node.id, chTree.node.id, 'up')}
                                      disabled={chEdge.position === 0}
                                    >
                                      <ArrowUpwardIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                                <Tooltip title="Move down">
                                  <span>
                                    <IconButton
                                      size="small"
                                      onClick={() => onReorderChild(subtree.node.id, chTree.node.id, 'down')}
                                      disabled={chEdge.position === childRows.length - 1}
                                    >
                                      <ArrowDownwardIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                                <Tooltip title="Duplicate">
                                  <IconButton size="small" onClick={() => onDuplicateNode(chTree.node.id)}>
                                    <ContentCopyIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Remove from lesson">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => onDetachChild(subtree.node.id, chTree.node.id)}
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            )}
                          </Box>
                        );
                      })}
                    </Stack>
                  </Box>
                )}

                {edge.position < children.length - 1 && <Divider />}
              </Fragment>
            );
          })}
        </Stack>
      </Box>

      {/* Context Menu */}
      <Menu
        open={ctx.open}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={ctx.open ? { top: ctx.y, left: ctx.x } : undefined}
      >
        {/* Add options depend on node type + allowed child types */}
        {ctx.nodeId != null && ctx.nodeType === 'lesson' && getAvailableChildTypes(ctx.nodeId).includes('chapter') && (
          <MenuItem onClick={() => handleCtxAddChild('chapter')}>
            <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Add chapter" />
          </MenuItem>
        )}

        {ctx.nodeId != null && ctx.nodeType === 'chapter' && (() => {
          const avail = getAvailableChildTypes(ctx.nodeId);
          if (avail.length === 0) return null;
          return avail.map((t) => (
            <MenuItem key={t} onClick={() => handleCtxAddChild(t)}>
              <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary={`Add ${t}`} />
            </MenuItem>
          ));
        })()}

        {ctx.nodeId != null && (
          <MenuItem onClick={handleCtxDuplicate}>
            <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Duplicate" />
          </MenuItem>
        )}

        {ctx.nodeId != null && (
          <MenuItem
            onClick={() => {
              onOpenHeroDialog(ctx.nodeId!);
              closeContextMenu();
            }}
          >
            <ListItemIcon><ImageIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Change thumbnail" />
          </MenuItem>
        )}

        {ctx.nodeId != null && ctx.parentId != null && (
          <MenuItem onClick={handleCtxDetach} sx={{ color: 'error.main' }}>
            <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText primary={ctx.nodeType === 'chapter' ? 'Remove from lesson' : 'Remove from library'} />
          </MenuItem>
        )}
      </Menu>

      {/* Name dialog */}
      <Dialog open={nameOpen} onClose={handleCloseNameDialog} fullWidth maxWidth="xs">
        <DialogTitle>
          {pendingType === 'lesson' ? 'Name new lesson' : pendingType === 'chapter' ? 'Name new chapter' : 'Name new item'}
        </DialogTitle>
        <DialogContent>
          <TextField
            inputRef={inputRef}
            autoFocus
            fullWidth
            margin="dense"
            label="Title"
            placeholder={
              pendingType === 'lesson'
                ? 'e.g. Negotiation Basics'
                : pendingType === 'chapter'
                ? 'e.g. Framing the Offer'
                : 'e.g. New item'
            }
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && nameValue.trim()) {
                e.preventDefault();
                handleCreateWithName();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseNameDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateWithName} disabled={!nameValue.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
