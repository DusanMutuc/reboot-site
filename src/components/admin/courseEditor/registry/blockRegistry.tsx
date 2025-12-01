'use client';

import { type ReactElement } from 'react';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import type { BlockType } from '@/types/course';

export type BlockDefinition = {
  type: BlockType;
  label: string;
  icon: ReactElement;
};

export const BLOCK_DEFINITIONS: BlockDefinition[] = [
  { type: 'text', label: 'Text block', icon: <TextFieldsIcon fontSize="small" /> },
  { type: 'asset', label: 'Resource block', icon: <VideoLibraryIcon fontSize="small" /> },
  { type: 'divider', label: 'Divider', icon: <HorizontalRuleIcon fontSize="small" /> },
];
