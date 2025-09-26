'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  IconButton,
  Stack,
  Divider,
  Paper,
  InputBase,
  Autocomplete,
  TextField,
  Popper,
  ClickAwayListener,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Popover,
  MenuItem,
  Menu,
  useMediaQuery,
  Skeleton,
  alpha,
  Tooltip,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import ClearIcon from '@mui/icons-material/Clear';
import TuneIcon from '@mui/icons-material/Tune';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import OndemandVideoIcon from '@mui/icons-material/OndemandVideo';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ImageIcon from '@mui/icons-material/Image';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import GridViewIcon from '@mui/icons-material/GridView';
import ViewListIcon from '@mui/icons-material/ViewList';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { supabase } from '@/lib/supabaseClient';
import type { ReactElement } from 'react';


type ResourceTag = { id: number; name: string; category: string | null };
type ResourceRow = {
  id: number;
  title: string;
  description: string | null;
  type: 'video' | 'podcast' | 'pdf' | 'document' | 'audio' | 'image' | 'link';
  url: string;
  thumbnail: string | null;
  duration: number | null;
  created_at: string;
  tags: ResourceTag[] | null;
  score: number | null;
};

const ALL_TYPES: ResourceRow['type'][] = ['video', 'podcast', 'pdf', 'document', 'audio', 'image', 'link'];
const TYPE_ICONS: Record<ResourceRow['type'], ReactElement> = {
  video: <OndemandVideoIcon fontSize="small" />,
  podcast: <HeadphonesIcon fontSize="small" />,
  pdf: <PictureAsPdfIcon fontSize="small" />,
  document: <InsertDriveFileIcon fontSize="small" />,
  audio: <HeadphonesIcon fontSize="small" />,
  image: <ImageIcon fontSize="small" />,
  link: <LinkIcon fontSize="small" />,
};

function formatDuration(totalSeconds?: number | null) {
  if (!totalSeconds || totalSeconds < 1) return '';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
}

function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

type SortValue =
  | 'relevance'
  | 'date_desc'
  | 'date_asc'
  | 'alpha_asc'
  | 'alpha_desc'
  | 'duration_asc'
  | 'duration_desc';
type ViewMode = 'list' | 'grid';
type DurationFilter = 'short' | 'medium' | 'long' | null;
type DateFilter = '30' | '90' | 'all' | null;

const STORAGE_KEY_RECENT = 'reboot.search.recent';
const EMPTY_SUGGESTIONS = ['Templates', 'Replays', 'Assistant'];
const DURATION_OPTIONS: { label: string; value: NonNullable<DurationFilter> }[] = [
  { label: '<10m', value: 'short' },
  { label: '10–30m', value: 'medium' },
  { label: '>30m', value: 'long' },
];
const DATE_RANGE_OPTIONS: { label: string; value: NonNullable<DateFilter> }[] = [
  { label: 'Last 30d', value: '30' },
  { label: 'Last 90d', value: '90' },
  { label: 'All time', value: 'all' },
];

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onSelectRecent: (value: string) => void;
  onSelectTag: (tag: ResourceTag) => void;
  recentSearches: string[];
  popularTags: ResourceTag[];
  sort: SortValue;
  onChangeSort: (value: SortValue) => void;
  mode: 'strict' | 'balanced' | 'loose';
  onChangeMode: (value: 'strict' | 'balanced' | 'loose') => void;
};

function SearchBar({
  value,
  onChange,
  onClear,
  onSelectRecent,
  onSelectTag,
  recentSearches,
  popularTags,
  sort,
  onChangeSort,
  mode,
  onChangeMode,
}: SearchBarProps) {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [advancedAnchor, setAdvancedAnchor] = useState<HTMLElement | null>(null);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsMac(navigator.platform.toUpperCase().includes('MAC'));
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const active = document.activeElement as HTMLElement | null;
        if (active && ['INPUT', 'TEXTAREA'].includes(active.tagName)) return;
        event.preventDefault();
        inputRef.current?.focus();
        setDropdownOpen(true);
      }
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        inputRef.current?.focus();
        setDropdownOpen(true);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const shortcutLabel = isMac ? '⌘K' : 'Ctrl+K';
  const showDropdown = dropdownOpen && (recentSearches.length > 0 || popularTags.length > 0);

  return (
    <ClickAwayListener onClickAway={() => setDropdownOpen(false)}>
      <Box sx={{ position: 'relative' }}>
        <Paper
          ref={containerRef}
          elevation={dropdownOpen ? 6 : 2}
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            borderRadius: 999,
            px: { xs: 2, md: 3 },
            py: { xs: 1, md: 1.25 },
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            width: '100%',
            boxShadow: dropdownOpen ? theme.shadows[6] : theme.shadows[2],
            bgcolor: '#fff',
          }}
        >
          <SearchIcon color="action" sx={{ fontSize: 24 }} />
          <InputBase
            inputRef={inputRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => setDropdownOpen(true)}
            placeholder="Search resources, tags, creators…"
            inputProps={{ 'aria-label': 'Search', role: 'searchbox' }}
            sx={{
              flex: 1,
              fontSize: { xs: '1rem', md: '1.1rem' },
              fontWeight: 500,
            }}
          />
          {value && (
            <Tooltip title="Clear search">
              <IconButton size="small" onClick={onClear} aria-label="Clear search">
                <ClearIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Box
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              alignItems: 'center',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'text.secondary',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.primary.main, 0.08),
            }}
          >
            {shortcutLabel}
          </Box>
          <Tooltip title="Advanced search">
            <IconButton
              size="small"
              onClick={(event) => setAdvancedAnchor(event.currentTarget)}
              aria-label="Open advanced search"
            >
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </Paper>

        <Popper
          open={showDropdown}
          anchorEl={containerRef.current}
          placement="bottom-start"
          modifiers={[{ name: 'offset', options: { offset: [0, 8] } }]}
        >
          <Paper
            sx={{
              width: containerRef.current?.offsetWidth ?? 360,
              maxWidth: '100vw',
              p: 2,
              borderRadius: 2,
              boxShadow: theme.shadows[4],
            }}
          >
            {recentSearches.length > 0 && (
              <Box sx={{ mb: popularTags.length ? 2 : 0 }}>
                <Typography variant="overline" sx={{ color: 'text.secondary' }}>
                  Recent searches
                </Typography>
                <List dense sx={{ py: 0 }}>
                  {recentSearches.map((item) => (
                    <ListItemButton
                      key={item}
                      onClick={() => {
                        onSelectRecent(item);
                        setDropdownOpen(false);
                      }}
                      sx={{ borderRadius: 1.5 }}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <HistoryIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={item} primaryTypographyProps={{ fontSize: '0.95rem' }} />
                      <KeyboardArrowRightIcon fontSize="small" color="disabled" />
                    </ListItemButton>
                  ))}
                </List>
              </Box>
            )}

            {popularTags.length > 0 && (
              <Box>
                <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                  Popular tags
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {popularTags.map((tag) => (
                    <Chip
                      key={tag.id}
                      label={`#${tag.name}`}
                      size="small"
                      onClick={() => {
                        onSelectTag(tag);
                        setDropdownOpen(false);
                      }}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </Paper>
        </Popper>

        <Popover
          open={Boolean(advancedAnchor)}
          anchorEl={advancedAnchor}
          onClose={() => setAdvancedAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{ sx: { p: 2, borderRadius: 2, width: 260 } }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Advanced
          </Typography>
          <Typography variant="caption" sx={{ textTransform: 'uppercase', fontWeight: 600, color: 'text.secondary' }}>
            Sort
          </Typography>
          <Stack direction="row" spacing={1} sx={{ my: 1 }}>
            {[{ label: 'Newest', value: 'date_desc' as SortValue }, { label: 'Relevance', value: 'relevance' as SortValue }].map(
              (option,
            ) => (
              <Chip
                key={option.value}
                label={option.label}
                clickable
                color={sort === option.value ? 'primary' : 'default'}
                variant={sort === option.value ? 'filled' : 'outlined'}
                onClick={() => onChangeSort(option.value)}
                sx={{ borderRadius: 999 }}
              />
            ))}
          </Stack>

          <Divider sx={{ my: 1 }} />

          <Typography variant="caption" sx={{ textTransform: 'uppercase', fontWeight: 600, color: 'text.secondary' }}>
            Fuzziness
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            {[
              { label: 'Strict', value: 'strict' },
              { label: 'Balanced', value: 'balanced' },
              { label: 'Loose', value: 'loose' },
            ].map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                clickable
                color={mode === option.value ? 'primary' : 'default'}
                variant={mode === option.value ? 'filled' : 'outlined'}
                onClick={() => onChangeMode(option.value as 'strict' | 'balanced' | 'loose')}
                sx={{ borderRadius: 999 }}
              />
            ))}
          </Stack>
        </Popover>
      </Box>
    </ClickAwayListener>
  );
}

type FilterChipsProps = {
  selectedTypes: Set<ResourceRow['type']>;
  toggleType: (type: ResourceRow['type']) => void;
  typeCounts: Partial<Record<ResourceRow['type'], number>>;
  durationFilter: DurationFilter;
  onChangeDuration: (value: DurationFilter) => void;
  dateRange: DateFilter;
  onChangeDateRange: (value: DateFilter) => void;
  availableTags: ResourceTag[];
  selectedTagIds: number[];
  onUpdateTags: (ids: number[]) => void;
  onClearFilters: () => void;
};

function FilterChips({
  selectedTypes,
  toggleType,
  typeCounts,
  durationFilter,
  onChangeDuration,
  dateRange,
  onChangeDateRange,
  availableTags,
  selectedTagIds,
  onUpdateTags,
  onClearFilters,
}: FilterChipsProps) {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const selectedTags = useMemo(
    () => availableTags.filter((tag) => selectedTagIds.includes(tag.id)),
    [availableTags, selectedTagIds],
  );

  const handleDurationClick = (value: NonNullable<DurationFilter>) => {
    onChangeDuration(durationFilter === value ? null : value);
  };

  const handleDateClick = (value: NonNullable<DateFilter>) => {
    onChangeDateRange(dateRange === value ? null : value);
  };

  return (
    <Paper
      elevation={0}
      sx={{
        px: 2,
        py: 1.5,
        borderRadius: 3,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
        bgcolor: alpha(theme.palette.primary.light, 0.08),
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            overflowX: 'auto',
            pb: 0.5,
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {ALL_TYPES.map((type) => {
            const count = typeCounts[type];
            return (
              <Chip
                key={type}
                icon={TYPE_ICONS[type]}
                label={count ? `${type.toUpperCase()} (${count})` : type.toUpperCase()}
                onClick={() => toggleType(type)}
                color={selectedTypes.has(type) ? 'primary' : 'default'}
                variant={selectedTypes.has(type) ? 'filled' : 'outlined'}
                sx={{ borderRadius: 999, fontWeight: 600 }}
              />
            );
          })}
          <Chip
            icon={<TuneIcon />}
            label="More filters"
            onClick={(event) => setAnchorEl(event.currentTarget)}
            variant={anchorEl ? 'filled' : 'outlined'}
            color={anchorEl ? 'primary' : 'default'}
            sx={{ borderRadius: 999, flexShrink: 0 }}
          />
        </Box>

        <Button
          size="small"
          onClick={() => {
            onClearFilters();
            setAnchorEl(null);
          }}
          sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
        >
          Reset filters
        </Button>
      </Stack>

      {selectedTags.length > 0 && (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 1 }}>
          {selectedTags.map((tag) => (
            <Chip
              key={tag.id}
              label={`#${tag.name}`}
              size="small"
              onDelete={() => onUpdateTags(selectedTagIds.filter((id) => id !== tag.id))}
              sx={{ borderRadius: 999 }}
            />
          ))}
        </Stack>
      )}

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { p: 2, borderRadius: 2, width: { xs: 280, sm: 360 } } }}
      >
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Duration
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {DURATION_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  clickable
                  color={durationFilter === option.value ? 'primary' : 'default'}
                  variant={durationFilter === option.value ? 'filled' : 'outlined'}
                  onClick={() => handleDurationClick(option.value)}
                  sx={{ borderRadius: 999 }}
                />
              ))}
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Date added
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {DATE_RANGE_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  clickable
                  color={dateRange === option.value ? 'primary' : 'default'}
                  variant={dateRange === option.value ? 'filled' : 'outlined'}
                  onClick={() => handleDateClick(option.value)}
                  sx={{ borderRadius: 999 }}
                />
              ))}
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Tags
            </Typography>
            <Autocomplete
              multiple
              size="small"
              options={availableTags}
              value={selectedTags}
              onChange={(_, newValue) => onUpdateTags(newValue.map((tag) => tag.id))}
              getOptionLabel={(option) => option.name}
              renderInput={(params) => <TextField {...params} label="Select tags" placeholder="Start typing…" />}
            />
          </Box>
        </Stack>
      </Popover>
    </Paper>
  );
}

type ResultRowProps = {
  row: ResourceRow;
  onOpenResource: (row: ResourceRow) => void;
  onSelectTag: (tag: ResourceTag) => void;
  selectedTagIds: number[];
  isMobile: boolean;
};

function ResultRow({ row, onOpenResource, onSelectTag, selectedTagIds, isMobile }: ResultRowProps) {
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(row.url);
    } catch (err) {
      console.error(err);
    }
    setMenuAnchor(null);
  };

  return (
    <Paper
      component="article"
      elevation={0}
      onClick={() => onOpenResource(row)}
      sx={{
        p: 1.5,
        borderRadius: 2,
        display: 'flex',
        gap: 2,
        alignItems: 'stretch',
        cursor: 'pointer',
        transition: 'background-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
        border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
        '&:hover': {
          backgroundColor: alpha(theme.palette.primary.main, 0.05),
          boxShadow: theme.shadows[4],
          transform: 'translateY(-2px)',
        },
      }}
    >
      <Stack alignItems="center" spacing={1} sx={{ minWidth: 56 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: alpha(theme.palette.primary.main, 0.12),
            color: theme.palette.primary.main,
          }}
        >
          {TYPE_ICONS[row.type]}
        </Box>
        {row.duration ? (
          <Chip label={formatDuration(row.duration)} size="small" sx={{ fontWeight: 600 }} />
        ) : null}
      </Stack>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
          {row.title}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ color: 'text.secondary', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Added {new Date(row.created_at).toLocaleDateString()}
          </Typography>
          {(row.tags || []).length ? (
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 16 }} />
          ) : null}
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            {(row.tags || []).map((tag) => (
              <Chip
                key={tag.id}
                label={`#${tag.name}`}
                size="small"
                variant={selectedTagIds.includes(tag.id) ? 'filled' : 'outlined'}
                color={selectedTagIds.includes(tag.id) ? 'primary' : 'default'}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectTag(tag);
                }}
                sx={{ mr: 0.5, mb: 0.5 }}
              />
            ))}
          </Stack>
        </Stack>
      </Box>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ alignSelf: isMobile ? 'flex-start' : 'center' }}>
        {!isMobile && (
          <Button
            variant="outlined"
            size="small"
            endIcon={<OpenInNewIcon fontSize="small" />}
            onClick={(event) => {
              event.stopPropagation();
              onOpenResource(row);
            }}
          >
            Open ↗
          </Button>
        )}
        <IconButton
          size="small"
          aria-label="More actions"
          onClick={(event) => {
            event.stopPropagation();
            setMenuAnchor(event.currentTarget);
          }}
        >
          <MoreVertIcon />
        </IconButton>
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          onClick={(event) => event.stopPropagation()}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {isMobile && (
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
                onOpenResource(row);
              }}
            >
              Open ↗
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              onOpenResource(row);
            }}
          >
            Open in new tab
          </MenuItem>
          <MenuItem onClick={handleCopyLink}>Copy link</MenuItem>
        </Menu>
      </Stack>
    </Paper>
  );
}

type ResultsListProps = {
  results: ResourceRow[];
  loading: boolean;
  onOpenResource: (row: ResourceRow) => void;
  onSelectTag: (tag: ResourceTag) => void;
  selectedTagIds: number[];
  isMobile: boolean;
};

function SkeletonRow() {
  return (
    <Paper sx={{ p: 1.5, borderRadius: 2 }} elevation={0}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Skeleton variant="circular" width={40} height={40} />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" height={22} width="60%" />
          <Skeleton variant="text" height={18} width="40%" />
        </Box>
      </Stack>
    </Paper>
  );
}

function ResultsList({ results, loading, onOpenResource, onSelectTag, selectedTagIds, isMobile }: ResultsListProps) {
  return (
    <Stack spacing={1.5}>
      {loading && !results.length
        ? Array.from({ length: 5 }).map((_, index) => <SkeletonRow key={index} />)
        : results.map((row) => (
            <ResultRow
              key={row.id}
              row={row}
              onOpenResource={onOpenResource}
              onSelectTag={onSelectTag}
              selectedTagIds={selectedTagIds}
              isMobile={isMobile}
            />
          ))}
      {loading && results.length > 0 && Array.from({ length: 2 }).map((_, index) => <SkeletonRow key={`loading-${index}`} />)}
    </Stack>
  );
}

type ResultsGridProps = {
  results: ResourceRow[];
  loading: boolean;
  onOpenResource: (row: ResourceRow) => void;
  onSelectTag: (tag: ResourceTag) => void;
  selectedTagIds: number[];
};

type ResultGridCardProps = {
  row: ResourceRow;
  onOpenResource: (row: ResourceRow) => void;
  onSelectTag: (tag: ResourceTag) => void;
  selectedTagIds: number[];
};

function ResultGridCard({ row, onOpenResource, onSelectTag, selectedTagIds }: ResultGridCardProps) {
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(row.url);
    } catch (err) {
      console.error(err);
    }
    setMenuAnchor(null);
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        cursor: 'pointer',
        '&:hover': {
          boxShadow: theme.shadows[4],
          transform: 'translateY(-2px)',
          backgroundColor: alpha(theme.palette.primary.main, 0.05),
        },
      }}
      onClick={() => onOpenResource(row)}
    >
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: alpha(theme.palette.primary.main, 0.12),
            color: theme.palette.primary.main,
          }}
        >
          {TYPE_ICONS[row.type]}
        </Box>
        <Typography variant="overline" sx={{ letterSpacing: 1 }}>
          {row.type.toUpperCase()}
        </Typography>
        {row.duration ? <Chip label={formatDuration(row.duration)} size="small" sx={{ ml: 'auto' }} /> : null}
      </Stack>

      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {row.title}
      </Typography>

      <Typography variant="body2" color="text.secondary">
        Added {new Date(row.created_at).toLocaleDateString()}
      </Typography>

      <Stack direction="row" spacing={0.5} flexWrap="wrap">
        {(row.tags || []).map((tag) => (
          <Chip
            key={tag.id}
            label={`#${tag.name}`}
            size="small"
            variant={selectedTagIds.includes(tag.id) ? 'filled' : 'outlined'}
            color={selectedTagIds.includes(tag.id) ? 'primary' : 'default'}
            onClick={(event) => {
              event.stopPropagation();
              onSelectTag(tag);
            }}
          />
        ))}
      </Stack>

      <Divider sx={{ my: 1 }} />

      <Stack direction="row" spacing={1} alignItems="center">
        <Button
          size="small"
          variant="outlined"
          endIcon={<OpenInNewIcon fontSize="small" />}
          onClick={(event) => {
            event.stopPropagation();
            onOpenResource(row);
          }}
        >
          Open ↗
        </Button>
        <IconButton
          size="small"
          aria-label="More actions"
          onClick={(event) => {
            event.stopPropagation();
            setMenuAnchor(event.currentTarget);
          }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          onClick={(event) => event.stopPropagation()}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              onOpenResource(row);
            }}
          >
            Open in new tab
          </MenuItem>
          <MenuItem onClick={handleCopy}>Copy link</MenuItem>
        </Menu>
      </Stack>
    </Paper>
  );
}

function ResultsGrid({ results, loading, onOpenResource, onSelectTag, selectedTagIds }: ResultsGridProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
        gap: 2,
      }}
    >
      {results.map((row) => (
        <ResultGridCard
          key={row.id}
          row={row}
          onOpenResource={onOpenResource}
          onSelectTag={onSelectTag}
          selectedTagIds={selectedTagIds}
        />
      ))}

      {loading &&
        Array.from({ length: 3 }).map((_, index) => (
          <Paper key={`grid-skeleton-${index}`} sx={{ p: 2, borderRadius: 2 }} elevation={0}>
            <Skeleton variant="text" height={24} width="70%" />
            <Skeleton variant="text" height={18} width="50%" />
            <Skeleton variant="rectangular" height={64} sx={{ mt: 1 }} />
          </Paper>
        ))}
    </Box>
  );
}

const EmptyState = ({ onSuggest }: { onSuggest: (value: string) => void }) => (
  <Box sx={{ textAlign: 'center', py: 6 }}>
    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
      No results
    </Typography>
    <Typography color="text.secondary" sx={{ mb: 2 }}>
      Try another keyword, adjust filters, or choose one of these popular topics.
    </Typography>
    <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap">
      {EMPTY_SUGGESTIONS.map((suggestion) => (
        <Chip key={suggestion} label={`Try: ${suggestion}`} onClick={() => onSuggest(suggestion)} />
      ))}
    </Stack>
  </Box>
);

export default function Search() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);
  const [selectedTypes, setSelectedTypes] = useState<Set<ResourceRow['type']>>(new Set());
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [sort, setSort] = useState<SortValue>('relevance');
  const [mode, setMode] = useState<'strict' | 'balanced' | 'loose'>('balanced');
  const [durationFilter, setDurationFilter] = useState<DurationFilter>(null);
  const [dateRange, setDateRange] = useState<DateFilter>('all');

  const PAGE = 9;
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<ResourceRow[]>([]);
  const [totalGuess, setTotalGuess] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [broadening, setBroadening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [popularTags, setPopularTags] = useState<ResourceTag[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  useEffect(() => {
    if (isMobile) setViewMode('list');
  }, [isMobile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY_RECENT);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setRecentSearches(parsed.filter((item) => typeof item === 'string'));
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    const trimmed = debouncedQ.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      if (prev[0]?.toLowerCase() === trimmed.toLowerCase()) return prev;
      const next = [trimmed, ...prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 5);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(next));
      }
      return next;
    });
  }, [debouncedQ]);

  useEffect(() => {
    if (!debouncedQ.trim() && sort === 'relevance') setSort('date_desc');
    if (debouncedQ.trim() && sort === 'date_desc') setSort('relevance');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('tag_usage')
        .select('id,name,category')
        .order('usage_count', { ascending: false })
        .limit(20);
      if (!error && data) setPopularTags(data as ResourceTag[]);
    })();
  }, []);

  const _typesArg = useMemo(() => (selectedTypes.size ? Array.from(selectedTypes) : null), [selectedTypes]);
  const runningRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      const runId = ++runningRef.current;

      const args: Record<string, unknown> = {
        _q: debouncedQ,
        _types: _typesArg,
        _tag_ids: selectedTagIds.length ? selectedTagIds : null,
        _duration: durationFilter ?? null,
        _date_range: dateRange && dateRange !== 'all' ? dateRange : null,
        _sort: sort,
        _limit: PAGE,
        _offset: page * PAGE,
        _mode: mode,
      };

      const { data, error } = await supabase.rpc('search_resources', args);
      if (cancelled || runId !== runningRef.current) return;

      if (error) {
        setError(error.message);
        setResults([]);
        setLoading(false);
        return;
      }

      const rows = (data || []) as ResourceRow[];
      setResults(rows);
      setTotalGuess(rows.length < PAGE ? page * PAGE + rows.length : null);

      if (debouncedQ.trim().length >= 3 && rows.length < 5 && mode !== 'loose') {
        setBroadening(true);
        const { data: data2 } = await supabase.rpc('search_resources', { ...args, _mode: 'loose' });
        if (!cancelled && data2) {
          setResults(data2 as ResourceRow[]);
          setMode('loose');
        }
        setBroadening(false);
      }

      if (page === 0) {
        supabase
          .auth
          .getUser()
          .then(({ data: u }) => {
            const userId = u?.user?.id;
            if (userId) {
              supabase
                .from('search_analytics')
                .insert({
                  query: debouncedQ,
                  results_count: (data as any[])?.length ?? 0,
                  user_id: userId,
                })
                .then(() => undefined);
            }
          });
      }

      setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, _typesArg, selectedTagIds, durationFilter, dateRange, sort, page, mode]);

  const toggleType = (type: ResourceRow['type']) => {
    setPage(0);
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleUpdateTags = (ids: number[]) => {
    setPage(0);
    setSelectedTagIds(ids);
  };

  const onClickTag = (tag: ResourceTag) => {
    setPage(0);
    setSelectedTagIds((prev) => (prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]));
  };

  const onOpenResource = async (row: ResourceRow) => {
    const { data: u } = await supabase.auth.getUser();
    const userId = u?.user?.id;
    if (userId) {
      supabase.from('resource_access').insert({ resource_id: row.id, user_id: userId }).then(() => undefined);
    }
    window.open(row.url, '_blank', 'noopener,noreferrer');
  };

  const clearQuery = () => {
    setQ('');
    setPage(0);
    setMode('balanced');
  };

  const clearFilters = () => {
    setSelectedTypes(new Set());
    setSelectedTagIds([]);
    setDurationFilter(null);
    setDateRange('all');
    setPage(0);
  };

  const selectionActive =
    Boolean(debouncedQ.trim()) ||
    selectedTagIds.length > 0 ||
    selectedTypes.size > 0 ||
    durationFilter !== null ||
    (dateRange !== null && dateRange !== 'all');

  const resultCountText = useMemo(() => {
    if (loading && !results.length) return 'Searching…';
    if (!selectionActive && !results.length) return 'Browse recent';
    const n = totalGuess ?? page * PAGE + results.length;
    return `${n} result${n === 1 ? '' : 's'}`;
  }, [loading, results.length, selectionActive, page, totalGuess]);

  const typeCounts = useMemo(() => {
    const counts: Partial<Record<ResourceRow['type'], number>> = {};
    results.forEach((row) => {
      counts[row.type] = (counts[row.type] ?? 0) + 1;
    });
    return counts;
  }, [results]);

  const availableTagOptions = useMemo(() => {
    const map = new Map<number, ResourceTag>();
    popularTags.forEach((tag) => map.set(tag.id, tag));
    results.forEach((row) => {
      (row.tags || []).forEach((tag) => map.set(tag.id, tag));
    });
    selectedTagIds.forEach((id) => {
      if (!map.has(id)) map.set(id, { id, name: `Tag ${id}`, category: null });
    });
    return Array.from(map.values());
  }, [popularTags, results, selectedTagIds]);

  const handleSelectSuggestion = (value: string) => {
    setQ(value);
    setPage(0);
  };

  return (
    <Box sx={{ bgcolor: '#f5faf8', minHeight: '100vh', py: { xs: 2, md: 4 } }}>
      <Stack spacing={3} sx={{ maxWidth: 1080, mx: 'auto', px: { xs: 2, md: 4 } }}>
        <SearchBar
          value={q}
          onChange={(value) => {
            setQ(value);
            setPage(0);
            if (!value) setMode('balanced');
          }}
          onClear={clearQuery}
          onSelectRecent={handleSelectSuggestion}
          onSelectTag={onClickTag}
          recentSearches={recentSearches}
          popularTags={popularTags}
          sort={sort}
          onChangeSort={(value) => {
            setSort(value);
            setPage(0);
          }}
          mode={mode}
          onChangeMode={(value) => {
            setMode(value);
            setPage(0);
          }}
        />

        <FilterChips
          selectedTypes={selectedTypes}
          toggleType={toggleType}
          typeCounts={typeCounts}
          durationFilter={durationFilter}
          onChangeDuration={(value) => {
            setDurationFilter(value);
            setPage(0);
          }}
          dateRange={dateRange}
          onChangeDateRange={(value) => {
            setDateRange(value);
            setPage(0);
          }}
          availableTags={availableTagOptions}
          selectedTagIds={selectedTagIds}
          onUpdateTags={handleUpdateTags}
          onClearFilters={clearFilters}
        />

        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, md: 3 },
            borderRadius: 3,
            bgcolor: '#fff',
            boxShadow: '0px 24px 48px rgba(15, 40, 34, 0.08)',
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {resultCountText}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              {broadening && (
                <Typography color="text.secondary" sx={{ fontStyle: 'italic', fontSize: '0.875rem' }}>
                  Including broader matches…
                </Typography>
              )}
              {!isMobile && (
                <Stack direction="row" spacing={0.5}>
                  <IconButton
                    size="small"
                    color={viewMode === 'list' ? 'primary' : 'default'}
                    onClick={() => setViewMode('list')}
                    aria-label="List view"
                  >
                    <ViewListIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    color={viewMode === 'grid' ? 'primary' : 'default'}
                    onClick={() => setViewMode('grid')}
                    aria-label="Grid view"
                  >
                    <GridViewIcon />
                  </IconButton>
                </Stack>
              )}
            </Stack>
          </Stack>

          {error && (
            <Typography color="error" sx={{ mb: 2 }}>
              {error}
            </Typography>
          )}

          {loading && !results.length && <ResultsList results={[]} loading onOpenResource={onOpenResource} onSelectTag={onClickTag} selectedTagIds={selectedTagIds} isMobile={isMobile} />}

          {!loading && results.length === 0 && !error && <EmptyState onSuggest={handleSelectSuggestion} />}

          {results.length > 0 && (
            <Fragment>
              {viewMode === 'grid' && !isMobile ? (
                <ResultsGrid
                  results={results}
                  loading={loading}
                  onOpenResource={onOpenResource}
                  onSelectTag={onClickTag}
                  selectedTagIds={selectedTagIds}
                />
              ) : (
                <ResultsList
                  results={results}
                  loading={loading}
                  onOpenResource={onOpenResource}
                  onSelectTag={onClickTag}
                  selectedTagIds={selectedTagIds}
                  isMobile={isMobile}
                />
              )}
            </Fragment>
          )}

          {(results.length === PAGE || page > 0) && (
            <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 3 }}>
              <Button variant="outlined" disabled={page === 0} onClick={() => setPage((prev) => Math.max(0, prev - 1))}>
                Previous
              </Button>
              <Button
                variant="contained"
                onClick={() => setPage((prev) => prev + 1)}
                disabled={results.length < PAGE}
              >
                Next
              </Button>
            </Stack>
          )}
        </Paper>
      </Stack>
    </Box>
  );
}
