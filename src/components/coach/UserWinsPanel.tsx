// src/components/coach/UserWinsPanel.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { EmojiEventsOutlined as TrophyIcon } from '@mui/icons-material';
import type { Win } from '@/types/coaching';

type Props = {
  userId: string | null;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function UserWinsPanel({ userId }: Props) {
  const [wins, setWins] = useState<Win[]>([]);
  const [winsLoading, setWinsLoading] = useState(false);
  const [newWinBody, setNewWinBody] = useState('');
  const [savingWin, setSavingWin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load wins when user changes
  useEffect(() => {
    setWins([]);
    setError(null);

    if (!userId) return;

    let cancelled = false;

    const loadWins = async () => {
      setWinsLoading(true);
      const { data, error } = await supabase
        .from('wins')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!cancelled) {
        if (error) {
          setError(error.message);
        } else if (data) {
          setWins(data as Win[]);
        }
        setWinsLoading(false);
      }
    };

    void loadWins();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleAddWin = async () => {
    if (!userId || !newWinBody.trim()) return;
    setError(null);
    setSavingWin(true);

    const { data, error } = await supabase.rpc('add_win', {
      _user_id: userId,
      _body: newWinBody.trim(),
    });

    if (error) {
      setError(error.message);
      setSavingWin(false);
      return;
    }

    if (data) {
      const newWin = data as Win;
      setWins((prev) => [newWin, ...prev]);
      setNewWinBody('');
    }

    setSavingWin(false);
  };

  if (!userId) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 3,
          border: '1px solid',
          borderColor: 'grey.200',
          borderRadius: 2,
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Select a student to view their wins.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        border: '1px solid',
        borderColor: 'grey.200',
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1.5,
            background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}
        >
          <TrophyIcon sx={{ fontSize: 20 }} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18 }}>
          Wins
        </Typography>
      </Stack>

      {winsLoading ? (
        <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={20} />
        </Box>
      ) : wins.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No wins logged yet. Celebrate their progress here.
        </Typography>
      ) : (
        <Box
          sx={{
            maxHeight: 260,
            overflowY: 'auto',
            mb: 2,
            pr: 1,
          }}
        >
          <Stack spacing={1.5}>
            {wins.map((w) => (
              <Paper
                key={w.id}
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
                <Typography
  variant="body1"
  sx={{ mb: 0.75, lineHeight: 1.6, fontSize: 15 }}
>
  {w.body}
</Typography>
<Typography
  variant="caption"
  color="text.secondary"
  sx={{ fontWeight: 400, fontSize: 10 }}
>
  {formatDateTime(w.created_at)}
</Typography>

              </Paper>
            ))}
          </Stack>
        </Box>
      )}

      <Stack spacing={1.5}>
        <TextField
          placeholder="Add win"
          multiline
          minRows={2}
          value={newWinBody}
          onChange={(e) => setNewWinBody(e.target.value)}
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
            onClick={handleAddWin}
            disabled={savingWin || !newWinBody.trim()}
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
            Add win
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
