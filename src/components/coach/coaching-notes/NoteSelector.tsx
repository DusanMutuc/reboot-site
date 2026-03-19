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
      sx={{ mb: 3, rowGap: 1.5 }}
    >
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
                borderRadius: 999,
                py: 0.9,
                px: 2.25,
                fontSize: 14,
                fontWeight: isSelected ? 700 : 500,
                bgcolor: isSelected ? 'primary.main' : 'background.paper',
                color: isSelected ? 'primary.contrastText' : 'text.secondary',
                borderColor: isSelected ? 'primary.main' : 'grey.300',
                boxShadow: isSelected ? '0 6px 14px rgba(92,188,168,0.18)' : 'none',
                '&:hover': {
                  bgcolor: isSelected ? 'primary.dark' : 'grey.50',
                  borderColor: isSelected ? 'primary.dark' : 'grey.400',
                },
              }}
            >
              {label}
            </Button>
          );
        })}

        <Button
          variant="outlined"
          size="small"
          onClick={onCreateNote}
          disabled={notesLoading}
          startIcon={<AddIcon />}
          sx={{
            textTransform: 'none',
            borderRadius: 999,
            py: 0.9,
            px: 2.25,
            fontWeight: 600,
            borderStyle: 'dashed',
            borderWidth: 1.5,
            color: 'primary.main',
            borderColor: 'primary.light',
            bgcolor: 'background.paper',
            '&:hover': {
              borderStyle: 'dashed',
              borderWidth: 1.5,
              borderColor: 'primary.main',
              bgcolor: 'primary.50',
            },
          }}
        >
          {notes.length ? 'New note' : 'Create first note'}
        </Button>

        {!notesLoading && notes.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center', ml: 0.5 }}>
            No coaching notes yet.
          </Typography>
        ) : null}
      </Stack>

      {selectedNote ? (
        <Box sx={{ alignSelf: { xs: 'stretch', md: 'center' } }}>
          <Button
            variant="text"
            size="small"
            color="error"
            onClick={onDeleteNote}
            startIcon={<DeleteIcon />}
            sx={{
              textTransform: 'none',
              fontWeight: 500,
              minWidth: 0,
            }}
          >
            Delete note
          </Button>
        </Box>
      ) : (
        <Box />
      )}
    </Stack>
  );
}
