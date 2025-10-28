'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  Stack,
  Typography,
  Tooltip,
  Divider,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ImageIcon from '@mui/icons-material/Image';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

import type { NodeSubtree, NodeType } from '@/types/course';
import { supabase } from '@/lib/supabaseClient';

// --- same resolver style you use in the student view ---
const BUCKET = 'course-heroes';
function toPublicUrl(keyOrUrl?: string | null) {
  if (!keyOrUrl) return null;
  if (/^https?:\/\//i.test(keyOrUrl)) return keyOrUrl;
  // strip leading slashes and accidental "course-heroes/" prefix
  let p = keyOrUrl.replace(/^\/+/, '');
  if (p.startsWith(`${BUCKET}/`)) p = p.slice(BUCKET.length + 1);
  return supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl ?? null;
}

type Props = {
  rootSubtree: NodeSubtree | null;
  selectedNodeId: number | null;
  onSelectNode: (nodeId: number) => void;

  onCreateNode: (parentId: number | null, payload: { node_type: NodeType; title: string }) => void;
  onAttachChild: (parentId: number, childId: number) => void;
  onDetachChild: (parentId: number, childId: number) => void;
  onDuplicateNode: (nodeId: number) => void;
  onReorderChild: (parentId: number, childId: number, direction: 'up' | 'down') => void;

  getAvailableChildTypes: (parentId: number | null) => NodeType[];
  onOpenHeroDialog: (nodeId: number) => void;
};

export default function LibraryList({
  rootSubtree,
  selectedNodeId,
  onSelectNode,
  onCreateNode,
  onAttachChild,
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

  // -------- NEW: client-side image overlay (id -> public URL) --------
  const [heroMap, setHeroMap] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    async function loadThumbs() {
      if (!rootSubtree) {
        setHeroMap(new Map());
        return;
      }
      // collect visible node ids (top-level + one nested level for chapters)
      const topIds = children.map(c => c.subtree.node.id);
      const nestedIds = children
        .filter(c => c.subtree.node.node_type === 'chapter')
        .flatMap(c => c.subtree.children.map(cc => cc.subtree.node.id));
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
    return () => { cancelled = true; };
  }, [rootSubtree, children]);

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
          <Typography variant="h6" fontWeight={600}>
            Library
          </Typography>
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
            onClick={() =>
              onCreateNode(rootSubtree.node.id, {
                node_type: 'lesson',
                title: 'New Item',
              })
            }
          >
            New Item
          </Button>
        )}
      </Box>

      {/* Items List */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
        <Stack spacing={1}>
          {children.map(({ edge, subtree }) => {
            const isSelected = subtree.node.id === selectedNodeId;
            const isHovered = hoveredId === subtree.node.id;

            const title = subtree.node.title as string | undefined;
            const description = (subtree.node as any).description as string | undefined;
            const isChapter = subtree.node.node_type === 'chapter';
            const childRows = isChapter
              ? [...subtree.children].sort((a, b) => a.edge.position - b.edge.position)
              : [];

            // pull resolved URL from the overlay
            const heroUrl = heroMap.get(subtree.node.id);

            return (
              <Fragment key={subtree.node.id}>
                <Box
                  onMouseEnter={() => setHoveredId(subtree.node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onSelectNode(subtree.node.id)}
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
                      width: 80,
                      height: 56,
                      borderRadius: 1,
                      bgcolor: 'grey.200',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    {heroUrl ? (
                      <img
                        src={heroUrl}
                        alt={title || 'Item thumbnail'}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ImageIcon sx={{ color: 'grey.400' }} />
                      </Box>
                    )}
                  </Box>

                  {/* Content */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      sx={{
                        color: isSelected ? 'primary.main' : 'text.primary',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {title || (isChapter ? 'Untitled section' : 'Untitled item')}
                    </Typography>
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
                      {description || (isChapter ? 'Section' : 'Page')}
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

                {/* Indented children for chapters */}
                {isChapter && childRows.length > 0 && (
                  <Box sx={{ pl: 4 }}>
                    <Stack spacing={1}>
                      {childRows.map(({ edge: chEdge, subtree: chTree }) => {
                        const chIsSelected = chTree.node.id === selectedNodeId;
                        const chIsHovered = hoveredId === chTree.node.id;

                        const chTitle = chTree.node.title as string | undefined;
                        const chDescription = (chTree.node as any).description as string | undefined;

                        const chHeroUrl = heroMap.get(chTree.node.id);

                        return (
                          <Box
                            key={chTree.node.id}
                            onMouseEnter={() => setHoveredId(chTree.node.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            onClick={() => onSelectNode(chTree.node.id)}
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

                            <Box sx={{ width: 60, height: 42, borderRadius: 1, bgcolor: 'grey.200', overflow: 'hidden', flexShrink: 0 }}>
                              {chHeroUrl ? (
                                <img
                                  src={chHeroUrl}
                                  alt={chTitle || 'Item thumbnail'}
                                  loading="lazy"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <ImageIcon sx={{ color: 'grey.400', fontSize: 20 }} />
                                </Box>
                              )}
                            </Box>

                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography
                                variant="body2"
                                fontWeight={600}
                                sx={{
                                  color: chIsSelected ? 'primary.main' : 'text.primary',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {chTitle || 'Untitled page'}
                              </Typography>
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
                                {chDescription || 'Page'}
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
                                <Tooltip title="Remove from section">
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
    </Stack>
  );
}
