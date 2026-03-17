'use client';

import { Box, Button, Stack, Typography } from '@mui/material';
import { Add as AddIcon, DeleteOutline as DeleteIcon } from '@mui/icons-material';
import type { CoachingNoteWithM2 } from './types';
import { formatShortDate } from './utils';

type NoteSelectorProps = {
  notes: CoachingNoteWithM2[];
  notesLoading: boolean;
  selectedNoteId: number | null;
  selectedNote: CoachingNoteWithM2 | null;
  onCreateNote: () => void;
  onDeleteNote: () => void;
  onSelectNote: (noteId: number) => void;
};

export default function NoteSelector({
  notes,
  notesLoading,
  selectedNoteId,
  selectedNote,
  onCreateNote,
  onDeleteNote,
  onSelectNote,
}: NoteSelectorProps) {
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', md: 'center' }}
      spacing={2}
      sx={{ mb: 3 }}
    >
      <Box>
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 700,
            textTransform: 'uppercase',
            fontSize: 13,
            letterSpacing: 1,
            color: 'text.secondary',
            mb: 1.5,
          }}
        >
          Coaching Notes
        </Typography>

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          {notes.map((note, index) => {
            const isSelected = note.id === selectedNoteId;
            const labelDate = note.m2_meeting?.date || note.created_at;
            const label = `Note ${index + 1} - ${formatShortDate(labelDate)}`;

            return (
              <Button
                key={note.id}
                size="small"
                variant={isSelected ? 'contained' : 'outlined'}
                color={isSelected ? 'primary' : 'inherit'}
                onClick={() => onSelectNote(note.id)}
                sx={{
                  textTransform: 'none',
                  borderRadius: 2,
                  py: 0.75,
                  px: 2,
                  fontSize: 13,
                  fontWeight: isSelected ? 600 : 500,
                  bgcolor: isSelected ? 'primary.main' : 'transparent',
                  borderColor: isSelected ? 'primary.main' : 'grey.300',
                  transition: 'all 0.2s',
                  '&:hover': {
                    bgcolor: isSelected ? 'primary.dark' : 'grey.50',
                    transform: 'translateY(-1px)',
                    boxShadow: isSelected ? 2 : 1,
                  },
                }}
              >
                {label}
              </Button>
            );
          })}

          {!notesLoading && notes.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No coaching notes yet.
            </Typography>
          ) : null}
        </Stack>
      </Box>

      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          size="large"
          onClick={onCreateNote}
          disabled={notesLoading}
          startIcon={<AddIcon />}
          sx={{
            textTransform: 'none',
            borderRadius: 2,
            px: 3.5,
            py: 1.4,
            fontWeight: 700,
            fontSize: 16,
            color: '#3a2a00',
            background: 'linear-gradient(135deg, #facc15 0%, #eab308 100%)',
            boxShadow: '0 4px 12px rgba(234, 179, 8, 0.35)',
            '&:hover': {
              background: 'linear-gradient(135deg, #fde047 0%, #facc15 100%)',
              transform: 'translateY(-2px)',
              boxShadow: '0 8px 20px rgba(234, 179, 8, 0.45)',
            },
            '&:active': {
              transform: 'translateY(0)',
              boxShadow: '0 4px 12px rgba(234, 179, 8, 0.35)',
            },
            transition: 'all 0.2s ease',
          }}
        >
          {notes.length ? 'New note' : 'Create first note'}
        </Button>

        {selectedNote ? (
          <Button
            variant="text"
            size="small"
            color="error"
            onClick={onDeleteNote}
            startIcon={<DeleteIcon />}
            sx={{
              textTransform: 'none',
              fontWeight: 500,
              alignSelf: 'center',
            }}
          >
            Delete note
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}
