'use client';

import { Box, Button, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { NodeState, NodeSubtree } from '@/types/course';
import type { NodeDraft } from '../Sidebar/Properties';
import { useEditorStore } from '../state/editorStore';

const toolbarToggleGroupSx = {
  '& .MuiToggleButton-root': {
    px: 1.25,
    py: 0.5,
    minHeight: 30,
    fontSize: '0.72rem',
    lineHeight: 1.15,
    fontWeight: 600,
    textTransform: 'none',
  },
} as const;

export type ToolbarProps = {
  subtree: NodeSubtree | null;
  nodeDraft: NodeDraft | null;
  onStateChange: (state: NodeState) => void;
  onShowDetails: () => void;
};

export default function Toolbar({ subtree, nodeDraft, onStateChange, onShowDetails }: ToolbarProps) {
  const { editorMode, setEditorMode, savingState, savingMessage } = useEditorStore();

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
        <SaveStatus state={savingState} message={savingMessage} />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={editorMode}
          onChange={(_, value) => value && setEditorMode(value)}
          sx={toolbarToggleGroupSx}
        >
          <ToggleButton value="edit">Edit</ToggleButton>
          <ToggleButton value="preview">Preview</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={subtree.node.state}
          onChange={(_, value) => value && onStateChange(value)}
          sx={toolbarToggleGroupSx}
        >
          <ToggleButton value="draft">Draft</ToggleButton>
          <ToggleButton value="published">Published</ToggleButton>
          <ToggleButton value="archived">Archived</ToggleButton>
        </ToggleButtonGroup>
        <Button variant="outlined" onClick={onShowDetails}>
          Node details
        </Button>
      </Stack>
    </Stack>
  );
}

type SaveStatusProps = {
  state: 'idle' | 'saving' | 'saved' | 'error';
  message: string;
};

function SaveStatus({ state, message }: SaveStatusProps) {
  const color =
    state === 'saving' ? 'warning.main' : state === 'error' ? 'error.main' : state === 'saved' ? 'success.main' : 'success.main';

  return (
    <Chip
      size="small"
      label={message}
      sx={{
        borderRadius: 999,
        height: 28,
        '& .MuiChip-label': {
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1,
          py: 0,
          fontSize: '0.78rem',
          fontWeight: 600,
          lineHeight: 1.2,
        },
        '& .MuiChip-icon': { ml: 0.875, mr: -0.125 },
      }}
      icon={<StatusDot color={color} />}
    />
  );
}

function StatusDot({ color }: { color: string }) {
  return <Box sx={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color }} />;
}
