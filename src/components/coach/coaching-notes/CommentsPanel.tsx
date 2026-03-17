'use client';

import { Box, Button, CircularProgress, IconButton, Stack, TextField, Typography, Paper } from '@mui/material';
import {
  NoteOutlined as NoteIcon,
  EditOutlined as EditIcon,
  DeleteOutline as DeleteIcon,
} from '@mui/icons-material';
import type { CoachingNoteComment } from '@/types/coaching';
import SectionCard from './SectionCard';
import { formatAuthorName, formatDateTime } from './utils';

type CommentsPanelProps = {
  comments: CoachingNoteComment[];
  commentsLoading: boolean;
  editingCommentBody: string;
  editingCommentId: number | null;
  newCommentBody: string;
  savingComment: boolean;
  onAddComment: () => void;
  onCancelEditComment: () => void;
  onChangeEditingCommentBody: (value: string) => void;
  onChangeNewCommentBody: (value: string) => void;
  onRequestDeleteComment: (commentId: number) => void;
  onSaveEditComment: () => void;
  onStartEditComment: (comment: CoachingNoteComment) => void;
};

export default function CommentsPanel({
  comments,
  commentsLoading,
  editingCommentBody,
  editingCommentId,
  newCommentBody,
  savingComment,
  onAddComment,
  onCancelEditComment,
  onChangeEditingCommentBody,
  onChangeNewCommentBody,
  onRequestDeleteComment,
  onSaveEditComment,
  onStartEditComment,
}: CommentsPanelProps) {
  return (
    <SectionCard icon={<NoteIcon sx={{ fontSize: 20 }} />} title="Notes">
      {commentsLoading ? (
        <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={20} />
        </Box>
      ) : comments.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No notes yet. Use this area to capture key context from your sessions.
        </Typography>
      ) : (
        <Box sx={{ maxHeight: 260, overflowY: 'auto', mb: 2, pr: 1 }}>
          <Stack spacing={1.5}>
            {comments.map((comment) => {
              const isEditing = editingCommentId === comment.id;

              return (
                <Paper
                  key={comment.id}
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: 'grey.200',
                    borderLeft: '4px solid',
                    borderLeftColor: 'primary.main',
                    bgcolor: 'grey.50',
                    transition: 'all 0.2s',
                    '&:hover': {
                      boxShadow: 1,
                      transform: 'translateX(4px)',
                    },
                  }}
                >
                  {isEditing ? (
                    <Stack spacing={1}>
                      <TextField
                        multiline
                        minRows={2}
                        fullWidth
                        value={editingCommentBody}
                        onChange={(event) => onChangeEditingCommentBody(event.target.value)}
                        autoFocus
                      />
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          size="small"
                          variant="contained"
                          onClick={onSaveEditComment}
                          disabled={savingComment || !editingCommentBody.trim()}
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
                          onClick={onCancelEditComment}
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
                    <Stack spacing={0.75}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              mb: 0.25,
                              lineHeight: 1.6,
                              whiteSpace: 'pre-line',
                            }}
                          >
                            {comment.body}
                          </Typography>
                        </Box>

                        <Stack direction="row" spacing={0.5}>
                          <IconButton size="small" onClick={() => onStartEditComment(comment)} sx={{ p: 0.5 }}>
                            <EditIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => onRequestDeleteComment(comment.id)}
                            sx={{ p: 0.5 }}
                          >
                            <DeleteIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Stack>
                      </Stack>

                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                        {formatDateTime(comment.created_at)} - {formatAuthorName(comment)}
                      </Typography>
                    </Stack>
                  )}
                </Paper>
              );
            })}
          </Stack>
        </Box>
      )}

      <Stack spacing={1.5}>
        <TextField
          placeholder="Add note"
          multiline
          minRows={2}
          value={newCommentBody}
          onChange={(event) => onChangeNewCommentBody(event.target.value)}
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
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            size="medium"
            onClick={onAddComment}
            disabled={savingComment || !newCommentBody.trim()}
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
            Add note
          </Button>
        </Box>
      </Stack>
    </SectionCard>
  );
}
