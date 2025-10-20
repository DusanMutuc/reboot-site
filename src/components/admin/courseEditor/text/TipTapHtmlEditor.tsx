'use client';

import { useEffect, useRef } from 'react';
import { alpha } from '@mui/material/styles';
import { Box, IconButton, Stack, Tooltip, MenuItem, Select, OutlinedInput } from '@mui/material';

import LooksTwoIcon from '@mui/icons-material/LooksTwo';
import Looks3Icon from '@mui/icons-material/Looks3';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import LinkIcon from '@mui/icons-material/Link';
import CodeIcon from '@mui/icons-material/Code';
import FormatColorFillIcon from '@mui/icons-material/FormatColorFill';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import Paragraph from '@tiptap/extension-paragraph';
import Heading from '@tiptap/extension-heading';

type TipTapHtmlEditorProps = {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  onSubmit?: (html: string) => void;
  onCancel?: () => void;
  initialValue?: string;
  autoFocus?: boolean;
};

export default function TipTapHtmlEditor({
  value,
  onChange,
  onBlur,
  onSubmit,
  onCancel,
  initialValue,
  autoFocus,
}: TipTapHtmlEditorProps) {
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const savedSelRef = useRef<{ from: number; to: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const editor = useEditor({
    extensions: [
      // text styling & fonts
      TextStyle,
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),

      // Block bg color support on paragraph/heading (stored inline on nodes)
      Paragraph.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            backgroundColor: {
              default: null,
              parseHTML: el => el.style.backgroundColor || null,
              renderHTML: attrs =>
                attrs.backgroundColor ? { style: `background-color: ${attrs.backgroundColor}` } : {},
            },
          };
        },
      }),
      Heading.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            backgroundColor: {
              default: null,
              parseHTML: el => el.style.backgroundColor || null,
              renderHTML: attrs =>
                attrs.backgroundColor ? { style: `background-color: ${attrs.backgroundColor}` } : {},
            },
          };
        },
      }).configure({ levels: [2, 3] }),

      // StarterKit v3 includes Link by default; we want custom Link options,
      // so disable it here and add our configured Link below.
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: false,
      }),

      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
    ],

    // v3: the editor won't re-render on every transaction; we want the toolbar to reflect state.
    shouldRerenderOnTransaction: true,

    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'ProseMirror-tip-tap-editor',
      },
    },

    // Prevent SSR hydration mismatches in Next.js App Router
    immediatelyRender: false,

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
    if (normalizedCurrent === nextValue) return;
    const content = nextValue.trim() ? nextValue : '<p></p>';
    editor.commands.setContent(content);
  }, [editor, value]);

  useEffect(() => {
    if (!editor || !autoFocus) return;
    editor.chain().focus('end').run();
  }, [editor, autoFocus]);

  if (!editor) return null;

  const toggleHeading = (level: 2 | 3) => editor.chain().focus().toggleHeading({ level }).run();
  const toggleBold = () => editor.chain().focus().toggleBold().run();
  const toggleItalic = () => editor.chain().focus().toggleItalic().run();
  const toggleBulletList = () => editor.chain().focus().toggleBulletList().run();
  const toggleOrderedList = () => editor.chain().focus().toggleOrderedList().run();
  const toggleCode = () => editor.chain().focus().toggleCode().run();

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

  const FONT_OPTIONS = [
    { label: 'Default', value: '' },
    { label: 'Inter', value: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
    {
      label: 'Roboto Mono',
      value:
        '"Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
  ] as const;

  // TS-safe: set font through TextStyle mark (works with FontFamily)
  const setFont = (family: string) => {
    editor.chain().focus().setMark('textStyle', { fontFamily: family || null }).run();
  };

  // Block background on the current block (heading/paragraph)
  const setBlockBackground = (color: string | null) => {
    const run = editor.chain().focus();
    if (editor.isActive('heading')) {
      run.updateAttributes('heading', { backgroundColor: color }).run();
    } else {
      run.updateAttributes('paragraph', { backgroundColor: color }).run();
    }
  };

  const getCurrentFont = (): string => editor.getAttributes('textStyle')?.fontFamily || '';

  return (
    <Box ref={containerRef}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'wrap' }}>
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

          {/* Font Family selector */}
          <Tooltip title="Font">
          <Select
  size="small"
  value={getCurrentFont()}
  onMouseDownCapture={() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    savedSelRef.current = { from, to };
  }}
  onOpen={() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    savedSelRef.current = { from, to };
  }}
  onChange={(e) => {
    const family = String(e.target.value);
    const sel = savedSelRef.current ?? { from: editor.state.selection.from, to: editor.state.selection.to };
    editor.chain().setTextSelection(sel).focus().setMark('textStyle', { fontFamily: family || null }).run();
    savedSelRef.current = null;
  }}
  MenuProps={{
    disablePortal: true,
    onClose: () => {
      editor?.commands.focus();
    },
  }}
  // ✅ Use OutlinedInput so the `notched` prop stays on a component that expects it
  input={<OutlinedInput />}
  displayEmpty
  sx={(theme) => ({
    ml: 0.5,
    height: 36, // OutlinedInput height
    // keep the font preview on the trigger text
    '& .MuiSelect-select': {
      fontFamily: getCurrentFont() || 'inherit',
      py: 0.25,
    },
    // optional: make the outline look like your previous border
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.divider,
    },
    '&:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.text.secondary,
    },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.primary.main,
    },
  })}
>
  {FONT_OPTIONS.map((opt) => (
    <MenuItem key={opt.label} value={opt.value} sx={{ fontFamily: opt.value || 'inherit' }}>
      {opt.label}
    </MenuItem>
  ))}
</Select>

          </Tooltip>

          {/* Block background color (color wheel) */}
          <Tooltip title="Block background color">
            <IconButton
              size="small"
              aria-label="Block background color"
              onClick={() => colorInputRef.current?.click()}
              onMouseDown={(e) => e.preventDefault()}
              sx={(theme) => ({
                border: '1px solid',
                borderColor: theme.palette.divider,
              })}
            >
              <FormatColorFillIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <input
            ref={colorInputRef}
            type="color"
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
            onChange={(e) => setBlockBackground(e.currentTarget.value)}
          />
          {/* Clear background */}
          <Tooltip title="Clear block background">
            <IconButton
              size="small"
              aria-label="Clear block background"
              onClick={() => setBlockBackground(null)}
              onMouseDown={(e) => e.preventDefault()}
              sx={(theme) => ({
                border: '1px solid',
                borderColor: theme.palette.divider,
              })}
            >
              <FormatColorFillIcon fontSize="small" />
            </IconButton>
          </Tooltip>
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
            onBlur={(e) => {
              // Ignore blur if focus moved somewhere inside our editor UI container (toolbar, select, buttons)
              const next = e.relatedTarget as HTMLElement | null;
              if (next && containerRef.current?.contains(next)) {
                return;
              }
              onBlur?.();
            }}
            onKeyDown={(event) => {
              // TS-safe IME composition check on React SyntheticEvent
              if ((event.nativeEvent as any).isComposing) return;

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
                editor.commands.setContent(content);
                onCancel?.();
              }
            }}
          />
        </Box>
      </Stack>
    </Box>
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
            backgroundColor: active ? alpha(theme.palette.primary.main, 0.2) : theme.palette.action.hover,
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
