'use client';

import { useEffect } from 'react';
import { Box, IconButton, Stack, Tooltip } from '@mui/material';
import LooksTwoIcon from '@mui/icons-material/LooksTwo';
import Looks3Icon from '@mui/icons-material/Looks3';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import LinkIcon from '@mui/icons-material/Link';
import CodeIcon from '@mui/icons-material/Code';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Markdown from '@tiptap/extension-markdown';

type TipTapMarkdownEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  onBlur?: () => void;
  onEscape?: () => void;
  autoFocus?: boolean;
};

export default function TipTapMarkdownEditor({ value, onChange, onBlur, onEscape, autoFocus }: TipTapMarkdownEditorProps) {
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
      Markdown.configure({
        html: false,
      }),
    ],
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'ProseMirror-tip-tap-editor',
      },
    },
    onUpdate({ editor }) {
      onChange(getMarkdown(editor));
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = getMarkdown(editor);
    const nextValue = value ?? '';
    if (current === nextValue) {
      return;
    }
    setMarkdown(editor, nextValue);
  }, [editor, value]);

  useEffect(() => {
    if (!editor || !autoFocus) return;
    editor.chain().focus('end').run();
  }, [editor, autoFocus]);

  useEffect(() => {
    if (!editor || !onEscape) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && editor.isFocused) {
        event.preventDefault();
        onEscape();
        editor.commands.blur();
      }
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [editor, onEscape]);

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
          '& .ProseMirror': {
            outline: 'none',
            minHeight: 120,
          },
        }}
      >
        <EditorContent
          editor={editor}
          onBlur={() => {
            onBlur?.();
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
        onClick={onClick}
        color={active ? 'primary' : 'default'}
        sx={{ border: '1px solid', borderColor: active ? 'primary.main' : 'divider' }}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}

function getMarkdown(editor: Editor) {
  const storage = (editor.storage as Record<string, unknown>).markdown as
    | { getMarkdown?: () => string }
    | undefined;
  return storage?.getMarkdown?.() ?? '';
}

function setMarkdown(editor: Editor, markdown: string) {
  const commands = editor.commands as unknown as { setMarkdown?: (value: string) => void };
  if (commands.setMarkdown) {
    commands.setMarkdown(markdown);
    return;
  }
  editor.commands.setContent(markdown);
}
