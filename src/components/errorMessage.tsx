import { Alert, Box } from '@mui/material';

type Props = {
  message: string;
  severity?: 'error' | 'warning' | 'info';
};

export default function ErrorMessage({ message, severity = 'error' }: Props) {
  return (
    <Box sx={{ p: 3 }}>
      <Alert severity={severity} variant="outlined">
        {message}
      </Alert>
    </Box>
  );
}
