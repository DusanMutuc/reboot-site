'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Box, Button, Menu, MenuItem } from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { supabase } from '@/lib/supabaseClient';
import { canSwitchMemberViews, fetchMemberHomeContext, fetchUserRoleCodes, hasDualMembership } from '@/lib/userRoles';

export default function MembershipViewSwitcher({ currentView }: { currentView: 'member' | 'ninety-day' }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const roles = user ? await fetchUserRoleCodes(supabase, user.id) : [];
        const context = hasDualMembership(roles) ? await fetchMemberHomeContext(supabase) : undefined;
        if (!cancelled) setEnabled(canSwitchMemberViews(roles, context));
      } catch {
        if (!cancelled) setEnabled(false);
      }
    }
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); };
  }, []);

  return enabled ? <MembershipViewMenu currentView={currentView} /> : null;
}

export function MembershipViewMenu({ currentView }: { currentView: 'member' | 'ninety-day' }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const id = useId();
  return (
    <Box sx={{ alignSelf: 'flex-end', pb: 1, display: 'flex', justifyContent: 'flex-end' }}>
      <Button
        id={`${id}-button`}
        aria-label="Switch dashboard view"
        aria-haspopup="menu"
        aria-controls={anchor ? `${id}-menu` : undefined}
        aria-expanded={Boolean(anchor)}
        endIcon={<ExpandMoreRoundedIcon />}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ color: '#fff', border: '1px solid rgba(255,255,255,.4)', textTransform: 'none', fontSize: 14 }}
      >
        {currentView === 'member' ? 'Member dashboard' : '90-day programme'}
      </Button>
      <Menu id={`${id}-menu`} anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
        slotProps={{ list: { 'aria-labelledby': `${id}-button` } }}>
        <MenuItem component={Link} href="/dashboard" selected={currentView === 'member'} onClick={() => setAnchor(null)}>
          Member dashboard
        </MenuItem>
        <MenuItem component={Link} href="/home/ninety-day" selected={currentView === 'ninety-day'} onClick={() => setAnchor(null)}>
          90-day programme
        </MenuItem>
      </Menu>
    </Box>
  );
}
