'use client';

import { useState } from 'react';
import {
  Box,
  Paper,
  Tabs,
  Tab,
  Typography,
  Stack,
  Chip,
  Button,
} from '@mui/material';
import type { DashboardActionStep, DashboardNotePreview } from '@/types/dashboard';

function StepStatusColor(s: DashboardActionStep['status']) {
  switch (s) {
    case 'complete':
      return 'success';
    case 'in_progress':
      return 'warning';
    default:
      return 'default';
  }
}

export default function ActionCenter({
  steps,
  notes,
}: {
  steps: DashboardActionStep[];
  notes: DashboardNotePreview[];
}) {
  const [tab, setTab] = useState(0);

  return (
    <Paper sx={{ p: 2, borderRadius: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 38 }}>
        <Tab label="Action Steps" sx={{ minHeight: 38 }} />
        <Tab label="Coaching Notes" sx={{ minHeight: 38 }} />
      </Tabs>

      {/* Content */}
      <Box
        sx={{
          mt: 1.5,
          flex: 1,
          // Desktop: short scrollable card; Mobile: no inner scroll
          maxHeight: { md: 360 },
          overflow: { md: 'auto' },
          pr: { md: 0.5 },
        }}
      >
        {tab === 0 ? (
          steps.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No active action steps right now.</Typography>
          ) : (
            <Stack spacing={1.25}>
              {steps.map((step) => (
                <Box
                  key={step.id}
                  sx={{
                    p: 1.25,
                    borderRadius: 2,
                    bgcolor: 'action.hover',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5,
                  }}
                >
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" fontWeight={600}>{step.label}</Typography>
                    <Chip
                      label={step.status.replace('_', ' ')}
                      size="small"
                      color={StepStatusColor(step.status) as any}
                      sx={{ textTransform: 'capitalize' }}
                    />
                  </Box>
                  {step.library_item_id && (
                    <Button
                      size="small"
                      variant="text"
                      sx={{ alignSelf: 'flex-start', mt: 0.5 }}
                      href={`/library/${step.library_item_id}`}
                    >
                      Open related resource
                    </Button>
                  )}
                </Box>
              ))}
            </Stack>
          )
        ) : notes.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No recent notes yet.</Typography>
        ) : (
          <Stack spacing={1.25}>
            {notes.map((note) => (
              <Box
                key={note.id}
                sx={{
                  p: 1.25,
                  borderRadius: 2,
                  bgcolor: 'background.default',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="body2">{note.body}</Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.5 }}
                >
                  {new Date(note.created_at).toLocaleString()}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Paper>
  );
}
