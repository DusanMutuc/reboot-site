import { Box, CircularProgress, Typography } from '@mui/material';

type Props = {
  message?: string;
  minHeight?: number | string;
};

export default function Loading({ message, minHeight = 200 }: Props) {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight }}>
      <Box sx={{ textAlign: 'center' }}>
        <CircularProgress size={28} />
        {message && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            {message}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
