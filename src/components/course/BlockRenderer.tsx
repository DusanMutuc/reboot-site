'use client';

import React, { useEffect, useMemo, useState } from 'react';
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

/** ---------- Shared field/label styles (unifies look across the page) ---------- */
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
  fontSize: '1.6rem',   // slightly larger than body text
  lineHeight: 1.3,
  color: 'text.primary',
  mb: 1,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
} as const;


/** --------------------------------------------------------------------------- */

export type BlockRendererProps = {
  block: RenderableBlock;
  resource: RenderableResource | null;
  previewMode?: boolean;
};

function SmartDocPromptField({ prompt }: { prompt: SmartDocPrompt }) {
  const isTextarea = prompt.prompt_type === 'textarea';
  const label = useMemo(() => prompt.label?.trim() || 'Question', [prompt.label]);
  const helper = prompt.help_text?.trim();

  return (
    <FormControl fullWidth sx={{ mb: 4 }}>
      <FormLabel sx={LABEL_SX}>
        {label}
        {prompt.required && (
          <Box component="span" sx={{ color: 'error.main', lineHeight: 1 }}>
            *
          </Box>
        )}
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
      />
    </FormControl>
  );
}

function SmartDocPreview({ docId, fallbackLabel }: { docId: number; fallbackLabel: string | null }) {
  const [state, setState] = useState<SmartDocState>({ status: 'idle' });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });

    (async () => {
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
    // coerce null → empty string to satisfy SmartDocPrompt.label: string
    label: p.label ?? '',
    prompt_type: p.prompt_type,
    help_text: p.help_text,
    required: p.required,
  }))
  .sort((a, b) => a.position - b.position);


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
    })();

    return () => {
      active = false;
    };
  }, [docId]);

  const wrapSx = { maxWidth: 920, mx: 'auto', px: { xs: 2, sm: 0 } } as const;

switch (state.status) {
  case 'idle':
  case 'loading':
    return (
      <Stack spacing={2} alignItems="center" justifyContent="center" sx={{ ...wrapSx, py: 4 }}>
        <CircularProgress size={22} />
        <Typography variant="body2" color="text.secondary">
          Loading…
        </Typography>
      </Stack>
    );

  case 'error':
    return (
      <Stack spacing={1} sx={{ ...wrapSx, py: 2 }}>
        <Typography variant="h6">{fallbackLabel ?? 'Smart doc'}</Typography>
        <Typography variant="body2" color="error.main">
          Failed to load: {state.message}
        </Typography>
      </Stack>
    );

  case 'ready':
    break;
}

const { doc } = state; // safely narrowed to 'ready'
const title = doc.title?.trim() || fallbackLabel || 'Smart doc';


  return (
    <Stack spacing={3} sx={wrapSx}>
      {/* Section title */}
      <Typography
        component="h2"
        variant="h2"
        sx={{ fontWeight: 650, fontSize: { xs: '1.35rem', sm: '2rem' }, lineHeight: 1.25 }}
      >
        {title}
      </Typography>

      {/* Optional description box */}
      {/* Optional description – plain text under title */}
{doc.description?.trim() && (
  <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720 }}>
    {doc.description}
  </Typography>
)}


      {/* Prompts */}
      <Box>
        {doc.prompts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No questions yet.
          </Typography>
        ) : (
          doc.prompts.map((p: SmartDocPrompt) => (
            <SmartDocPromptField key={p.id} prompt={p} />
          ))
          
        )}
      </Box>
    </Stack>
  );
}

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
      // fall back to card preview below
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

export function BlockRenderer({ block, resource, previewMode = false }: BlockRendererProps) {
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
      return <SmartDocPreview docId={block.smart_doc_id} fallbackLabel={block.label} />;
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
