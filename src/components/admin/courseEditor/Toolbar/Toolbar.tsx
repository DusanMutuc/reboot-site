'use client';

import {
  Box,
  Button,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { NodeState, NodeSubtree } from '@/types/course';
import type { NodeDraft } from '../Sidebar/Properties';

export type ToolbarProps = {
  subtree: NodeSubtree | null;
  nodeDraft: NodeDraft | null;
  previewMode: boolean;
  onPreviewModeChange: (value: boolean) => void;
  onStateChange: (state: NodeState) => void;
  onShowDetails: () => void;
};

export default function Toolbar({
  subtree,
  nodeDraft,
  previewMode,
  onPreviewModeChange,
  onStateChange,
  onShowDetails,
}: ToolbarProps) {
  if (!subtree || !nodeDraft) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6">Select a node to begin editing</Typography>
      </Box>
    );
  }

  return (
    <Stack
      sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper' }}
      direction={{ xs: 'column', md: 'row' }}
      spacing={2}
      alignItems={{ xs: 'flex-start', md: 'center' }}
      justifyContent="space-between"
    >
      <Stack spacing={0.5}>
        <Typography variant="h6">{nodeDraft.title || subtree.node.title || 'Untitled node'}</Typography>
        <Typography variant="body2" color="text.secondary">
          {subtree.node.node_type}
        </Typography>
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={subtree.node.state}
          onChange={(_, value) => value && onStateChange(value)}
        >
          <ToggleButton value="draft">Draft</ToggleButton>
          <ToggleButton value="published">Published</ToggleButton>
          <ToggleButton value="archived">Archived</ToggleButton>
        </ToggleButtonGroup>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2">Preview</Typography>
          <Switch checked={previewMode} onChange={(event) => onPreviewModeChange(event.target.checked)} />
        </Stack>
        <Button variant="outlined" onClick={onShowDetails}>
          Node details
        </Button>
      </Stack>
    </Stack>
  );
}
