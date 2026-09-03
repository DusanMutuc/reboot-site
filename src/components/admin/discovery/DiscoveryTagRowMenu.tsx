'use client';

import { useState } from 'react';
import { Divider, IconButton, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import type { DiscoveryTag } from '@/lib/discoveryAdminTypes';

/**
 * One button per row instead of a pair of naked links. Merge sitting beside Edit made it read
 * as an equally routine action, which it is not — it is the only irreversible one here.
 */
export default function DiscoveryTagRowMenu({ tag, busy, onEdit, onMerge, onSetActive }: {
  tag: DiscoveryTag;
  busy: boolean;
  onEdit: () => void;
  onMerge: () => void;
  onSetActive: (active: boolean) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  const run = (action: () => void) => () => { close(); action(); };

  const isCategory = tag.tag_kind === 'browse_category';
  const isSynonym = tag.tag_kind === 'alias';
  const active = tag.is_active !== false;

  return <>
    <Tooltip title={`Actions for “${tag.name}”`}>
      <IconButton size="small" disabled={busy} onClick={(event) => setAnchor(event.currentTarget)}
        aria-label={`Actions for ${tag.name}`}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
    </Tooltip>
    <Menu anchorEl={anchor} open={!!anchor} onClose={close}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
      <MenuItem onClick={run(onEdit)}>
        <ListItemText primary="Edit" secondary={isCategory ? 'Rename this section' : 'Name and settings'} />
      </MenuItem>
      {!isCategory && !isSynonym && <MenuItem onClick={run(onMerge)}>
        <ListItemText primary="Merge into another term…"
          secondary="Moves this term's tags across, then keeps it as a synonym" />
      </MenuItem>}
      {!isCategory && <Divider />}
      {!isCategory && <MenuItem onClick={run(() => onSetActive(!active))}>
        <ListItemText primary={active ? 'Retire' : 'Bring back'}
          secondary={active ? 'Keeps existing tags, leaves the picker' : 'Returns to the picker and to search'} />
      </MenuItem>}
    </Menu>
  </>;
}
