'use client';

import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import DOMPurify from 'dompurify';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  CircularProgress,
  Divider,
  FormControl,
  FormLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import InsertLinkIcon from '@mui/icons-material/InsertLink';
import ImageIcon from '@mui/icons-material/Image';
import TextSnippetIcon from '@mui/icons-material/TextSnippet';

import { supabase } from '@/lib/supabaseClient';

export type RenderableBlock = {
  id: number;
  block_type: 'text' | 'asset' | 'divider' | 'smart_doc';
  position: number;
  text_md: string | null;
  resource_id: number | null;
  smart_doc_id: number | null;
  start_ms: number | null;
  end_ms: number | null;
  label: string | null;
};

export type RenderableResource = {
  id: number;
  title: string;
  type: string | null;
  url: string | null;
  thumbnail: string | null;
  duration: number | null;
};

type SmartDocPrompt = {
  id: number;
  position: number;
  label: string;
  prompt_type: 'text' | 'textarea';
  help_text: string | null;
  required: boolean;
};

type SmartDocRecord = {
  id: number;
  title: string;
  description: string | null;
  is_published: boolean;
  prompts: SmartDocPrompt[];
};

type SmartDocState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; doc: SmartDocRecord };

type SmartDocPromptRow = {
  id: number;
  position: number;
  label: string | null;
  prompt_type: SmartDocPrompt['prompt_type'];
  help_text: string | null;
  required: boolean;
};

/** ---------- Shared field/label styles ---------- */
const FIELD_SX = {
  bgcolor: 'grey.100',
  borderRadius: 2,
  px: 2,
  py: 1,
  border: '1px solid',
  borderColor: 'transparent',
  alignItems: 'flex-start',
  '& .MuiInputBase-input': { py: 1.25 },
  '& textarea': { py: 1.25 },
  '&:hover': { bgcolor: 'grey.100' },
  '&.Mui-focused': {
    bgcolor: 'common.white',
    borderColor: 'primary.light',
    boxShadow: (t: Theme) => `0 0 0 3px ${alpha(t.palette.primary.main, 0.18)}`,
  },
} as const;

const LABEL_SX = {
  fontWeight: 700,
  fontSize: '1.6rem',
  lineHeight: 1.3,
  color: 'text.primary',
  mb: 1,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
} as const;

/** --------------------------------------------------------------------------- */

export type SmartDocClientProgress = {
  total: number;
  completed: number;
  isComplete: boolean;
};

export type BlockRendererProps = {
  block: RenderableBlock;
  resource: RenderableResource | null;
  previewMode?: boolean;
  onSmartDocProgress?: (contentBlockId: number, progress: SmartDocClientProgress) => void;
};

/** --------------------------------------------------------------------------- */
/** Tiny in-memory cache per SmartDoc placement to hide StrictMode double-mount */
type SmartDocCacheEntry = {
  state: SmartDocState;
  values: Record<number, string>;
  submitted: boolean;
};
const smartDocCache = new Map<string, SmartDocCacheEntry>();
const cacheKeyFor = (contentBlockId: number, docId: number) => `${contentBlockId}:${docId}`;
/** --------------------------------------------------------------------------- */

function SmartDocPromptField({
  prompt,
  value,
  onChange,
  disabled,
}: {
  prompt: SmartDocPrompt;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const isTextarea = prompt.prompt_type === 'textarea';
  const label = useMemo(() => prompt.label?.trim() || 'Question', [prompt.label]);
  const helper = prompt.help_text?.trim();

  return (
    <FormControl fullWidth sx={{ mb: 4 }} disabled={disabled} required>
      <FormLabel sx={LABEL_SX}>
        {label}
        <Box component="span" sx={{ color: 'error.main', lineHeight: 1 }}>
          *
        </Box>
      </FormLabel>

      {helper && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {helper}
        </Typography>
      )}

      <TextField
        fullWidth
        variant="filled"
        label={undefined}
        placeholder=""
        multiline={isTextarea}
        minRows={isTextarea ? 6 : undefined}
        InputProps={{ disableUnderline: true, sx: FIELD_SX }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
    </FormControl>
  );
}
function SmartDocPreview({
  docId,
  contentBlockId, // placement id (content_blocks.id)
  fallbackLabel,
  onProgressChange,
}: {
  docId: number;
  contentBlockId: number;
  fallbackLabel: string | null;
  onProgressChange?: (progress: SmartDocClientProgress) => void;
}) {
  const [state, setState] = useState<SmartDocState>({ status: 'idle' });
  const [values, setValues] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const timers = useRef<Record<number, number | undefined>>({});

  // Identity for this placement/doc
  const renderKey = `${contentBlockId}:${docId}`;
  const lastKeyRef = useRef(renderKey);
  const identityChanged = lastKeyRef.current !== renderKey;

  // EARLY GUARD: if identity changed, don't render stale content even for a frame
  if (identityChanged) {
    const wrapSx = { maxWidth: 920, mx: 'auto', px: { xs: 2, sm: 0 } } as const;
    return (
      <Stack spacing={2} alignItems="center" justifyContent="center" sx={{ ...wrapSx, py: 4 }}>
        <CircularProgress size={22} />
        <Typography variant="body2" color="text.secondary">Loading…</Typography>
      </Stack>
    );
  }

  // Reset state BEFORE paint when identity changes
  useLayoutEffect(() => {
    if (!identityChanged) return;
    lastKeyRef.current = renderKey;
    setState({ status: 'loading' });
    setValues({});
    setSubmitted(false);
  }, [identityChanged, renderKey]);

  // Fetch doc + status + values together; only set "ready" once everything is in
  useEffect(() => {
    let active = true;

    async function loadAll() {
      try {
        // 1) Doc + prompts
        const { data, error } = await supabase
          .from('smart_docs')
          .select(
            `id, title, description, is_published, smart_doc_prompts:smart_doc_prompts (
              id, position, label, prompt_type, help_text, required
            )`,
          )
          .eq('id', docId)
          .single();

        if (!active) return;
        if (error || !data) {
          setState({ status: 'error', message: error?.message ?? 'Smart doc not found' });
          return;
        }

        const rawPrompts = (data.smart_doc_prompts ?? []) as SmartDocPromptRow[];
        const prompts: SmartDocPrompt[] = (rawPrompts ?? [])
          .map((p): SmartDocPrompt => ({
            id: p.id,
            position: p.position,
            label: p.label ?? '',
            prompt_type: p.prompt_type,
            help_text: p.help_text,
            required: true, // product decision: all required
          }))
          .sort((a, b) => a.position - b.position);

        // 2) In parallel: status + values (two-step for values)
        const statusPromise = (async () => {
          try {
            const res = await fetch('/api/smartdoc/status', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ content_block_id: contentBlockId }),
            });
            if (!res.ok) return { status: 'draft' as const, submitted_at: null as string | null };
            return (await res.json()) as { status: 'draft' | 'submitted'; submitted_at: string | null };
          } catch {
            return { status: 'draft' as const, submitted_at: null as string | null };
          }
        })();

        const valuesPromise = (async () => {
          // envelope row
          const { data: resp, error: respErr } = await supabase
            .from('smart_doc_responses')
            .select('id')
            .eq('content_block_id', contentBlockId)
            .maybeSingle();

          if (respErr || !resp?.id) return {} as Record<number, string>;

          const { data: vals } = await supabase
            .from('smart_doc_response_values')
            .select('prompt_id, value_json')
            .eq('response_id', resp.id);

          const map: Record<number, string> = {};
          for (const row of vals ?? []) {
            map[row.prompt_id] =
              typeof row.value_json === 'string'
                ? row.value_json
                : row.value_json?.value ?? row.value_json?.text ?? '';
          }
          return map;
        })();

        const [statusData, valueMap] = await Promise.all([statusPromise, valuesPromise]);
        if (!active) return;

        // Set everything in one go; avoid intermediate "ready with empty values"
        setSubmitted(statusData.status === 'submitted');
        setValues(valueMap);

        setState({
          status: 'ready',
          doc: {
            id: data.id,
            title: data.title,
            description: data.description,
            is_published: data.is_published,
            prompts,
          },
        });
      } catch (e) {
        if (!active) return;
        setState({ status: 'error', message: e instanceof Error ? e.message : 'Failed to load smart doc' });
      }
    }

    void loadAll();

    return () => {
      active = false;
      // clear any pending timers
      for (const k of Object.keys(timers.current)) {
        window.clearTimeout(timers.current[+k]);
      }
      timers.current = {};
    };
  }, [renderKey, docId, contentBlockId]);

  // ----- progress snapshot -----
  const progressSnapshot = useMemo<SmartDocClientProgress | null>(() => {
    if (state.status !== 'ready') return null;
    const total = state.doc.prompts.length;
    const completed = state.doc.prompts.filter((p) => (values[p.id]?.trim()?.length ?? 0) > 0).length;
    return { total, completed, isComplete: total > 0 && completed === total };
  }, [state, values]);

  useEffect(() => {
    if (!progressSnapshot || !onProgressChange) return;
    onProgressChange(progressSnapshot);
  }, [progressSnapshot, onProgressChange]);

  // Guard against stale ready doc
  const isDocMismatch = state.status === 'ready' && state.doc.id !== docId;

  if (state.status !== 'ready' || isDocMismatch) {
    const wrapSx = { maxWidth: 920, mx: 'auto', px: { xs: 2, sm: 0 } } as const;

    if (state.status === 'error' && !isDocMismatch) {
      return (
        <Stack spacing={1} sx={{ ...wrapSx, py: 2 }}>
          <Typography variant="h6">{fallbackLabel ?? 'Smart doc'}</Typography>
          <Typography variant="body2" color="error.main">
            Failed to load: {state.message}
          </Typography>
        </Stack>
      );
    }

    return (
      <Stack spacing={2} alignItems="center" justifyContent="center" sx={{ ...wrapSx, py: 4 }}>
        <CircularProgress size={22} />
        <Typography variant="body2" color="text.secondary">Loading…</Typography>
      </Stack>
    );
  }

  const { doc } = state;
  const title = doc.title?.trim() || fallbackLabel || 'Smart doc';
  const wrapSx = { maxWidth: 920, mx: 'auto', px: { xs: 2, sm: 0 } } as const;

  const upsertValue = (promptId: number, value: string) => {
    // optimistic UI
    setValues((v) => ({ ...v, [promptId]: value }));

    // debounce one request per prompt
    window.clearTimeout(timers.current[promptId]);
    timers.current[promptId] = window.setTimeout(async () => {
      try {
        await fetch('/api/smartdoc/upsert', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            content_block_id: contentBlockId,
            prompt_id: promptId,
            value,
          }),
        });
      } catch (e) {
        console.error('smartdoc upsert failed', e);
      }
    }, 400);
  };

  return (
    <Stack spacing={3} sx={wrapSx}>
      <Typography
        component="h2"
        variant="h2"
        sx={{ fontWeight: 650, fontSize: { xs: '1.35rem', sm: '2rem' }, lineHeight: 1.25 }}
      >
        {title}
      </Typography>

      {doc.description?.trim() && (
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720 }}>
          {doc.description}
        </Typography>
      )}

      <Box>
        {doc.prompts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No questions yet.</Typography>
        ) : (
          doc.prompts.map((p) => (
            <SmartDocPromptField
              key={p.id}
              prompt={p}
              value={values[p.id] ?? ''}
              onChange={(v) => upsertValue(p.id, v)}
              disabled={submitted}
            />
          ))
        )}
      </Box>
    </Stack>
  );
}


/** Memoized version to avoid unnecessary rerenders when parents update */
const MemoSmartDocPreview = React.memo(SmartDocPreview);

/* --------------------------- Media renderers --------------------------- */

function formatDuration(seconds: number | null) {
  if (!seconds || Number.isNaN(seconds)) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function VideoPreview({ resource }: { resource: RenderableResource }) {
  if (!resource.url) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1} alignItems="flex-start">
            <Stack direction="row" spacing={1} alignItems="center">
              <PlayArrowIcon fontSize="small" />
              <Typography variant="subtitle1">{resource.title}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Video resource missing URL.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  const lower = resource.url.toLowerCase();
  const isYoutube = lower.includes('youtube.com') || lower.includes('youtu.be');
  const isVimeo = lower.includes('vimeo.com');

  const frameWrapper = (src: string, allow: string, title: string) => (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        maxWidth: 860,
        mx: 'auto',
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: 'common.black',
        pb: '56.25%',
        height: 0,
      }}
    >
      <Box
        component="iframe"
        title={title}
        src={src}
        allow={allow}
        allowFullScreen
        sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
      />
    </Box>
  );

  if (isYoutube) {
    try {
      const url = new URL(resource.url);
      let videoId = url.searchParams.get('v');
      if (!videoId && lower.includes('youtu.be')) {
        videoId = resource.url.split('/').pop() ?? '';
      }
      if (videoId) {
        return frameWrapper(
          `https://www.youtube.com/embed/${videoId}`,
          'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
          resource.title,
        );
      }
    } catch {
      // fall back
    }
  }

  if (isVimeo) {
    const segments = resource.url.split('/');
    const id = segments[segments.length - 1];
    if (id) {
      return frameWrapper(
        `https://player.vimeo.com/video/${id}`,
        'autoplay; fullscreen; picture-in-picture',
        resource.title,
      );
    }
  }

  return (
    <Card variant="outlined">
      {resource.thumbnail && (
        <CardMedia component="img" image={resource.thumbnail} alt={resource.title} sx={{ maxHeight: 320, objectFit: 'cover' }} />
      )}
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="subtitle1">{resource.title}</Typography>
          <Button
            variant="outlined"
            size="small"
            endIcon={<OpenInNewIcon fontSize="small" />}
            href={resource.url ?? undefined}
            target="_blank"
            rel="noreferrer"
          >
            Open video
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function AudioPreview({ resource }: { resource: RenderableResource }) {
  if (!resource.url) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1} alignItems="flex-start">
            <Stack direction="row" spacing={1} alignItems="center">
              <HeadphonesIcon fontSize="small" />
              <Typography variant="subtitle1">{resource.title}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Audio resource missing URL.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <HeadphonesIcon fontSize="small" />
            <Typography variant="subtitle1">{resource.title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {formatDuration(resource.duration) ?? ''}
            </Typography>
          </Stack>
          <audio controls src={resource.url} style={{ width: '100%' }}>
            <track kind="captions" />
          </audio>
        </Stack>
      </CardContent>
    </Card>
  );
}

function PdfPreview({ resource }: { resource: RenderableResource }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1} alignItems="flex-start">
          <Stack direction="row" spacing={1} alignItems="center">
            <PictureAsPdfIcon fontSize="small" />
            <Typography variant="subtitle1">{resource.title}</Typography>
          </Stack>
          {resource.url ? (
            <Button
              component="a"
              variant="outlined"
              size="small"
              endIcon={<OpenInNewIcon fontSize="small" />}
              href={resource.url}
              target="_blank"
              rel="noreferrer"
            >
              Open PDF
            </Button>
          ) : (
            <Typography variant="body2" color="text.secondary">
              PDF resource missing URL.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function ImagePreview({ resource }: { resource: RenderableResource }) {
  return (
    <Card variant="outlined">
      {resource.url ? (
        <CardMedia component="img" image={resource.url} alt={resource.title} sx={{ maxHeight: 480 }} />
      ) : (
        <CardContent>
          <Stack spacing={1} alignItems="flex-start">
            <Stack direction="row" spacing={1} alignItems="center">
              <ImageIcon fontSize="small" />
              <Typography variant="subtitle1">{resource.title}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Image resource missing URL.
            </Typography>
          </Stack>
        </CardContent>
      )}
    </Card>
  );
}

function LinkPreview({ resource }: { resource: RenderableResource }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1} alignItems="flex-start">
          <Stack direction="row" spacing={1} alignItems="center">
            <InsertLinkIcon fontSize="small" />
            <Typography variant="subtitle1">{resource.title}</Typography>
          </Stack>
          {resource.url ? (
            <Button
              component="a"
              variant="outlined"
              size="small"
              endIcon={<OpenInNewIcon fontSize="small" />}
              href={resource.url}
              target="_blank"
              rel="noreferrer"
            >
              Open link
            </Button>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Link resource missing URL.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function BlockRenderer({
  block,
  resource,
  previewMode = false,
  onSmartDocProgress,
}: BlockRendererProps) {
  const smartDocProgressHandler = useMemo(() => {
    if (!onSmartDocProgress || block.block_type !== 'smart_doc') return undefined;
    return (progress: SmartDocClientProgress) => onSmartDocProgress(block.id, progress);
  }, [onSmartDocProgress, block.id, block.block_type]);

  if (block.block_type === 'divider') {
    return <Divider sx={{ my: 3 }} />;
  }

  if (block.block_type === 'text') {
    const html = (block.text_md ?? '').trim();
    if (!html) {
      return (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1} alignItems="center" justifyContent="center" sx={{ py: 4 }}>
              <TextSnippetIcon color="disabled" />
              <Typography variant="body2" color="text.secondary">
                Empty text block. Click to edit.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      );
    }

    return (
      <Box
        sx={{
          '& h1, & h2, & h3, & h4, & h5, & h6': {
            fontWeight: 600,
            mt: 3,
            '&:first-of-type': { mt: 0 },
          },
          '& p': {
            mb: 2,
            '&:last-of-type': { mb: 0 },
          },
          '& ul, & ol': {
            pl: 3,
            mb: 2,
            '&:last-of-type': { mb: 0 },
          },
          '& li': {
            mb: 1,
            '&:last-of-type': { mb: 0 },
          },
          '& code': {
            fontFamily: 'monospace',
            backgroundColor: 'action.hover',
            px: 0.5,
            borderRadius: 1,
          },
        }}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
      />
    );
  }

  if (block.block_type === 'smart_doc') {
    if (block.smart_doc_id && previewMode) {
      // pass placement id so inputs can upsert
      return (
        <MemoSmartDocPreview
          docId={block.smart_doc_id}
          contentBlockId={block.id}
          fallbackLabel={block.label}
          onProgressChange={smartDocProgressHandler}
        />
      );
    }

    return (
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="subtitle1">
              {block.label ?? (block.smart_doc_id ? `Smart doc #${block.smart_doc_id}` : 'Smart doc')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {block.smart_doc_id
                ? `Smart doc ID ${block.smart_doc_id}.`
                : 'Smart doc details will appear after it is saved.'}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  if (!resource) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="subtitle1">Missing resource</Typography>
            <Typography variant="body2" color="text.secondary">
              Select a published resource to display here.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  switch (resource.type) {
    case 'video':
      return <VideoPreview resource={resource} />;
    case 'podcast':
    case 'audio':
      return <AudioPreview resource={resource} />;
    case 'pdf':
    case 'document':
      return <PdfPreview resource={resource} />;
    case 'image':
      return <ImagePreview resource={resource} />;
    case 'link':
    default:
      return <LinkPreview resource={resource} />;
  }
}
