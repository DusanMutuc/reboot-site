'use client';

import React, { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { Box, Button, Card, CardContent, CardMedia, CircularProgress, Divider, Stack, TextField, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import InsertLinkIcon from '@mui/icons-material/InsertLink';
import ImageIcon from '@mui/icons-material/Image';
import TextSnippetIcon from '@mui/icons-material/TextSnippet';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

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

export type BlockRendererProps = {
  block: RenderableBlock;
  resource: RenderableResource | null;
  previewMode?: boolean;
};

function SmartDocPromptField({ prompt }: { prompt: SmartDocPrompt }) {
  const label = useMemo(() => prompt.label.trim(), [prompt.label]);
  const helperText = prompt.help_text?.trim().length ? prompt.help_text : undefined;

  return (
    <Stack
      spacing={2}
      sx={{
        px: { xs: 0, sm: 0.5 },
      }}
    >
      <Stack
        spacing={1}
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2.5,
          bgcolor: 'grey.50',
          px: { xs: 2, sm: 2.5 },
          py: { xs: 2, sm: 2.5 },
          boxShadow: 'none',
          gap: 1.5,
        }}
      >
        <Stack spacing={0.75}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
            {label}
            {prompt.required ? (
              <Typography component="span" color="error.main" sx={{ ml: 0.5 }}>
                *
              </Typography>
            ) : null}
          </Typography>
          {helperText ? (
            <Typography variant="body2" color="text.secondary">
              {helperText}
            </Typography>
          ) : null}
        </Stack>
        <TextField
          fullWidth
          variant="outlined"
          multiline={prompt.prompt_type === 'textarea'}
          minRows={prompt.prompt_type === 'textarea' ? 4 : undefined}
          placeholder=""
          InputProps={{
            sx: {
              alignItems: 'flex-start',
              bgcolor: 'common.white',
              borderRadius: 2,
              px: 1.5,
              py: 0,
              '& fieldset': {
                borderColor: 'divider',
              },
              '&:hover fieldset': {
                borderColor: 'grey.400',
              },
              '&.Mui-focused fieldset': {
                borderColor: 'primary.main',
                borderWidth: 2,
              },
              '&.Mui-focused': {
                boxShadow: (theme) => `0 0 0 3px ${alpha(theme.palette.primary.main, 0.2)}`,
              },
              '& .MuiInputBase-input': {
                py: 1.5,
              },
              '& textarea': {
                py: 1.5,
              },
            },
          }}
        />
      </Stack>
    </Stack>
  );
}

function SmartDocPreview({ docId, fallbackLabel }: { docId: number; fallbackLabel: string | null }) {
  const [state, setState] = useState<SmartDocState>({ status: 'idle' });

  useEffect(() => {
    let active = true;

    setState({ status: 'loading' });

    const load = async () => {
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
        const message = error?.message ?? 'Smart doc not found';
        setState({ status: 'error', message });
        return;
      }

      const prompts = (data.smart_doc_prompts ?? [])
        .map((prompt) => ({
          id: prompt.id,
          position: prompt.position,
          label: prompt.label,
          prompt_type: prompt.prompt_type,
          help_text: prompt.help_text,
          required: prompt.required,
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
    };

    void load();

    return () => {
      active = false;
    };
  }, [docId]);

  const containerStyles = {
    bgcolor: 'background.paper',
    px: { xs: 2.5, sm: 4 },
    py: { xs: 3.5, sm: 5 },
    borderRadius: 3,
    boxShadow: 'none',
    border: 'none',
    gap: 4,
  } as const;

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <Stack spacing={2} alignItems="center" justifyContent="center" sx={containerStyles}>
        <CircularProgress size={24} />
        <Typography variant="body2" color="text.secondary">
          Loading smart doc…
        </Typography>
      </Stack>
    );
  }

  if (state.status === 'error') {
    return (
      <Stack spacing={1.5} sx={containerStyles}>
        <Typography variant="h6">{fallbackLabel ?? 'Smart doc'}</Typography>
        <Typography variant="body2" color="error.main">
          Failed to load smart doc: {state.message}
        </Typography>
      </Stack>
    );
  }

  const { doc } = state;
  const headerTitle = doc.title.trim().length > 0 ? doc.title : fallbackLabel ?? 'Smart doc';

  return (
    <Stack spacing={4} sx={containerStyles}>
      <Stack spacing={2}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {headerTitle}
        </Typography>
        {doc.description?.trim().length ? (
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2.5,
              bgcolor: 'grey.50',
              px: { xs: 2, sm: 2.5 },
              py: { xs: 1.75, sm: 2 },
              maxWidth: '72ch',
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <InfoOutlinedIcon color="primary" sx={{ mt: 0.25 }} />
              <Typography variant="body1" color="text.secondary">
                {doc.description}
              </Typography>
            </Stack>
          </Box>
        ) : null}
      </Stack>
      <Stack spacing={doc.prompts.length ? 4 : 2.5}>
        {doc.prompts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            This smart doc has no prompts yet.
          </Typography>
        ) : (
          doc.prompts.map((prompt) => <SmartDocPromptField key={prompt.id} prompt={prompt} />)
        )}
      </Stack>
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

  const frameWrapper = (
    src: string,
    allow: string,
    title: string,
  ) => (
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
        <CardMedia
          component="img"
          image={resource.thumbnail}
          alt={resource.title}
          sx={{ maxHeight: 320, objectFit: 'cover' }}
        />
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
