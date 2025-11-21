'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControlLabel,
  RadioGroup,
  Radio,
  TextField,
  Stack,
  Typography,
} from '@mui/material';
import { supabase } from '@/lib/supabaseClient';
import type { UserStatus } from '@/types/coaching';

interface UserStatusDialogProps {
  open: boolean;
  onClose: () => void;
  userId: string;

  // Effective status (manual or auto) – for context only
  currentStatus: UserStatus | null;

  // Current manual override (null = using automatic)
  manualStatus: UserStatus | null;
  manualReason?: string | null;

  userLabel?: string; // e.g. "John Doe" for the title

  onSaved?: () => void; // call to refetch outer data
}

type Mode = 'auto' | 'green' | 'yellow' | 'red';

export function UserStatusDialog({
  open,
  onClose,
  userId,
  currentStatus,
  manualStatus,
  manualReason,
  userLabel,
  onSaved,
}: UserStatusDialogProps) {
  const [mode, setMode] = useState<Mode>(() => manualStatus ?? 'auto');
  const [reason, setReason] = useState<string>(manualReason ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEntered = () => {
    setMode(manualStatus ?? 'auto');
    setReason(manualReason ?? '');
    setError(null);
    setSaving(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Mode -> status/null for RPC
      const statusForRpc: UserStatus | null =
        mode === 'auto' ? null : (mode as UserStatus);

      const { error: rpcError } = await supabase.rpc(
        'set_user_attention_manual_status',
        {
          p_user_id: userId,
          p_status: statusForRpc,
          p_reason: reason || null,
        }
      );

      if (rpcError) {
        console.error(rpcError);
        setError(rpcError.message ?? 'Failed to update status');
        setSaving(false);
        return;
      }

      setSaving(false);
      if (onSaved) onSaved();
      onClose();
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to update status';
      setError(message);
      setSaving(false);
    }
  };


  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      TransitionProps={{ onEntered: handleEntered }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        {userLabel ? `Set status for ${userLabel}` : 'Set student status'}
      </DialogTitle>

      <DialogContent dividers>
        {currentStatus && (
          <Typography variant="body2" sx={{ mb: 2 }}>
            Current effective status: <strong>{currentStatus}</strong>
          </Typography>
        )}

        <RadioGroup
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
        >
          <FormControlLabel
            value="auto"
            control={<Radio />}
            label="Use automatic status (based on KPIs and attendance)"
          />
          <FormControlLabel
            value="green"
            control={<Radio />}
            label="Green – On track"
          />
          <FormControlLabel
            value="yellow"
            control={<Radio />}
            label="Yellow – Needs attention"
          />
          <FormControlLabel
            value="red"
            control={<Radio />}
            label="Red – Emergency"
          />
        </RadioGroup>

        <Stack spacing={1.5} sx={{ mt: 2 }}>
          <TextField
            label="Reason (optional but recommended)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            minRows={3}
            fullWidth
          />

          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving} variant="contained">
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
