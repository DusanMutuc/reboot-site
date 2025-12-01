'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabaseClient';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Chip,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
  Paper,
  Tooltip,
  Button,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

const COACH_UI_SCALE = 1.07;

type Mode = 'coach' | 'admin';

// generic json type for Supabase
type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

type InstanceRow = {
  lesson_id: number;
  lesson_title: string | null;
  lesson_position: number;
  chapter_id: number;
  chapter_title: string | null;
  chapter_position: number;
  content_block_id: number;
  doc_id: number;
  doc_title: string | null;
  status: string | null;
  submitted_at: string | null;
  has_any_response: boolean;
  answered_prompts: number;
  total_prompts: number;
};

type AnswerRow = {
  doc_id: number;
  doc_title: string | null;
  prompt_id: number;
  prompt_label: string | null;
  prompt_type: string | null;
  prompt_position: number | null;
  value_text: string | null;
  value_json: Json | null;
  updated_at: string | null;
  status: string | null;
  submitted_at: string | null;
};

export default function SmartDocsAnswers({
  courseId,
  userId,
  mode,
}: {
  courseId: number | null;
  userId: string | null;
  mode?: Mode;
}) {
  const isCoach = mode === 'coach';
  const sz = (px: number) => (isCoach ? Math.round(px * COACH_UI_SCALE) : px);

  const [onlySubmitted, setOnlySubmitted] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [instances, setInstances] = useState<InstanceRow[]>([]);
  const [answers, setAnswers] = useState<Record<number, { loading: boolean; rows: AnswerRow[] | null }>>({});

  // Export / print state
  const [exporting, setExporting] = useState(false);
  const [showPrintView, setShowPrintView] = useState(false);

  // Portal root for print-only rendering
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('smartdocs-print-root') as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'smartdocs-print-root';
      el.style.position = 'fixed';
      el.style.left = '-99999px'; // keep out of layout until print
      document.body.appendChild(el);
    }
    setPrintRoot(el);
  }, []);

  useEffect(() => {
    let active = true;
    setInstances([]);
    setAnswers({});
    if (!courseId || !userId) return;

    (async () => {
      setLoadingList(true);
      const { data, error } = await supabase.rpc('list_user_smartdoc_instances', {
        _user_id: userId,
        _course_id: courseId,
        _only_submitted: onlySubmitted,
      });
      if (!active) return;
      setLoadingList(false);
      if (!error && Array.isArray(data)) {
        setInstances(data as InstanceRow[]);
      }
    })();

    return () => {
      active = false;
    };
  }, [courseId, userId, onlySubmitted]);

  const grouped = useMemo(() => {
    const lessons = new Map<
      number,
      {
        lesson_title: string | null;
        lesson_position: number;
        chapters: Map<
          number,
          {
            chapter_title: string | null;
            chapter_position: number;
            items: InstanceRow[];
          }
        >;
      }
    >();

    for (const row of instances) {
      if (!lessons.has(row.lesson_id)) {
        lessons.set(row.lesson_id, {
          lesson_title: row.lesson_title,
          lesson_position: row.lesson_position,
          chapters: new Map(),
        });
      }
      const L = lessons.get(row.lesson_id)!;

      if (!L.chapters.has(row.chapter_id)) {
        L.chapters.set(row.chapter_id, {
          chapter_title: row.chapter_title,
          chapter_position: row.chapter_position,
          items: [],
        });
      }
      L.chapters.get(row.chapter_id)!.items.push(row);
    }

    const lessonArr = Array.from(lessons.entries())
      .map(([lesson_id, v]) => ({ lesson_id, ...v }))
      .sort((a, b) => a.lesson_position - b.lesson_position);

    return lessonArr.map((l) => ({
      ...l,
      chapters: Array.from(l.chapters.entries())
        .map(([chapter_id, v]) => ({ chapter_id, ...v }))
        .sort((a, b) => a.chapter_position - b.chapter_position),
    }));
  }, [instances]);

  // Fetch answers for a single content block (returns Promise so we can await it)
  const ensureAnswers = useCallback(
    async (contentBlockId: number) => {
      // functional set to avoid capturing `answers` in deps
      let shouldFetch = false;
      setAnswers((prev) => {
        const existing = prev[contentBlockId];
        if (existing?.rows || existing?.loading) {
          return prev;
        }
        shouldFetch = true;
        return {
          ...prev,
          [contentBlockId]: { loading: true, rows: null },
        };
      });

      if (!shouldFetch) return;

      const { data, error } = await supabase.rpc('get_user_smartdoc_answers', {
        _user_id: userId,
        _content_block_id: contentBlockId,
      });

      setAnswers((prev) => ({
        ...prev,
        [contentBlockId]: {
          loading: false,
          rows: !error && Array.isArray(data) ? (data as AnswerRow[]) : [],
        },
      }));
    },
    [userId]
  );

  // Preload answers for everything so print view is fully populated
  const prefetchAllAnswers = useCallback(async () => {
    const ids = Array.from(new Set(instances.map((i) => i.content_block_id)));
    const BATCH = 8;
    for (let i = 0; i < ids.length; i += BATCH) {
      await Promise.all(ids.slice(i, i + BATCH).map((id) => ensureAnswers(id)));
    }
  }, [instances, ensureAnswers]);

  // Trigger print after the print-view renders
  useEffect(() => {
    if (!showPrintView) return;
    const t = setTimeout(() => {
      window.print();
      setShowPrintView(false);
      setExporting(false);
    }, 300);
    return () => clearTimeout(t);
  }, [showPrintView]);

  const handleExportPdf = useCallback(async () => {
    try {
      setExporting(true);
      if (!instances.length) {
        setExporting(false);
        return;
      }
      await prefetchAllAnswers();
      setShowPrintView(true);
    } catch (e) {
      console.error('Export to PDF failed:', e);
      setExporting(false);
    }
  }, [instances.length, prefetchAllAnswers]);

  const statusChip = (row: InstanceRow) => {
    const base = {
      size: 'small' as const,
      sx: {
        height: sz(26),
        fontWeight: 600,
        '& .MuiChip-label': { fontSize: sz(12), px: 1.5 },
        '& .MuiSvgIcon-root': { fontSize: sz(16) },
      },
    };
    if (!row.has_any_response) {
      return (
        <Chip
          {...base}
          variant="outlined"
          icon={<RadioButtonUncheckedIcon />}
          label="No response"
          sx={{ ...base.sx, borderColor: 'grey.300', color: 'text.secondary' }}
        />
      );
    }
    if (row.status === 'submitted') {
      return (
        <Chip
          {...base}
          icon={<CheckCircleIcon />}
          label="Submitted"
          sx={{ ...base.sx, bgcolor: 'success.main', color: 'white' }}
        />
      );
    }
    return (
      <Chip
        {...base}
        icon={<HourglassEmptyIcon />}
        label={row.status === 'in_progress' ? 'In progress' : 'Draft'}
        sx={{ ...base.sx, bgcolor: 'warning.main', color: 'white' }}
      />
    );
  };

  const progressChip = (row: InstanceRow) => (
    <Chip
      size="small"
      label={`${row.answered_prompts}/${row.total_prompts}`}
      sx={{
        height: sz(26),
        bgcolor: row.answered_prompts === row.total_prompts ? 'success.50' : 'grey.100',
        color: row.answered_prompts === row.total_prompts ? 'success.dark' : 'text.secondary',
        fontWeight: 600,
        '& .MuiChip-label': { fontSize: sz(12), px: 1.5 },
      }}
    />
  );

  // ------- PRINT VIEW (rendered into portal) -------
  const PrintView = () => (
    <Box sx={{ p: 0 /* padding handled via @page margin rule below */ }}>
      <Typography sx={{ fontWeight: 800, fontSize: sz(20), mb: 2 }}>SmartDocs – Answers</Typography>

      <Stack spacing={3.5}>
        {grouped.map((lesson) => (
          <Box key={`p-${lesson.lesson_id}`} sx={{ breakInside: 'avoid' }}>
            <Typography
              sx={{
                fontWeight: 800,
                mb: 2,
                fontSize: sz(18),
                color: 'text.primary',
                pb: 1,
                borderBottom: '2px solid',
                borderColor: 'primary.main',
              }}
            >
              {lesson.lesson_title ?? `Lesson ${lesson.lesson_position}`}
            </Typography>

            <Stack spacing={2}>
              {lesson.chapters.map((ch) => (
                <Box key={`p-${lesson.lesson_id}-${ch.chapter_id}`} sx={{ breakInside: 'avoid' }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 700,
                      mb: 1.5,
                      fontSize: sz(15),
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {ch.chapter_title ?? `Chapter ${ch.chapter_position}`}
                  </Typography>

                  <Stack spacing={1.5}>
                    {ch.items.map((inst) => {
                      const a = answers[inst.content_block_id];
                      const rows = a?.rows ?? [];
                      return (
                        <Box
                          key={`p-${inst.content_block_id}`}
                          sx={{
                            p: 2.5,
                            border: '1px solid',
                            borderColor: 'grey.300',
                            borderRadius: 2,
                            bgcolor: 'grey.50',
                            mb: 1.5,
                            breakInside: 'avoid',
                          }}
                        >
                          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: sz(15), flex: 1 }}>
                              {inst.doc_title ?? `Smart Doc #${inst.doc_id}`}
                            </Typography>
                            {progressChip(inst)}
                            {statusChip(inst)}
                            {inst.submitted_at && (
                              <Chip
                                size="small"
                                variant="outlined"
                                label={new Date(inst.submitted_at).toLocaleDateString()}
                                sx={{
                                  height: sz(26),
                                  borderColor: 'grey.300',
                                  color: 'text.secondary',
                                  '& .MuiChip-label': { fontSize: sz(11), px: 1 },
                                }}
                              />
                            )}
                          </Stack>

                          {!a || a.loading ? (
                            <Typography variant="body2" sx={{ fontSize: sz(14), fontStyle: 'italic' }}>
                              Loading…
                            </Typography>
                          ) : rows.length > 0 ? (
                            <Stack spacing={2}>
                              {rows.map((it) => (
                                <Box
                                  key={`p-q-${it.prompt_id}`}
                                  sx={{
                                    p: 2,
                                    border: '1px solid',
                                    borderColor: 'grey.200',
                                    borderRadius: 2,
                                    bgcolor: 'white',
                                    breakInside: 'avoid',
                                  }}
                                >
                                  <Typography sx={{ fontWeight: 700, fontSize: sz(14), mb: 0.5 }}>
                                    {it.prompt_label ?? `Question ${it.prompt_id}`}
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      whiteSpace: 'pre-wrap',
                                      fontSize: sz(14),
                                      color: 'text.secondary',
                                      lineHeight: 1.6,
                                      fontStyle: it.value_text ? 'normal' : 'italic',
                                    }}
                                  >
                                    {it.value_text || 'No answer provided'}
                                  </Typography>
                                  {it.updated_at && (
                                    <Typography
                                      variant="caption"
                                      sx={{ fontSize: sz(12), color: 'text.disabled', mt: 0.5, display: 'block' }}
                                    >
                                      Updated {new Date(it.updated_at).toLocaleString()}
                                    </Typography>
                                  )}
                                </Box>
                              ))}
                            </Stack>
                          ) : (
                            <Typography variant="body2" sx={{ fontSize: sz(14), fontStyle: 'italic' }}>
                              No answers yet
                            </Typography>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );

  return (
    <>
      {/* Global print rules: only print the portal content */}
      <style>{`
  @media print {
    html, body { margin: 0; padding: 0; }

    /* Hide everything except the portal (only top-level siblings) */
    body > *:not(#smartdocs-print-root) { display: none !important; }

    /* Show the portal as the printable document */
    #smartdocs-print-root {
      display: block !important;
      position: static !important;
      width: auto !important;
      height: auto !important;
      padding: 16mm;
    }

    /* Keep original component layouts (chips stay inline-flex, etc.) */
    /* (No rule for #smartdocs-print-root * !) */

    /* Better color fidelity */
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    @page { margin: 0; }
  }
`}</style>

      {/* PRINT VIEW rendered into body portal only when exporting */}
      {showPrintView && printRoot && createPortal(<PrintView />, printRoot)}

      {/* NORMAL SCREEN VIEW */}
      <Paper
        elevation={0}
        sx={{
          border: '1px solid',
          borderColor: 'grey.200',
          borderRadius: 3,
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <Box
          sx={{
            px: 3,
            py: 2,
            bgcolor: 'grey.50',
            borderBottom: '2px solid',
            borderColor: 'grey.200',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={2}>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 800,
                fontSize: sz(16),
                color: 'text.primary',
                letterSpacing: 0.3,
              }}
            >
              SmartDocs Answers
            </Typography>

            <FormControlLabel
              sx={{
                ml: 1,
                '& .MuiFormControlLabel-label': { fontSize: sz(13), fontWeight: 500 },
              }}
              control={<Switch size="small" checked={onlySubmitted} onChange={(e) => setOnlySubmitted(e.target.checked)} />}
              label="Submitted only"
            />

            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
              {loadingList && <CircularProgress size={sz(18)} thickness={4} />}
              {!loadingList && !!instances.length && (
                <Chip
                  size="small"
                  label={`${instances.length} ${instances.length === 1 ? 'doc' : 'docs'}`}
                  sx={{
                    height: sz(26),
                    bgcolor: 'primary.50',
                    color: 'primary.main',
                    fontWeight: 600,
                    '& .MuiChip-label': { fontSize: sz(12), px: 1.5 },
                  }}
                />
              )}

              <Button
                variant="contained"
                size="small"
                startIcon={<PictureAsPdfIcon />}
                onClick={handleExportPdf}
                disabled={exporting || loadingList || !instances.length}
                sx={{ ml: 1, fontSize: sz(12), fontWeight: 700, height: sz(28) }}
              >
                {exporting ? 'Preparing…' : 'Export PDF'}
              </Button>
            </Box>
          </Stack>
        </Box>

        {!courseId || !userId ? (
          <Box sx={{ px: 3, py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: sz(14) }}>
              Pick a course and select a student to view their SmartDocs.
            </Typography>
          </Box>
        ) : loadingList ? (
          <Box sx={{ px: 3, py: 6, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={sz(24)} />
          </Box>
        ) : instances.length === 0 ? (
          <Box sx={{ px: 3, py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: sz(14) }}>
              No SmartDocs found for this student in this course.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 3 }}>
            <Stack spacing={3.5}>
              {grouped.map((lesson) => (
                <Box key={lesson.lesson_id}>
                  <Typography
                    sx={{
                      fontWeight: 800,
                      mb: 2,
                      fontSize: sz(18),
                      color: 'text.primary',
                      pb: 1,
                      borderBottom: '2px solid',
                      borderColor: 'primary.main',
                    }}
                  >
                    {lesson.lesson_title ?? `Lesson ${lesson.lesson_position}`}
                  </Typography>

                  <Stack spacing={2}>
                    {lesson.chapters.map((ch) => (
                      <Box key={ch.chapter_id}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            mb: 1.5,
                            fontSize: sz(15),
                            color: 'text.secondary',
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                          }}
                        >
                          {ch.chapter_title ?? `Chapter ${ch.chapter_position}`}
                        </Typography>

                        <Stack spacing={1.5}>
                          {ch.items.map((inst) => {
                            const a = answers[inst.content_block_id];
                            return (
                              <Accordion
                                key={inst.content_block_id}
                                disableGutters
                                elevation={0}
                                sx={{
                                  border: '1px solid',
                                  borderColor: 'grey.200',
                                  borderRadius: 2,
                                  overflow: 'hidden',
                                  transition: 'all 0.2s',
                                  '&:before': { display: 'none' },
                                  '&:hover': {
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                    borderColor: 'grey.300',
                                  },
                                  '&.Mui-expanded': {
                                    margin: 0,
                                    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                                  },
                                }}
                                onChange={(_, expanded) => {
                                  if (expanded) ensureAnswers(inst.content_block_id);
                                }}
                              >
                                <AccordionSummary
                                  expandIcon={<ExpandMoreIcon sx={{ fontSize: sz(22) }} />}
                                  sx={{
                                    '& .MuiAccordionSummary-content': {
                                      my: 1.5,
                                      alignItems: 'center',
                                    },
                                    px: 2.5,
                                    bgcolor: 'grey.50',
                                    '&:hover': { bgcolor: 'grey.100' },
                                  }}
                                >
                                  <Stack
                                    direction="row"
                                    alignItems="center"
                                    spacing={1.5}
                                    sx={{ width: '100%', pr: 1 }}
                                  >
                                    <Typography
                                      sx={{
                                        fontWeight: 700,
                                        flex: 1,
                                        fontSize: sz(15),
                                        color: 'text.primary',
                                      }}
                                    >
                                      {inst.doc_title ?? `Smart Doc #${inst.doc_id}`}
                                    </Typography>

                                    <Stack direction="row" spacing={1} alignItems="center">
                                      <Tooltip title="Answered / Total questions">{progressChip(inst)}</Tooltip>

                                      {statusChip(inst)}

                                      {inst.submitted_at && (
                                        <Chip
                                          size="small"
                                          variant="outlined"
                                          label={new Date(inst.submitted_at).toLocaleDateString()}
                                          sx={{
                                            height: sz(26),
                                            borderColor: 'grey.300',
                                            color: 'text.secondary',
                                            '& .MuiChip-label': { fontSize: sz(11), px: 1 },
                                          }}
                                        />
                                      )}
                                    </Stack>
                                  </Stack>
                                </AccordionSummary>

                                <AccordionDetails sx={{ p: 2.5, bgcolor: 'white' }}>
                                  {!a || a.loading ? (
                                    <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
                                      <CircularProgress size={sz(24)} />
                                    </Box>
                                  ) : a.rows && a.rows.length > 0 ? (
                                    <Stack spacing={2}>
                                      {a.rows.map((it) => (
                                        <Box
                                          key={it.prompt_id}
                                          sx={{
                                            p: 2.5,
                                            border: '1px solid',
                                            borderColor: 'grey.200',
                                            borderRadius: 2,
                                            bgcolor: 'grey.50',
                                            transition: 'all 0.2s',
                                            '&:hover': {
                                              bgcolor: 'grey.100',
                                              borderColor: 'grey.300',
                                            },
                                          }}
                                        >
                                          <Stack spacing={1}>
                                            <Typography
                                              sx={{
                                                fontWeight: 700,
                                                fontSize: sz(14),
                                                color: 'text.primary',
                                              }}
                                            >
                                              {it.prompt_label ?? `Question ${it.prompt_id}`}
                                            </Typography>

                                            <Typography
                                              variant="body2"
                                              sx={{
                                                whiteSpace: 'pre-wrap',
                                                fontSize: sz(14),
                                                color: 'text.secondary',
                                                lineHeight: 1.6,
                                                fontStyle: it.value_text ? 'normal' : 'italic',
                                              }}
                                            >
                                              {it.value_text || 'No answer provided'}
                                            </Typography>

                                            {it.updated_at && (
                                              <Typography
                                                variant="caption"
                                                sx={{
                                                  fontSize: sz(12),
                                                  color: 'text.disabled',
                                                  mt: 0.5,
                                                }}
                                              >
                                                Updated {new Date(it.updated_at).toLocaleString()}
                                              </Typography>
                                            )}
                                          </Stack>
                                        </Box>
                                      ))}
                                    </Stack>
                                  ) : (
                                    <Box sx={{ py: 2, textAlign: 'center' }}>
                                      <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{ fontSize: sz(14), fontStyle: 'italic' }}
                                      >
                                        No answers yet
                                      </Typography>
                                    </Box>
                                  )}
                                </AccordionDetails>
                              </Accordion>
                            );
                          })}
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </Paper>
    </>
  );
}
