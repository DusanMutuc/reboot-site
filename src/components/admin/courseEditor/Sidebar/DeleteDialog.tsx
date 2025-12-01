'use client';

import { useMemo } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import type { NodeSubtree } from '@/types/course';

export type DeleteDialogProps = {
  open: boolean;
  subtree: NodeSubtree | null;
  onClose: () => void;
  onConfirm: (nodeId: number) => void;
};

function collectStats(subtree: NodeSubtree) {
  const nodeCounts = new Map<string, number>();
  const blockCounts = new Map<string, number>();

  const walk = (node: NodeSubtree) => {
    const type = node.node.node_type ?? 'unknown';
    nodeCounts.set(type, (nodeCounts.get(type) ?? 0) + 1);
    for (const block of node.blocks) {
      const key = block.block_type ?? 'unknown';
      blockCounts.set(key, (blockCounts.get(key) ?? 0) + 1);
    }
    for (const child of node.children) {
      walk(child.subtree);
    }
  };

  walk(subtree);

  return {
    nodes: Array.from(nodeCounts.entries()).map(([type, count]) => ({ type, count })),
    blocks: Array.from(blockCounts.entries()).map(([type, count]) => ({ type, count })),
  };
}

export default function DeleteDialog({ open, subtree, onClose, onConfirm }: DeleteDialogProps) {
  const stats = useMemo(() => (subtree ? collectStats(subtree) : null), [subtree]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Delete node</DialogTitle>
      <DialogContent dividers>
        {subtree ? (
          <Stack spacing={2}>
            <Alert severity="warning">
              Deleting <strong>{subtree.node.title ?? 'this node'}</strong> will also remove the following:
            </Alert>
            <Stack spacing={1}>
              {stats?.nodes.map(({ type, count }) => (
                <Typography key={type}>
                  {count} × {type}
                </Typography>
              ))}
              {stats?.blocks.map(({ type, count }) => (
                <Typography key={`block-${type}`}>
                  {count} × {type} blocks
                </Typography>
              ))}
            </Stack>
            <Alert severity="error">This action cannot be undone.</Alert>
          </Stack>
        ) : (
          <Stack alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={24} />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" onClick={() => subtree && onConfirm(subtree.node.id)}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
