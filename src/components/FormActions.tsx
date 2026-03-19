import { Stack, type SxProps, type Theme } from '@mui/material';

type Props = {
  children: React.ReactNode;
  sx?: SxProps<Theme>;
};

/** Right-aligned row of action buttons for forms and panels. */
export default function FormActions({ children, sx }: Props) {
  return (
    <Stack direction="row" spacing={1} justifyContent="flex-end" sx={sx}>
      {children}
    </Stack>
  );
}
