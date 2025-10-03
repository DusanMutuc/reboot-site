'use client';

import React from 'react';
import { Box, Button, Card, CardContent, CardMedia, Divider, Stack, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import InsertLinkIcon from '@mui/icons-material/InsertLink';
import ImageIcon from '@mui/icons-material/Image';
import TextSnippetIcon from '@mui/icons-material/TextSnippet';

export type RenderableBlock = {
  id: number;
  block_type: 'text' | 'asset' | 'divider';
  position: number;
  text_md: string | null;
  resource_id: number | null;
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

export type BlockRendererProps = {
  block: RenderableBlock;
  resource: RenderableResource | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function applyInlineFormatting(value: string) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderMarkdownToElements(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let bullet: string[] = [];
  let ordered: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ');
    elements.push(
      <Typography
        key={`p-${elements.length}`}
        component="p"
        sx={{ mb: 2, '&:last-of-type': { mb: 0 } }}
        dangerouslySetInnerHTML={{ __html: applyInlineFormatting(text) }}
      />,
    );
    paragraph = [];
  };

  const flushBullet = () => {
    if (bullet.length === 0) return;
    elements.push(
      <Box component="ul" key={`ul-${elements.length}`} sx={{ pl: 3, mb: 2 }}>
        {bullet.map((item, idx) => (
          <Box
            component="li"
            key={`ul-item-${elements.length}-${idx}`}
            dangerouslySetInnerHTML={{ __html: applyInlineFormatting(item) }}
          />
        ))}
      </Box>,
    );
    bullet = [];
  };

  const flushOrdered = () => {
    if (ordered.length === 0) return;
    elements.push(
      <Box component="ol" key={`ol-${elements.length}`} sx={{ pl: 3, mb: 2 }}>
        {ordered.map((item, idx) => (
          <Box
            component="li"
            key={`ol-item-${elements.length}-${idx}`}
            dangerouslySetInnerHTML={{ __html: applyInlineFormatting(item) }}
          />
        ))}
      </Box>,
    );
    ordered = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushBullet();
      flushOrdered();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushBullet();
      flushOrdered();
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const variant = level === 1 ? 'h4' : level === 2 ? 'h5' : 'h6';
      elements.push(
        <Typography
          key={`heading-${elements.length}`}
          variant={variant as 'h4' | 'h5' | 'h6'}
          sx={{ mt: elements.length === 0 ? 0 : 3, mb: 1.5 }}
          dangerouslySetInnerHTML={{ __html: applyInlineFormatting(content) }}
        />,
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      flushOrdered();
      bullet.push(trimmed.replace(/^[-*]\s+/, ''));
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      flushBullet();
      ordered.push(orderedMatch[2]);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushBullet();
  flushOrdered();

  if (elements.length === 0) {
    return [
      <Typography
        key="empty"
        component="p"
        sx={{ mb: 0 }}
        dangerouslySetInnerHTML={{ __html: applyInlineFormatting(markdown) }}
      />,
    ];
  }

  return elements;
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

export function BlockRenderer({ block, resource }: BlockRendererProps) {
  if (block.block_type === 'divider') {
    return <Divider sx={{ my: 3 }} />;
  }

  if (block.block_type === 'text') {
    const markdown = block.text_md ?? '';
    if (!markdown.trim()) {
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

    return <Stack spacing={1.5}>{renderMarkdownToElements(markdown)}</Stack>;
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
