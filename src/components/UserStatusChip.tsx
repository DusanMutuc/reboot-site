'use client';

import { memo } from 'react';
import { Chip, Tooltip } from '@mui/material';
import type { UserStatus, UserStatusSource } from '@/types/coaching';

export interface UserStatusChipProps {
  status: UserStatus;                 // 'green' | 'yellow' | 'red'
  source?: UserStatusSource;          // 'manual' | 'auto'
  reason?: string | null;
  size?: 'small' | 'medium';
  clickable?: boolean;
  onClick?: () => void;
}

function getChipColor(status: UserStatus) {
  switch (status) {
    case 'red':
      return 'error';
    case 'yellow':
      return 'warning';
    case 'green':
    default:
      return 'success';
  }
}

function getChipLabel(status: UserStatus) {
  switch (status) {
    case 'red':
      return 'Red – Emergency';
    case 'yellow':
      return 'Yellow – Needs attention';
    case 'green':
    default:
      return 'Green – On track';
  }
}

function buildTooltipText(
  status: UserStatus,
  source?: UserStatusSource,
  reason?: string | null
) {
  const parts: string[] = [];

  parts.push(getChipLabel(status));

  if (source === 'manual') {
    parts.push('(set manually by coach/admin)');
  } else if (source === 'auto') {
    parts.push('(set automatically from KPIs/attendance)');
  }

  if (reason) {
    parts.push(`Reason: ${reason}`);
  }

  return parts.join(' ');
}

function UserStatusChipBase({
  status,
  source,
  reason,
  size = 'small',
  clickable = false,
  onClick,
}: UserStatusChipProps) {
  const chip = (
    <Chip
      size={size}
      color={getChipColor(status)}
      label={getChipLabel(status)}
      variant={clickable ? 'filled' : 'outlined'}
      onClick={clickable ? onClick : undefined}
      sx={{ fontWeight: 500, fontSize:12 }}
    />
  );

  const tooltipTitle = buildTooltipText(status, source, reason);

  return (
    <Tooltip title={tooltipTitle}>
      <span>{chip}</span>
    </Tooltip>
  );
}

export const UserStatusChip = memo(UserStatusChipBase);
