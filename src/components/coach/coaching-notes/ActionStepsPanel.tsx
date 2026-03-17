'use client';

import Link from 'next/link';
import { Box, Button, CircularProgress, MenuItem, Select, Stack, TextField, Typography, Paper } from '@mui/material';
import {
  CheckCircleOutline as CheckCircleIcon,
  EditOutlined as EditIcon,
  DeleteOutline as DeleteIcon,
} from '@mui/icons-material';
import type { ActionStepStatus, CoachingNoteActionStep } from '@/types/coaching';
import { getContentNodeHref } from '@/lib/contentNodeLinks';
import SectionCard from './SectionCard';
import type { ContentNodeInfo } from './types';

type ActionStepsPanelProps = {
  editingStepId: number | null;
  editingStepLabel: string;
  libraryItems: Record<number, ContentNodeInfo>;
  newStepLabel: string;
  savingStep: boolean;
  steps: CoachingNoteActionStep[];
  stepsLoading: boolean;
  onAddStep: () => void;
  onCancelEditStep: () => void;
  onChangeEditingStepLabel: (value: string) => void;
  onChangeNewStepLabel: (value: string) => void;
  onChangeStepStatus: (stepId: number, status: ActionStepStatus) => void;
  onOpenLibraryDialog: () => void;
  onRequestDeleteStep: (stepId: number) => void;
  onSaveEditStep: () => void;
  onStartEditStep: (step: CoachingNoteActionStep) => void;
};

export default function ActionStepsPanel({
  editingStepId,
  editingStepLabel,
  libraryItems,
  newStepLabel,
  savingStep,
  steps,
  stepsLoading,
  onAddStep,
  onCancelEditStep,
  onChangeEditingStepLabel,
  onChangeNewStepLabel,
  onChangeStepStatus,
  onOpenLibraryDialog,
  onRequestDeleteStep,
  onSaveEditStep,
  onStartEditStep,
}: ActionStepsPanelProps) {
  return (
    <SectionCard icon={<CheckCircleIcon sx={{ fontSize: 20 }} />} title="Action steps">
      {stepsLoading ? (
        <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={20} />
        </Box>
      ) : steps.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No action steps yet. Add one from the Library or manually.
        </Typography>
      ) : (
        <Stack spacing={1.5} sx={{ mb: 3 }}>
          {steps.map((step) => {
            const linked = step.library_item_id != null ? libraryItems[step.library_item_id] : undefined;
            const href =
              step.library_item_id != null && linked
                ? getContentNodeHref({
                    id: step.library_item_id,
                    slug: linked.slug,
                    node_type: linked.node_type,
                  })
                : null;
            const isEditing = editingStepId === step.id;

            return (
              <Paper
                key={step.id}
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: 'grey.50',
                  border: '1px solid',
                  borderColor: 'grey.200',
                  borderRadius: 1.5,
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: 'grey.300',
                    boxShadow: 1,
                  },
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="flex-start" justifyContent="space-between">
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <Stack spacing={1}>
                        <TextField
                          size="small"
                          fullWidth
                          value={editingStepLabel}
                          onChange={(event) => onChangeEditingStepLabel(event.target.value)}
                          autoFocus
                        />
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button
                            size="small"
                            variant="contained"
                            onClick={onSaveEditStep}
                            disabled={savingStep || !editingStepLabel.trim()}
                            sx={{
                              textTransform: 'none',
                              borderRadius: 1.5,
                              px: 2,
                            }}
                          >
                            Save
                          </Button>
                          <Button
                            size="small"
                            variant="text"
                            onClick={onCancelEditStep}
                            sx={{
                              textTransform: 'none',
                              borderRadius: 1.5,
                            }}
                          >
                            Cancel
                          </Button>
                        </Stack>
                      </Stack>
                    ) : (
                      <>
                        <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                          {step.label}
                        </Typography>

                        {linked ? (
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                            <Typography variant="caption" color="text.secondary">
                              Linked: {linked.title || `Library item #${step.library_item_id}`}
                            </Typography>

                            {href ? (
                              <Button
                                size="small"
                                variant="text"
                                component={Link}
                                href={href}
                                sx={{
                                  textTransform: 'none',
                                  fontSize: 11,
                                  px: 0.5,
                                  minWidth: 'auto',
                                }}
                              >
                                Open
                              </Button>
                            ) : null}
                          </Stack>
                        ) : null}
                      </>
                    )}
                  </Box>

                  <Box sx={{ minWidth: 160 }}>
                    <Stack spacing={1} alignItems="flex-end">
                      <Select
                        size="small"
                        fullWidth
                        value={step.status}
                        onChange={(event) =>
                          onChangeStepStatus(step.id, event.target.value as ActionStepStatus)
                        }
                        sx={{
                          borderRadius: 1.5,
                          bgcolor: 'white',
                          '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: 'grey.300',
                          },
                          '&:hover .MuiOutlinedInput-notchedOutline': {
                            borderColor: 'primary.main',
                          },
                        }}
                      >
                        <MenuItem value="not_started">Not started</MenuItem>
                        <MenuItem value="in_progress">In progress</MenuItem>
                        <MenuItem value="complete">Complete</MenuItem>
                      </Select>

                      {!isEditing ? (
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="small"
                            variant="text"
                            startIcon={<EditIcon sx={{ fontSize: 16 }} />}
                            onClick={() => onStartEditStep(step)}
                            sx={{
                              textTransform: 'none',
                              fontSize: 12,
                              minWidth: 0,
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="small"
                            variant="text"
                            color="error"
                            startIcon={<DeleteIcon sx={{ fontSize: 16 }} />}
                            onClick={() => onRequestDeleteStep(step.id)}
                            sx={{
                              textTransform: 'none',
                              fontSize: 12,
                              minWidth: 0,
                            }}
                          >
                            Delete
                          </Button>
                        </Stack>
                      ) : null}
                    </Stack>
                  </Box>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      <Stack spacing={2}>
        <Button
          variant="outlined"
          size="medium"
          fullWidth
          onClick={onOpenLibraryDialog}
          sx={{
            textTransform: 'none',
            borderRadius: 1.5,
            borderStyle: 'dashed',
            borderWidth: 2,
            py: 1.25,
            minHeight: 36,
            fontWeight: 600,
            fontSize: 13,
            color: 'primary.main',
            borderColor: 'grey.300',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: 'primary.50',
              borderStyle: 'dashed',
              borderWidth: 2,
            },
          }}
        >
          + Add action step from Library/Courses
        </Button>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <TextField
            size="small"
            fullWidth
            placeholder="New manual action step"
            value={newStepLabel}
            onChange={(event) => onChangeNewStepLabel(event.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 1.5,
                bgcolor: 'grey.50',
                '&:hover fieldset': {
                  borderColor: 'primary.main',
                },
                '&.Mui-focused': {
                  bgcolor: 'white',
                },
              },
            }}
          />
          <Button
            variant="outlined"
            size="medium"
            onClick={onAddStep}
            disabled={savingStep || !newStepLabel.trim()}
            sx={{
              textTransform: 'none',
              borderRadius: 1.5,
              px: 3,
              fontWeight: 600,
              borderWidth: 2,
              '&:hover': {
                borderWidth: 2,
              },
            }}
          >
            Add step
          </Button>
        </Stack>
      </Stack>
    </SectionCard>
  );
}
