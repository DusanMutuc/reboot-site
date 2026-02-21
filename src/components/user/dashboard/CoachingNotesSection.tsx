// src/components/user/dashboard/CoachingNotesSection.tsx
import {
    Box,
    Paper,
    Typography,
    Stack,
  } from '@mui/material';
  import type { CoachingNotesSectionProps } from '@/types/dashboard';
  
  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
  
  export default function CoachingNotesSection({
    actionSteps: _actionSteps, // intentionally unused
    notes,
  }: CoachingNotesSectionProps) {
    return (
      <Paper
        sx={{
          p: 3,
          borderRadius: 3,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Typography variant="h3" fontWeight={600} mb={2.5}>
          Coaching Notes
        </Typography>
  
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            pr: 0.5,
          }}
        >
          {notes.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No recent notes yet.
            </Typography>
          ) : (
            <Stack spacing={2}>
              {notes.map((note) => (
                <Box
                  key={note.id}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: '#F0F4FF',
                    border: '1px solid #BFDBFE',
                    borderLeft: '4px solid #2563eb',
                    transition: 'all 0.2s ease-in-out',
                    cursor: 'pointer',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(37, 99, 235, 0.15)',
                    },
                  }}
                >
                  <Typography 
  variant="body2" 
  sx={{ 
    fontSize: '11px',
    lineHeight: 1.5,
    color: 'text.primary',
    fontWeight: 500,
    whiteSpace: 'pre-line', // <-- preserve \n as line breaks
  }}
>
  {note.body}
</Typography>

                  <Typography
                    variant="caption"
                    sx={{ 
                      display: 'block', 
                      mt: 0.5,
                      color: 'text.secondary',
                      fontSize: '11px',
                    }}
                  >
                    {formatDate(note.created_at)} • {note.author_name}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Paper>
    );
  }
