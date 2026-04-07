'use client';

import { Box, Tooltip } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import StarIcon from '@mui/icons-material/Star';

export const LEGEND_MEMBER_TOOLTIP = 'member is a legend member';

type LegendMemberIconProps = {
  fontSize?: SvgIconProps['fontSize'];
  sx?: SxProps<Theme>;
};

export default function LegendMemberIcon({
  fontSize = 'small',
  sx,
}: LegendMemberIconProps) {
  return (
    <Tooltip title={LEGEND_MEMBER_TOOLTIP}>
      <Box
        component="span"
        aria-label={LEGEND_MEMBER_TOOLTIP}
        sx={[
          {
            display: 'inline-flex',
            alignItems: 'center',
            color: '#d97706',
            lineHeight: 0,
            verticalAlign: 'middle',
          },
          ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
        ]}
      >
        <StarIcon fontSize={fontSize} />
      </Box>
    </Tooltip>
  );
}
