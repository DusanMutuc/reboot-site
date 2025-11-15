import { Paper, Typography, Box, Stack } from '@mui/material';
import type { DashboardNotePreview } from '@/types/dashboard';

export default function Notes({ notes }: { notes: DashboardNotePreview[] }) {
  return (
    <Paper sx={{ p: 2, borderRadius: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" fontWeight={600} mb={1}>
        Coaching Notes
      </Typography>
      {notes.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No recent notes yet.
        </Typography>
      ) : (
        <Box sx={{ overflow: 'auto', maxHeight: 300, pr: 0.5 }}>
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
        </Box>
      )}
    </Paper>
  );
}
