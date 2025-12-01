// src/components/admin/SiteAnnouncementAdmin.tsx
'use client';

import { useEffect, useState } from 'react';
import {
  Paper,
  Stack,
  TextField,
  Typography,
  FormControlLabel,
  Switch,
  Button,
} from '@mui/material';
import { supabase } from '@/lib/supabaseClient';

type AnnouncementRow = {
  id: number;
  message: string;
  is_active: boolean;
  background_color: string | null;
  text_color: string | null;
  button_label: string | null;
  button_url: string | null;
  button_color: string | null;
};

export default function SiteAnnouncementAdmin() {
  const [announcement, setAnnouncement] = useState<AnnouncementRow | null>(null);
  const [message, setMessage] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [backgroundColor, setBackgroundColor] = useState('');
  const [textColor, setTextColor] = useState('');
  const [buttonLabel, setButtonLabel] = useState('');
  const [buttonUrl, setButtonUrl] = useState('');
  const [buttonColor, setButtonColor] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from('site_announcements')
        .select(
          'id, message, is_active, background_color, text_color, button_label, button_url, button_color'
        )
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!alive) return;

      if (!error && data) {
        const row = data as AnnouncementRow;
        setAnnouncement(row);
        setMessage(row.message);
        setIsActive(row.is_active);
        setBackgroundColor(row.background_color ?? '');
        setTextColor(row.text_color ?? '');
        setButtonLabel(row.button_label ?? '');
        setButtonUrl(row.button_url ?? '');
        setButtonColor(row.button_color ?? '');
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        message,
        is_active: isActive,
        background_color: backgroundColor || null,
        text_color: textColor || null,
        button_label: buttonLabel || null,
        button_url: buttonUrl || null,
        button_color: buttonColor || null,
      };

      if (announcement) {
        const { error } = await supabase
          .from('site_announcements')
          .update(payload)
          .eq('id', announcement.id);

        if (!error) {
          setAnnouncement((prev) =>
            prev
              ? {
                  ...prev,
                  ...payload,
                }
              : prev
          );
        }
      } else {
        const { data, error } = await supabase
          .from('site_announcements')
          .insert(payload)
          .select(
            'id, message, is_active, background_color, text_color, button_label, button_url, button_color'
          )
          .single();

        if (!error && data) {
          setAnnouncement(data as AnnouncementRow);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 1.5 }}>
        Home Page Announcement
      </Typography>

      <Stack spacing={2}>
        <TextField
          label="Announcement text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          fullWidth
          multiline
          minRows={2}
        />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Background color (CSS)"
            value={backgroundColor}
            onChange={(e) => setBackgroundColor(e.target.value)}
            fullWidth
            placeholder="e.g. #f5f5f5 or rgba(92,188,168,0.06)"
          />
          <TextField
            label="Text color (CSS)"
            value={textColor}
            onChange={(e) => setTextColor(e.target.value)}
            fullWidth
            placeholder="e.g. #0f172a"
          />
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Button label (optional)"
            value={buttonLabel}
            onChange={(e) => setButtonLabel(e.target.value)}
            fullWidth
            placeholder="e.g. Learn more"
          />
          <TextField
            label="Button link URL (optional)"
            value={buttonUrl}
            onChange={(e) => setButtonUrl(e.target.value)}
            fullWidth
            placeholder="https://..."
          />
        </Stack>

        <TextField
          label="Button color (CSS, optional)"
          value={buttonColor}
          onChange={(e) => setButtonColor(e.target.value)}
          fullWidth
          placeholder="e.g. #5cbca8"
        />

        <FormControlLabel
          control={
            <Switch
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
          }
          label="Show on user home page"
        />

        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Stack>
    </Paper>
  );
}
