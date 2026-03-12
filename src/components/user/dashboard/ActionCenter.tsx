'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Tabs,
  Tab,
  Typography,
  Stack,
  Button,
} from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { getContentNodeHref } from '@/lib/contentNodeLinks';
import type {
  DashboardActionStep,
  DashboardNotePreview,
  WinsProps,
  AchievementsProps,
  DashboardWin,
  DashboardAchievement,
} from '@/types/dashboard';

type Props = {
  steps: DashboardActionStep[];
  notes: DashboardNotePreview[];
  winsProps: WinsProps;
  achievementsProps: AchievementsProps;
  daysOffValue: number;
};

export default function ActionCenter({
  steps,
  notes,
  winsProps,
  achievementsProps,
  daysOffValue,
}: Props) {
  const wins: DashboardWin[] = useMemo(
    () => (Array.isArray(winsProps?.wins) ? winsProps.wins : []),
    [winsProps]
  );
  const achievements: DashboardAchievement[] = useMemo(
    () =>
      Array.isArray(achievementsProps?.achievements)
        ? achievementsProps.achievements
        : [],
    [achievementsProps]
  );
  const safeSteps = Array.isArray(steps) ? steps : [];
  const safeNotes = Array.isArray(notes) ? notes : [];
  const daysOff = Number.isFinite(daysOffValue) ? daysOffValue : 0;

  const [tab, setTab] = useState(0);

  return (
    <Paper 
      sx={{ 
        p: 0, 
        borderRadius: 2, 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs 
          value={tab} 
          onChange={(_, v) => setTab(v)}
          sx={{ 
            minHeight: 48,
            '& .MuiTab-root': {
              minHeight: 48,
              textTransform: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'text.secondary',
              transition: 'all 0.2s',
              '&:hover': {
                color: 'text.primary',
                bgcolor: 'action.hover',
              },
              '&.Mui-selected': {
                color: 'primary.main',
                bgcolor: 'primary.50',
              },
            },
            '& .MuiTabs-indicator': {
              height: 2,
            },
          }}
        >
          <Tab label="Action Steps" />
          <Tab label="Coaching Notes" />
          <Tab label="Wins" />
          <Tab label="Achievements" />
        </Tabs>
      </Box>

      {/* Content */}
      <Box
        sx={{
          p: 2.5,
          flex: 1,
          overflow: 'auto',
          '&::-webkit-scrollbar': {
            width: '6px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: '3px',
          },
        }}
      >
        {/* Tab 0: Steps */}
        {tab === 0 && (
          safeSteps.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No active action steps right now.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {safeSteps.map((step) => {
                const isComplete = step.status === 'complete';

                return (
                  <Box
                    key={step.id}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      border: '2px solid',
                      borderColor: isComplete ? 'success.light' : 'grey.300',
                      bgcolor: isComplete ? 'success.50' : 'grey.50',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                      '&:hover': {
                        borderColor: isComplete ? 'success.main' : 'primary.main',
                        bgcolor: isComplete ? 'success.100' : 'primary.50',
                        transform: 'translateY(-1px)',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      },
                    }}
                  >
                    {/* Left: label only */}
                    <Box
                      sx={{
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <Typography variant="body1" fontWeight={600}>
                        {step.label}
                      </Typography>
                    </Box>

                    {/* Right: resource button, same for all */}
                    {step.library_item_id && (
                      <Button
                        size="small"
                        variant="text"
                        sx={{ 
                          textTransform: 'none',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: 'primary.main',
                          flexShrink: 0,
                          '&:hover': {
                            bgcolor: 'transparent',
                            textDecoration: 'underline',
                          },
                        }}
                        href={getContentNodeHref({
                          id: step.library_item_id,
                          slug: step.linked_node?.slug ?? null,
                          node_type: step.linked_node?.node_type ?? null,
                        })}
                      >
                        Open related resource →
                      </Button>
                    )}
                  </Box>
                );
              })}
            </Stack>
          )
        )}

        {/* Tab 1: Notes */}
        {tab === 1 && (
          safeNotes.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No recent notes yet.
            </Typography>
          ) : (
            <Stack spacing={2}>
              {safeNotes.map((note) => (
                <Box
                  key={note.id}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    borderLeft: '4px solid',
                    borderLeftColor: 'primary.main',
                    bgcolor: 'primary.50',
                    border: '1px solid',
                    borderColor: 'primary.200',
                  }}
                >
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="caption" fontWeight={600} color="primary.main">
                      {new Date(note.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Coach
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                    {note.body}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )
        )}

        {/* Tab 2: Wins */}
        {tab === 2 && (
          wins.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No wins yet — add your first one!
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {wins.slice(0, 8).map((w) => (
                <Box
                  key={w.id}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                    border: '1px solid',
                    borderColor: 'warning.light',
                    display: 'flex',
                    gap: 1.5,
                    alignItems: 'flex-start',
                  }}
                >
                  <EmojiEventsIcon sx={{ fontSize: 20, flexShrink: 0, mt: 0.25 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5, lineHeight: 1.5 }}>
                      {w.body}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(w.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Stack>
          )
        )}

        {/* Tab 3: Achievements */}
        {tab === 3 && (
          achievements.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Keep logging actions to unlock your first achievement.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {achievements.slice(0, 12).map((a) => (
                <Box
                  key={a.id}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: '2px solid',
                    borderColor: 'secondary.light',
                    background: 'linear-gradient(135deg, #F3E8FF 0%, #E9D5FF 100%)',
                    display: 'flex',
                    gap: 1.5,
                    alignItems: 'center',
                  }}
                >
                  <Box
                    sx={{
                      fontSize: '2rem',
                      lineHeight: 1,
                    }}
                  >
                    🏆
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} sx={{ mb: 0.25 }}>
                      {a.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Achievement unlocked
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Stack>
          )
        )}
      </Box>
    </Paper>
  );
}
