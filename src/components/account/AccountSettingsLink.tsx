'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, MenuItem, type SxProps, type Theme } from '@mui/material';

export default function AccountSettingsLink({ menuItem = false, onClick, sx, tabIndex, autoFocus }: {
  menuItem?: boolean; onClick?: () => void; sx?: SxProps<Theme>; tabIndex?: number; autoFocus?: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch('/api/auth/backup-email', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => response.ok ? response.json() : null)
      .then((state) => { if (active) setEnabled(state?.enabled === true); })
      .catch(() => { if (active) setEnabled(false); });
    return () => { active = false; };
  }, []);
  if (!enabled) return null;
  return menuItem
    ? <MenuItem component={Link} href="/account" prefetch={false} onClick={onClick} sx={sx} tabIndex={tabIndex} autoFocus={autoFocus}>Account settings</MenuItem>
    : <Button component={Link} href="/account" prefetch={false} onClick={onClick} color="inherit" size="small" sx={sx} tabIndex={tabIndex} autoFocus={autoFocus}>Account settings</Button>;
}
