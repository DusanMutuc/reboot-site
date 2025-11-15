import Grid from '@mui/material/Grid';
import { Box, Paper, Typography } from '@mui/material';
import type { AchievementsProps } from '@/types/dashboard';

export default function Achievements({ achievements }: AchievementsProps) {
  return (
    <Paper sx={{ p: 3, borderRadius: 3, height: '100%' }}>
      <Typography variant="h6" fontWeight={600} mb={2}>
        Achievements
      </Typography>

      {achievements.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          You haven&apos;t unlocked any achievements yet.
        </Typography>
      ) : (
        <Grid
          container
          spacing={2}
        >
          {achievements.map((ach) => (
            <Grid
              key={ach.id}
              size={{ xs: 6, sm: 4 }}
            >
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                {ach.imageUrl ? (
                  <Box
                    component="img"
                    src={ach.imageUrl}
                    alt={ach.title}
                    sx={{ width: 48, height: 48, objectFit: 'contain' }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      bgcolor: 'action.hover',
                    }}
                  />
                )}
                <Typography variant="body2" fontWeight={600}>
                  {ach.title}
                </Typography>
                {ach.earnedAt && (
                  <Typography variant="caption" color="text.secondary">
                    {new Date(ach.earnedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Typography>
                )}
              </Box>
            </Grid>
          ))}
        </Grid>
      )}
    </Paper>
  );
}
