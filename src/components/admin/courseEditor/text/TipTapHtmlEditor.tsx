'use client';

import { useEffect, useRef } from 'react';
import { alpha } from '@mui/material/styles';
import { Box, IconButton, Stack, Tooltip } from '@mui/material';
import LooksTwoIcon from '@mui/icons-material/LooksTwo';
import Looks3Icon from '@mui/icons-material/Looks3';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import LinkIcon from '@mui/icons-material/Link';
import CodeIcon from '@mui/icons-material/Code';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';

type TipTapHtmlEditorProps = {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  onSubmit?: (html: string) => void;
  onCancel?: () => void;
  initialValue?: string;
  autoFocus?: boolean;
  fontFamily?: string | null;
  backgroundColor?: string | null;
};

export default function TipTapHtmlEditor({
  value,
  onChange,
  onBlur,
  onSubmit,
  onCancel,
  initialValue,
  autoFocus,
  fontFamily,
  backgroundColor,
}: TipTapHtmlEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
    ],
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'ProseMirror-tip-tap-editor',
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      onChange(html === '<p></p>' ? '' : html);
    },
  });

  const initialContentRef = useRef(initialValue ?? '');

  useEffect(() => {
    initialContentRef.current = initialValue ?? '';
  }, [initialValue]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const normalizedCurrent = current === '<p></p>' ? '' : current;
    const nextValue = value ?? '';
    if (normalizedCurrent === nextValue) {
      return;
    }
    const content = nextValue.trim() ? nextValue : '<p></p>';
    editor.commands.setContent(content, false);
  }, [editor, value]);

  useEffect(() => {
    if (!editor || !autoFocus) return;
    editor.chain().focus('end').run();
  }, [editor, autoFocus]);

  if (!editor) {
    return null;
  }

  const toggleHeading = (level: 2 | 3) => {
    editor.chain().focus().toggleHeading({ level }).run();
  };

  const toggleBold = () => {
    editor.chain().focus().toggleBold().run();
  };

  const toggleItalic = () => {
    editor.chain().focus().toggleItalic().run();
  };

  const toggleBulletList = () => {
    editor.chain().focus().toggleBulletList().run();
  };

  const toggleOrderedList = () => {
    editor.chain().focus().toggleOrderedList().run();
  };

  const toggleCode = () => {
    editor.chain().focus().toggleCode().run();
  };

  const handleLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Enter URL', previous ?? '');
    if (url === null) return;
    if (!url) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const isHeadingActive = (level: 2 | 3) => editor.isActive('heading', { level });

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <ToolbarButton tooltip="Heading 2" onClick={() => toggleHeading(2)} active={isHeadingActive(2)}>
          <LooksTwoIcon fontSize="small" />
        </ToolbarButton>
        <ToolbarButton tooltip="Heading 3" onClick={() => toggleHeading(3)} active={isHeadingActive(3)}>
          <Looks3Icon fontSize="small" />
        </ToolbarButton>
        <ToolbarButton tooltip="Bold" onClick={toggleBold} active={editor.isActive('bold')}>
          <FormatBoldIcon fontSize="small" />
        </ToolbarButton>
        <ToolbarButton tooltip="Italic" onClick={toggleItalic} active={editor.isActive('italic')}>
          <FormatItalicIcon fontSize="small" />
        </ToolbarButton>
        <ToolbarButton tooltip="Bullet list" onClick={toggleBulletList} active={editor.isActive('bulletList')}>
          <FormatListBulletedIcon fontSize="small" />
        </ToolbarButton>
        <ToolbarButton tooltip="Numbered list" onClick={toggleOrderedList} active={editor.isActive('orderedList')}>
          <FormatListNumberedIcon fontSize="small" />
        </ToolbarButton>
        <ToolbarButton tooltip="Link" onClick={handleLink} active={editor.isActive('link')}>
          <LinkIcon fontSize="small" />
        </ToolbarButton>
        <ToolbarButton tooltip="Code" onClick={toggleCode} active={editor.isActive('code')}>
          <CodeIcon fontSize="small" />
        </ToolbarButton>
      </Stack>
      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          p: 2,
          backgroundColor: backgroundColor ?? 'background.paper',
          '& .ProseMirror': {
            outline: 'none',
            minHeight: 120,
            fontFamily: fontFamily ?? undefined,
            backgroundColor: 'transparent',
          },
        }}
      >
        <EditorContent
          editor={editor}
          onBlur={() => {
            onBlur?.();
          }}
          onKeyDown={(event) => {
            if (event.isComposing) {
              return;
            }
            if (event.key === 'Enter') {
              if (event.shiftKey) {
                event.preventDefault();
                editor.chain().focus().setHardBreak().run();
                return;
              }
              event.preventDefault();
              const html = editor.getHTML();
              onSubmit?.(html === '<p></p>' ? '' : html);
              return;
            }
            if (event.key === 'Escape') {
              if (!editor.isFocused) return;
              event.preventDefault();
              const initial = initialContentRef.current;
              const content = initial && initial.trim().length > 0 ? initial : '<p></p>';
              editor.commands.setContent(content, false);
              onCancel?.();
            }
          }}
        />
      </Box>
    </Stack>
  );
}

type ToolbarButtonProps = {
  tooltip: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
};

function ToolbarButton({ tooltip, onClick, active, children }: ToolbarButtonProps) {
  return (
    <Tooltip title={tooltip}>
      <IconButton
        size="small"
        aria-label={tooltip}
        onClick={onClick}
        aria-pressed={active || false}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        sx={(theme) => ({
          border: '1px solid',
          borderColor: active ? theme.palette.primary.main : theme.palette.divider,
          backgroundColor: active ? alpha(theme.palette.primary.main, 0.12) : 'transparent',
          color: active ? theme.palette.primary.main : theme.palette.text.primary,
          transition: theme.transitions.create(['background-color', 'border-color', 'color'], {
            duration: theme.transitions.duration.shortest,
          }),
          '&:hover': {
            backgroundColor: active
              ? alpha(theme.palette.primary.main, 0.2)
              : theme.palette.action.hover,
          },
          '&.Mui-focusVisible': {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: 2,
          },
        })}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}
