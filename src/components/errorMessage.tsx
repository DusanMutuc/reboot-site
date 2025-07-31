import Typography from '@mui/material/Typography';

type Props = { message: string };

export default function ErrorMessage({ message }: Props) {
  return (
    <div style={{ padding: 40 }}>
      <Typography color="error">{message}</Typography>
    </div>
  );
}
