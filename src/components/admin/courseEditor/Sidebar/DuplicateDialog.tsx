'use client';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';

export type DuplicateDialogProps = {
  open: boolean;
  nodeId: number | null;
  onClose: () => void;
  onConfirm: (nodeId: number) => void;
};

export default function DuplicateDialog({ open, nodeId, onClose, onConfirm }: DuplicateDialogProps) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Duplicate node</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body1">Duplicate this node and attach the copy to the same parent?</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => nodeId && onConfirm(nodeId)}>Duplicate</Button>
      </DialogActions>
    </Dialog>
  );
}
