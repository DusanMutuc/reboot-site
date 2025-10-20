'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';

import type { ContentBlock, NodeSubtree } from '@/types/course';
import {
  BlockRenderer,
  type RenderableBlock,
  type RenderableResource,
  type SmartDocClientProgress,
} from '@/components/course/BlockRenderer';
import { supabase } from '@/lib/supabaseClient';
import { useNodeProgress } from '@/hooks/useNodeProgress';

type LessonContentProps = {
  lesson: NodeSubtree | null;
  loading: boolean;
  error?: string | null;
  onCompleted?: (nodeId: number) => void;
};

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type ResourceState = LoadState;

function getContentLabels(node: NodeSubtree | null) {
  const type = node?.node.node_type;
  if (type === 'chapter') return { title: 'Chapter', lower: 'chapter' };
  if (type === 'lesson') return { title: 'Lesson', lower: 'lesson' };
  return { title: 'Item', lower: 'item' };
}

function toRenderableBlock(block: ContentBlock): RenderableBlock {
  return {
    id: block.id,
    block_type: block.block_type,
    position: block.position,
    text_md: block.text_md,
    resource_id: block.resource_id,
    smart_doc_id: block.smart_doc_id,
    start_ms: block.start_ms,
    end_ms: block.end_ms,
    label: block.label,
    settings: block.settings,
  };
}

export default function LessonContent({ lesson, loading, error, onCompleted }: LessonContentProps) {
  // Lazily loaded blocks for the currently selected lesson/chapter
  const [blocks, setBlocks] = useState<RenderableBlock[]>([]);
  const [blocksState, setBlocksState] = useState<LoadState>('idle');
  const [blocksError, setBlocksError] = useState<string | null>(null);

  // Media resources for asset blocks
  const [resources, setResources] = useState<Record<number, RenderableResource>>({});
  const [resourceState, setResourceState] = useState<ResourceState>('idle');
  const [resourceError, setResourceError] = useState<string | null>(null);

  // Smart Doc progress (per content_block_id)
  const [smartDocProgress, setSmartDocProgress] = useState<
    Record<number, { fields_total: number; fields_completed: number }>
  >({});
  // Smart Doc submission status
  const [smartDocStatus, setSmartDocStatus] = useState<
    Record<number, { status: 'draft' | 'submitted'; submitted_at: string | null }>
  >({});
  const [submitLoading, setSubmitLoading] = useState<Record<number, boolean>>({});
  const [clientSmartDocProgress, setClientSmartDocProgress] = useState<
    Record<number, SmartDocClientProgress>
  >({});
  const [videoProgressByBlock, setVideoProgressByBlock] = useState<Record<number, number>>({});

  const labels = getContentLabels(lesson);
  const nodeId = lesson?.node.id ?? null;
  const { markStarted, markCompleted } = useNodeProgress(nodeId);
  const completedOnceRef = useRef(false);

  const completeLesson = useCallback(async () => {
    if (!nodeId) return;
    try {
      await markCompleted();
      onCompleted?.(nodeId);
    } catch (e) {
      console.error('completeLesson failed', e);
    }
  }, [markCompleted, nodeId, onCompleted]);

  // ===== 1) Lazy-load blocks whenever the selected node changes =====
  useEffect(() => {
    if (!nodeId) {
      setBlocks([]);
      setBlocksState('idle');
      setBlocksError(null);
      setSmartDocProgress({});
      setSmartDocStatus({});
      setSubmitLoading({});
      setClientSmartDocProgress({});
      setVideoProgressByBlock({});
      completedOnceRef.current = false;
      return;
    }

    let active = true;

    // Clear immediately so previous lesson’s content doesn’t flash
    setBlocks([]);
    setBlocksState('loading');
    setBlocksError(null);
    setSmartDocProgress({});
    setSmartDocStatus({});
    setSubmitLoading({});
    setClientSmartDocProgress({});
    setVideoProgressByBlock({});
    completedOnceRef.current = false;

    (async () => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/blocks`);

        if (!active) return;

        if (res.status === 304) {
          setBlocksState('ready');
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? 'Failed to load blocks');
        }

        const { blocks } = (await res.json()) as { blocks: ContentBlock[] };
        if (!active) return;

        const renderable = (blocks ?? [])
          .map(toRenderableBlock)
          .sort((a, b) => a.position - b.position);

        setBlocks(renderable);
        setBlocksState('ready');
      } catch (e) {
        if (!active) return;
        setBlocks([]);
        setBlocksState('error');
        setBlocksError(e instanceof Error ? e.message : 'Failed to load blocks');
      }
    })();

    return () => {
      active = false;
    };
  }, [nodeId]);

  // Mark STARTED as soon as the content is ready/visible
  useEffect(() => {
    if (blocksState === 'ready' && nodeId) {
      markStarted();
    }
  }, [blocksState, nodeId, markStarted]);

  // Compute unique resource IDs from the *loaded blocks*
  const assetBlockIds = useMemo(() => {
    return blocks
      .filter((b) => b.block_type === 'asset' && b.resource_id)
      .map((b) => b.resource_id!)
      .filter((id, idx, arr) => arr.indexOf(id) === idx);
  }, [blocks]);

  // Smart Doc content_block_ids
  const smartDocBlockIds = useMemo(() => {
    return blocks.filter((b) => b.block_type === 'smart_doc').map((b) => b.id);
  }, [blocks]);

  const vimeoVideoBlockIds = useMemo(() => {
    if (!blocks || blocks.length === 0) return [] as number[];

    return blocks
      .filter((b) => b.block_type === 'asset' && b.resource_id)
      .filter((b) => {
        const resourceId = b.resource_id!;
        const resource = resources[resourceId];
        if (!resource) return false;
        const url = resource.url?.toLowerCase() ?? '';
        return url.includes('vimeo.com');
      })
      .map((b) => b.id);
  }, [blocks, resources]);

  // ===== 2) Load media resources for those asset blocks =====
  useEffect(() => {
    if (!nodeId || assetBlockIds.length === 0) {
      setResources({});
      setResourceState('idle');
      setResourceError(null);
      return;
    }

    let active = true;
    setResourceState('loading');
    setResourceError(null);

    (async () => {
      const { data, error: resError } = await supabase
        .from('resources')
        .select('id, title, type, url, thumbnail, duration')
        .in('id', assetBlockIds);

      if (!active) return;

      if (resError) {
        setResourceState('error');
        setResourceError(resError.message ?? 'Failed to load resources');
        setResources({});
        return;
      }

      const map: Record<number, RenderableResource> = {};
      for (const row of data ?? []) {
        map[row.id] = {
          id: row.id,
          title: row.title,
          type: row.type,
          url: row.url,
          thumbnail: row.thumbnail,
          duration: row.duration,
        };
      }
      setResources(map);
      setResourceState('ready');
    })();

    return () => {
      active = false;
    };
  }, [assetBlockIds, nodeId]);

  // ===== 3) Smart Doc progress polling (every 5s while lesson open) =====
  useEffect(() => {
    if (blocksState !== 'ready' || smartDocBlockIds.length === 0) {
      setSmartDocProgress({});
      setClientSmartDocProgress({});
      return;
    }

    let active = true;

    const fetchProgress = async () => {
      try {
        const entries = await Promise.all(
          smartDocBlockIds.map(async (content_block_id) => {
            const res = await fetch('/api/smartdoc/progress', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ content_block_id }),
            });
            if (!res.ok) throw new Error('progress fetch failed');
            const { progress } = (await res.json()) as {
              progress: { fields_total: number; fields_completed: number };
            };
            return [content_block_id, progress] as const;
          })
        );
        if (!active) return;

        const map: Record<number, { fields_total: number; fields_completed: number }> = {};
        for (const [id, p] of entries) {
          map[id] = { fields_total: p?.fields_total ?? 0, fields_completed: p?.fields_completed ?? 0 };
        }
        setSmartDocProgress(map);
      } catch {
        // swallow; next tick will retry
      }
    };

    // initial + interval
    void fetchProgress();
    const t = setInterval(fetchProgress, 5000);

    return () => {
      active = false;
      clearInterval(t);
    };
  }, [blocksState, smartDocBlockIds]);

  useEffect(() => {
    if (smartDocBlockIds.length === 0) return;
    setClientSmartDocProgress((prev) => {
      const next: Record<number, SmartDocClientProgress> = {};
      for (const id of smartDocBlockIds) {
        if (prev[id]) next[id] = prev[id];
      }
      return next;
    });
  }, [smartDocBlockIds]);

  useEffect(() => {
    if (vimeoVideoBlockIds.length === 0) {
      setVideoProgressByBlock((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      return;
    }

    setVideoProgressByBlock((prev) => {
      const next: Record<number, number> = {};
      let changed = false;
      for (const id of vimeoVideoBlockIds) {
        if (typeof prev[id] === 'number') {
          next[id] = prev[id];
        }
      }

      if (Object.keys(prev).length !== Object.keys(next).length) {
        changed = true;
      }

      if (!changed) {
        for (const id of vimeoVideoBlockIds) {
          if (next[id] !== prev[id]) {
            changed = true;
            break;
          }
        }
      }

      return changed ? next : prev;
    });
  }, [vimeoVideoBlockIds]);

  // ===== 3b) Smart Doc submission status (on mount/lesson change only) =====
  useEffect(() => {
    if (blocksState !== 'ready' || smartDocBlockIds.length === 0) {
      setSmartDocStatus({});
      return;
    }
    let active = true;

    (async () => {
      try {
        const entries = await Promise.all(
          smartDocBlockIds.map(async (content_block_id) => {
            const res = await fetch('/api/smartdoc/status', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ content_block_id }),
            });
            if (!res.ok) throw new Error('status fetch failed');
            const data = (await res.json()) as { status: 'draft' | 'submitted'; submitted_at: string | null };
            return [content_block_id, data] as const;
          })
        );
        if (!active) return;

        const map: Record<number, { status: 'draft' | 'submitted'; submitted_at: string | null }> = {};
        for (const [id, s] of entries) map[id] = s;
        setSmartDocStatus(map);
      } catch {
        // silent
      }
    })();

    return () => {
      active = false;
    };
  }, [blocksState, smartDocBlockIds]);

  // ===== 4) Completion rules =====
  // Rule change: completion requires *submitted* smart docs, not just "all fields filled"
  const allSmartDocsSubmitted = useMemo(() => {
    if (smartDocBlockIds.length === 0) return false;
    return smartDocBlockIds.every((id) => smartDocStatus[id]?.status === 'submitted');
  }, [smartDocBlockIds, smartDocStatus]);

  const allVideosComplete = useMemo(() => {
    if (vimeoVideoBlockIds.length === 0) return false;
    return vimeoVideoBlockIds.every((id) => {
      const percent = videoProgressByBlock[id] ?? 0;
      return percent >= 0.8;
    });
  }, [vimeoVideoBlockIds, videoProgressByBlock]);

  useEffect(() => {
    if (completedOnceRef.current) return;
    if (blocksState !== 'ready' || !nodeId) return;

    const hasSmartDocs = smartDocBlockIds.length > 0;
    const hasVideos = vimeoVideoBlockIds.length > 0;

    if (hasSmartDocs || hasVideos) {
      const smartDocsSatisfied = hasSmartDocs ? allSmartDocsSubmitted : true; // ⬅️ require submission
      const videosSatisfied = hasVideos ? allVideosComplete : true;

      if (smartDocsSatisfied && videosSatisfied) {
        completedOnceRef.current = true;
        void completeLesson();
      }
      return;
    }

    // Fallback: no SmartDocs and no trackable videos => complete on 80% scroll
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop;
      const h = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (h > 0 && y / h >= 0.8) {
        if (!completedOnceRef.current) {
          completedOnceRef.current = true;
          void completeLesson();
        }
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, [
    blocksState,
    nodeId,
    smartDocBlockIds.length,
    allSmartDocsSubmitted, // ⬅️ dependency changed
    vimeoVideoBlockIds.length,
    allVideosComplete,
    completeLesson,
  ]);

  // ===== 5) Submit handler for a specific Smart Doc placement =====
  const submitSmartDoc = async (content_block_id: number) => {
    setSubmitLoading((m) => ({ ...m, [content_block_id]: true }));
    try {
      const res = await fetch('/api/smartdoc/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content_block_id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.details ?? j?.error ?? 'Submit failed');
      }

      const { result } = (await res.json()) as {
        result: {
          fields_total: number;
          fields_completed: number;
          status: 'submitted' | 'draft';
          submitted_at: string | null;
        };
      };

      // Update local status first (this is the gate for completion)
      setSmartDocStatus((m) => ({
        ...m,
        [content_block_id]: { status: result.status, submitted_at: result.submitted_at },
      }));

      // Merge progress for UI labels (does not trigger completion anymore)
      setSmartDocProgress((prev) => ({
        ...prev,
        [content_block_id]: {
          fields_total: result.fields_total ?? (prev[content_block_id]?.fields_total ?? 0),
          fields_completed: result.fields_completed ?? (prev[content_block_id]?.fields_completed ?? 0),
        },
      }));

      // Immediately re-check submission-based completion after this submit
      const submittedNow = smartDocBlockIds.every(
        (id) => (id === content_block_id ? result.status === 'submitted' : smartDocStatus[id]?.status === 'submitted')
      );
      const videosSatisfied =
        vimeoVideoBlockIds.length === 0 ||
        vimeoVideoBlockIds.every((id) => (videoProgressByBlock[id] ?? 0) >= 0.8);

      if (!completedOnceRef.current && submittedNow && videosSatisfied && nodeId) {
        completedOnceRef.current = true;
        void completeLesson();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitLoading((m) => ({ ...m, [content_block_id]: false }));
    }
  };

  const handleClientSmartDocProgress = useCallback(
    (contentBlockId: number, progress: SmartDocClientProgress) => {
      setClientSmartDocProgress((prev) => ({ ...prev, [contentBlockId]: progress }));
    },
    []
  );

  const handleVideoProgress = useCallback((contentBlockId: number, percent: number) => {
    const clamped = Math.max(0, Math.min(1, percent));
    setVideoProgressByBlock((prev) => {
      const current = prev[contentBlockId] ?? 0;
      if (clamped <= current + 0.001) return prev;
      return { ...prev, [contentBlockId]: clamped };
    });
  }, []);

  // ===== Top-level loading/error/empty states =====
  if (loading) {
    return (
      <Stack alignItems="center" spacing={2} sx={{ py: 10 }}>
        <CircularProgress />
        <Typography color="text.secondary">Loading {labels.lower}…</Typography>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack spacing={2} sx={{ py: 6 }}>
        <Alert severity="error">{error}</Alert>
      </Stack>
    );
  }

  if (!lesson) {
    return (
      <Stack alignItems="center" spacing={2} sx={{ py: 10 }}>
        <Typography variant="h6">Select a chapter or lesson to get started</Typography>
        <Typography color="text.secondary" align="center">
          Choose an unlocked chapter or lesson from the outline to explore its content.
        </Typography>
      </Stack>
    );
  }

  const showResourceAlert = resourceState === 'error' && resourceError;

  return (
    <Box sx={{ py: { xs: 4, md: 6 } }}>
      <Stack spacing={3} sx={{ maxWidth: 860, mx: 'auto', px: { xs: 2, md: 4 } }}>
        <Box>
          <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 600 }}>
            {labels.title}
          </Typography>
          <Typography variant="h3" sx={{ fontWeight: 700 }}>
            {lesson.node.title ?? `Untitled ${labels.lower}`}
          </Typography>
          {lesson.node.description ? (
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {lesson.node.description}
            </Typography>
          ) : null}
        </Box>

        {/* Blocks load state */}
        {blocksState === 'loading' && (
          <Stack alignItems="center" spacing={1}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Loading content…
            </Typography>
          </Stack>
        )}

        {blocksState === 'error' && <Alert severity="warning">{blocksError}</Alert>}

        {blocksState === 'ready' && (
          <>
            {blocks.length === 0 ? (
              <Alert severity="info">This {labels.lower} doesn’t have any blocks yet.</Alert>
            ) : (
              <Stack spacing={3}>
                {blocks.map((block) => {
                  const resource = block.resource_id ? resources[block.resource_id] ?? null : null;
                  const isSmart = block.block_type === 'smart_doc';
                  const s = isSmart ? smartDocStatus[block.id] : undefined;
                  const p = isSmart ? smartDocProgress[block.id] : undefined;
                  const clientProgress = clientSmartDocProgress[block.id];
                  const hasServerTotals = Boolean(p && p.fields_total > 0);
                  const serverComplete = hasServerTotals
                    ? (p?.fields_completed ?? 0) >= (p?.fields_total ?? 0)
                    : undefined;
                  const effectiveComplete = serverComplete ?? clientProgress?.isComplete ?? false;

                  // Submit button enabled when all fields are filled, but we only mark lesson/chapter
                  // complete after *submit* (handled above).
                  const canSubmit = isSmart && s?.status !== 'submitted' && effectiveComplete;

                  const progressLabel = (() => {
                    const hasNumbers = (value: unknown): value is number =>
                      typeof value === 'number' && Number.isFinite(value);
                    if (p && hasNumbers(p.fields_total) && p.fields_total > 0) {
                      const total = p.fields_total;
                      const completed = hasNumbers(p.fields_completed) ? Math.min(p.fields_completed, total) : 0;
                      return `Progress: ${completed}/${total}`;
                    }
                    if (clientProgress) {
                      return clientProgress.total > 0
                        ? `Progress: ${clientProgress.completed}/${clientProgress.total}`
                        : 'Progress: —';
                    }
                    if (p && hasNumbers(p.fields_completed) && hasNumbers(p.fields_total)) {
                      return `Progress: ${p.fields_completed}/${p.fields_total}`;
                    }
                    return 'Progress: —';
                  })();

                  return (
                    <Box key={block.id}>
                      <BlockRenderer
                        block={block}
                        resource={resource}
                        previewMode
                        onSmartDocProgress={handleClientSmartDocProgress}
                        onVideoProgress={handleVideoProgress}
                      />
                      {isSmart && (
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            {progressLabel}
                            {s?.status === 'submitted' ? ' • Submitted' : ''}
                          </Typography>
                          <Box sx={{ flex: 1 }} />
                          <Button
                            size="small"
                            variant="contained"
                            disabled={!canSubmit || !!submitLoading[block.id]}
                            onClick={() => submitSmartDoc(block.id)}
                          >
                            {s?.status === 'submitted' ? 'Submitted' : submitLoading[block.id] ? 'Submitting…' : 'Submit'}
                          </Button>
                        </Stack>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            )}
          </>
        )}

        {resourceState === 'loading' ? (
          <Typography variant="body2" color="text.secondary">
            Loading media resources…
          </Typography>
        ) : null}

        {showResourceAlert ? <Alert severity="warning">{resourceError}</Alert> : null}
      </Stack>
    </Box>
  );
}
