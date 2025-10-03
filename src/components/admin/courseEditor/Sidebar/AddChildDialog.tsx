'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import type { ContentNode, NodeType } from '@/types/course';

export type AddChildDialogProps = {
  open: boolean;
  mode: 'create' | 'attach';
  parentId: number | null;
  type?: NodeType;
  availableTypes: NodeType[];
  searchResults: { loading: boolean; rows: ContentNode[]; error?: string };
  attachQuery: string;
  onAttachQueryChange: (value: string) => void;
  onClose: () => void;
  onCreate: (title: string, type: NodeType) => void;
  onAttach: (childId: number) => void;
};

export default function AddChildDialog({
  open,
  mode,
  type,
  availableTypes,
  searchResults,
  attachQuery,
  onAttachQueryChange,
  onClose,
  onCreate,
  onAttach,
}: AddChildDialogProps) {
  const [title, setTitle] = useState('');
  const [selectedType, setSelectedType] = useState<NodeType>('lesson');

  useEffect(() => {
    if (type && availableTypes.includes(type as NodeType)) {
      setSelectedType(type as NodeType);
    } else if (availableTypes.length > 0) {
      setSelectedType(availableTypes[0]);
    }
  }, [type, availableTypes]);

  useEffect(() => {
    if (!open) {
      setTitle('');
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{mode === 'create' ? 'Create child node' : 'Attach existing node'}</DialogTitle>
      <DialogContent dividers>
        {mode === 'create' ? (
          <Stack spacing={2}>
            <TextField
              select
              label="Child type"
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value as NodeType)}
            >
              {availableTypes.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </Stack>
        ) : (
          <Stack spacing={2}>
            <TextField
              label="Search nodes"
              value={attachQuery}
              onChange={(event) => onAttachQueryChange(event.target.value)}
            />
            {searchResults.loading && <CircularProgress size={24} />}
            {searchResults.error && <Alert severity="error">{searchResults.error}</Alert>}
            {!searchResults.loading && !searchResults.error && (
              <Stack spacing={1}>
                {searchResults.rows.map((row) => (
                  <Button key={row.id} variant="outlined" onClick={() => onAttach(row.id)}>
                    {row.title ?? `Node #${row.id}`} ({row.node_type})
                  </Button>
                ))}
                {searchResults.rows.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    No nodes found.
                  </Typography>
                )}
              </Stack>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        {mode === 'create' && (
          <Button
            variant="contained"
            disabled={!title.trim()}
            onClick={() => {
              onCreate(title, selectedType);
            }}
          >
            Create
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
