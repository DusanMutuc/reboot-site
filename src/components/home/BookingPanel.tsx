'use client';

import { Box, Divider } from '@mui/material';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import { brand } from '@/lib/homeTheme';
import { ActionRow, GroupLabel, Panel } from './Panel';
import type { BookingOption, RoomOption } from './types';

const ROOM_ICONS = [<VideocamRoundedIcon key="zoom" />, <GroupsRoundedIcon key="room" />];

export default function BookingPanel({
  bookingOptions,
  roomOptions,
}: {
  bookingOptions: BookingOption[];
  roomOptions: RoomOption[];
}) {
  return (
    <Panel label="Your calls" delayMs={120}>
      <GroupLabel>Book a call</GroupLabel>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {bookingOptions.map((option) => (
          <ActionRow
            key={option.label}
            icon={<EventAvailableRoundedIcon />}
            label={option.label}
            href={option.href ?? '#'}
            emphasis
          />
        ))}
      </Box>

      <Divider sx={{ my: 2.5, borderColor: brand.border }} />

      <GroupLabel>Join a room</GroupLabel>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {roomOptions.map((option, index) => (
          <ActionRow
            key={option.label}
            icon={ROOM_ICONS[index] ?? ROOM_ICONS[0]}
            label={option.label}
            href={option.href ?? '#'}
          />
        ))}
      </Box>
    </Panel>
  );
}
