'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  Box, Chip, CircularProgress, Stack, Typography
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';

const COACH_UI_SCALE = 1.04;

type Mode = 'coach' | 'admin';

type Row = {
  node_id: number;
  parent_id: number;
  node_type: 'lesson' | 'chapter' | string;
  title: string | null;
  child_position: number;
  depth: number;
  path_positions: string;
  status: 'not_started' | 'in_progress' | 'completed' | string;
  is_completed: boolean;
};

export default function DetailedUserProgressView({
  courseId, userId, mode
}: {
  courseId: number | null;
  userId: string | null;
  mode?: Mode;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);

  const isCoach = mode === 'coach';
  const sz = (px: number) => (isCoach ? Math.round(px * COACH_UI_SCALE) : px);

  useEffect(() => {
    let active = true;
    setRows(null);
    if (!courseId || !userId) return;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_user_course_completion_detail', {
        _user_id: userId,
        _course_id: courseId
      });
      if (!active) return;
      setLoading(false);
      if (!error) setRows(data as Row[]);
    })();

    return () => { active = false; };
  }, [courseId, userId]);

  const grouped = useMemo(() => {
    if (!rows) return [];
    const topLevel = rows.filter(r => r.depth === 1);
    const map: Record<number, Row[]> = {};
    rows.forEach(r => {
      const parentTop = r.depth === 1 ? r.node_id : r.parent_id;
      map[parentTop] ||= [];
      map[parentTop].push(r);
    });
    return topLevel.map(top => ({
      top,
      children: (map[top.node_id] || []).filter(r => r.depth !== 1).sort((a,b) => a.child_position - b.child_position)
    }));
  }, [rows]);

  const getStatusIcon = (row: Row) => {
    if (row.is_completed) {
      return <CheckCircleIcon sx={{ fontSize: sz(20), color: 'success.main' }} />;
    }
    if (row.status === 'in_progress') {
      return <HourglassEmptyIcon sx={{ fontSize: sz(20), color: 'warning.main' }} />;
    }
    return <RadioButtonUncheckedIcon sx={{ fontSize: sz(20), color: 'action.disabled' }} />;
  };

  const getStatusChip = (row: Row) => {
    if (row.is_completed) {
      return (
        <Chip
          size="small"
          label="Completed"
          sx={{
            bgcolor: 'success.main',
            color: 'white',
            fontWeight: 600,
            height: sz(24),
            fontSize: sz(12),
            '& .MuiChip-label': { px: 1.5 },
          }}
        />
      );
    }
    if (row.status === 'in_progress') {
      return (
        <Chip
          size="small"
          label="In progress"
          sx={{
            bgcolor: 'warning.main',
            color: 'white',
            fontWeight: 600,
            height: sz(24),
            fontSize: sz(12),
            '& .MuiChip-label': { px: 1.5 },
          }}
        />
      );
    }
    return (
      <Chip
        size="small"
        label="Not started"
        variant="outlined"
        sx={{
          borderColor: 'grey.300',
          color: 'text.secondary',
          fontWeight: 500,
          height: sz(24),
          fontSize: sz(12),
          '& .MuiChip-label': { px: 1.5 },
        }}
      />
    );
  };

  return (
    <Box sx={{ p: 3, bgcolor: 'grey.50', minHeight: '100%' }}>
      {!courseId && (
        <Box sx={{ 
          p: 4, 
          textAlign: 'center',
          bgcolor: 'white',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'grey.200'
        }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: sz(14) }}>
            Pick a course to view progress.
          </Typography>
        </Box>
      )}
      
      {courseId && !userId && (
        <Box sx={{ 
          p: 4, 
          textAlign: 'center',
          bgcolor: 'white',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'grey.200'
        }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: sz(14) }}>
            Select a student from the list.
          </Typography>
        </Box>
      )}

      {loading && (
        <Stack alignItems="center" justifyContent="center" sx={{ py: 8 }}>
          <CircularProgress />
        </Stack>
      )}

      {!loading && rows && rows.length === 0 && (
        <Box sx={{ 
          p: 4, 
          textAlign: 'center',
          bgcolor: 'white',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'grey.200'
        }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: sz(14) }}>
            No lessons/chapters found.
          </Typography>
        </Box>
      )}

      {!loading && rows && rows.length > 0 && (
        <Stack spacing={2.5}>
          {grouped.map(({ top, children }) => (
            <Box 
              key={top.node_id} 
              sx={{ 
                bgcolor: 'white',
                borderRadius: 2.5,
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                transition: 'box-shadow 0.2s',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                }
              }}
            >
              {/* Lesson header */}
              <Stack 
                direction="row" 
                alignItems="center" 
                spacing={1.5} 
                sx={{ 
                  px: 3, 
                  py: 2.5,
                  bgcolor: top.is_completed ? 'success.50' : top.status === 'in_progress' ? 'warning.50' : 'grey.50',
                  borderBottom: '1px solid',
                  borderColor: 'grey.200'
                }}
              >
                {getStatusIcon(top)}
                <Typography sx={{ 
                  fontWeight: 700, 
                  fontSize: sz(17),
                  flex: 1,
                  color: 'text.primary'
                }}>
                  {top.title ?? 'Untitled lesson'}
                </Typography>
                {getStatusChip(top)}
              </Stack>

              {/* Children */}
              {children.length > 0 && (
                <Stack sx={{ p: 2.5 }} spacing={1.5}>
                  {children.map(ch => (
                    <Stack 
                      key={ch.node_id} 
                      direction="row" 
                      alignItems="center" 
                      spacing={1.5}
                      sx={{
                        p: 2,
                        borderRadius: 1.5,
                        bgcolor: 'grey.50',
                        transition: 'all 0.2s',
                        '&:hover': {
                          bgcolor: 'grey.100',
                          transform: 'translateX(4px)',
                        }
                      }}
                    >
                      {getStatusIcon(ch)}
                      <Typography sx={{ 
                        fontSize: sz(15),
                        flex: 1,
                        color: 'text.primary',
                        fontWeight: 500
                      }}>
                        {ch.title ?? 'Untitled chapter'}
                      </Typography>
                      {getStatusChip(ch)}
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}